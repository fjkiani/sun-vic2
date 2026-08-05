// Provider / model capability map — SINGLE SOURCE OF TRUTH for:
//   1. Max OUTPUT tokens a given provider+model will accept (fixes the class of
//      bug where we requested max_tokens=12000 from Cohere command-a, whose hard
//      output ceiling is 8192 → HTTP 400 on every generate call).
//   2. Whether a provider+model supports tool/function calling (drives the agent
//      tool-loop vs oneshot fallback decision).
//   3. The ordered fallback chain used when the primary provider fails, so a
//      single provider outage (quota, 4xx, 5xx) does not block document
//      generation.
//
// This module is imported by both the provider layer (W1) and the generation
// layer (W2). Keep it dependency-free (no network, no db) so it is trivially
// unit-testable and safe to import anywhere.

// ────────────────────────────────────────────────────────────
// Output-token ceilings.
// Values are the MAX COMPLETION tokens the endpoint will accept without 4xx.
// Conservative: we clamp requests to <= these numbers. Sourced from provider
// docs + live probing (openrouter.ai/api/v1/models `top_provider.max_completion_tokens`).
// ────────────────────────────────────────────────────────────

// Cohere: command-a-03-2025 hard-caps completion at 8192.
const COHERE_MAX_OUTPUT = 8192;

// Per-model overrides for OpenRouter (keyed by exact model id).
// Values are the max_tokens WE request (kept modest — a full document payload is
// well under 16k output tokens; we never need the model's full ceiling and large
// requests can be rejected by :free tiers). Verified live against
// openrouter.ai/api/v1/models top_provider.max_completion_tokens.
const OPENROUTER_MODEL_MAX_OUTPUT = {
  'tencent/hy3:free': 16384,                        // ceiling 262144
  'google/gemma-4-31b-it:free': 16384,              // ceiling 32768
  'google/gemma-4-26b-a4b-it:free': 16384,          // ceiling 32768
  'openai/gpt-oss-20b:free': 16384,                 // ceiling 32768
  'cohere/north-mini-code:free': 16384,             // ceiling 64000
  'nvidia/nemotron-3-super-120b-a12b:free': 16384,  // ceiling 262144
  'nvidia/nemotron-nano-9b-v2:free': 8192,          // ceiling unspecified → conservative
  'poolside/laguna-m.1:free': 16384,                // ceiling 32768
  'openrouter/free': 8192,                          // meta-router: unknown downstream
};
// Safe floor for any OpenRouter model we don't have an explicit entry for.
const OPENROUTER_DEFAULT_MAX_OUTPUT = 8192;

// Gemma (Google AI Studio direct) — generous but we never generate huge docs.
const GEMMA_MAX_OUTPUT = 8192;

/**
 * Max completion tokens accepted by a provider+model.
 * @param {string} providerId 'cohere' | 'openrouter' | 'gemma'
 * @param {string} [model]
 * @returns {number}
 */
export function maxOutputTokens(providerId, model) {
  switch ((providerId || '').toLowerCase()) {
    case 'cohere':
      return COHERE_MAX_OUTPUT;
    case 'openrouter':
      return (model && OPENROUTER_MODEL_MAX_OUTPUT[model]) || OPENROUTER_DEFAULT_MAX_OUTPUT;
    case 'gemma':
      return GEMMA_MAX_OUTPUT;
    default:
      return OPENROUTER_DEFAULT_MAX_OUTPUT;
  }
}

/**
 * Clamp a desired max_tokens to what the provider+model actually accepts.
 * Never returns less than `floor` (so we don't accidentally starve output).
 * @param {number} desired
 * @param {string} providerId
 * @param {string} [model]
 * @param {number} [floor=1024]
 * @returns {number}
 */
export function clampMaxTokens(desired, providerId, model, floor = 1024) {
  const cap = maxOutputTokens(providerId, model);
  const want = Number.isFinite(desired) && desired > 0 ? desired : cap;
  return Math.max(Math.min(want, cap), Math.min(floor, cap));
}

// ────────────────────────────────────────────────────────────
// Tool-calling support.
// ────────────────────────────────────────────────────────────

// OpenRouter free models that reliably accept our OpenAI-format tool schema.
// (verified live: these expose `supported_parameters` incl. tools/tool_choice)
const OPENROUTER_TOOL_MODELS = new Set([
  'tencent/hy3:free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'openai/gpt-oss-20b:free',
  'cohere/north-mini-code:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'poolside/laguna-m.1:free',
  'poolside/laguna-xs-2.1:free',
]);

/**
 * Whether a provider+model supports tool/function calling.
 * @param {string} providerId
 * @param {string} [model]
 * @returns {boolean}
 */
export function supportsTools(providerId, model) {
  switch ((providerId || '').toLowerCase()) {
    case 'cohere':
      return true; // command-a supports tools
    case 'gemma':
      return false; // Gemma direct: no tools
    case 'openrouter':
      // meta-router: assume tools OK (we constrain with require_parameters)
      if (typeof model === 'string' && model.startsWith('openrouter/')) return true;
      // explicit known-good models
      if (model && OPENROUTER_TOOL_MODELS.has(model)) return true;
      // default free model supports tools
      if (!model) return true;
      // unknown model: be optimistic but callers should catch tool errors
      return true;
    default:
      return false;
  }
}

// ────────────────────────────────────────────────────────────
// Fallback chain.
// Ordered list of { providerId, model } tried in sequence when the primary
// fails. All entries are FREE + TOOL-CAPABLE so both the agent tool-loop and
// the oneshot generator can use the same chain.
//
// Rationale for order (all ids verified live-present + tool-capable on
// OpenRouter as of 2026-07; the previously-used meta-llama/llama-3.3-70b:free
// has been DELISTED as a free model, hence Tencent leads the free tier):
//   1. Whatever the caller explicitly picked (primary) — tried first, outside
//      this list (see buildFallbackChain).
//   2. cohere/command-a — highest quality, user-key gated.
//   3. openrouter tencent/hy3:free — user asked for a Tencent free model; large
//      ctx (262k) + tools + generous output. Lead free fallback.
//   4. openrouter gemma-4-31b:free — different vendor family for independence.
//   5. openrouter nemotron-3-super-120b:free — large NVIDIA free model.
//   6. openrouter gpt-oss-20b:free — small OpenAI OSS, last resort.
// ────────────────────────────────────────────────────────────

export const DEFAULT_FALLBACK_CHAIN = [
  { providerId: 'cohere', model: 'command-a-03-2025' },
  { providerId: 'openrouter', model: 'google/gemma-4-31b-it:free' },
  { providerId: 'openrouter', model: 'nvidia/nemotron-3-super-120b-a12b:free' },
  { providerId: 'openrouter', model: 'openai/gpt-oss-20b:free' },
];

/**
 * Build an ordered, de-duplicated fallback chain that starts with the caller's
 * explicit choice, then appends the default chain (skipping duplicates and any
 * provider the caller has no key for — key-filtering is done by the caller,
 * which knows `hasKey(providerId)`).
 *
 * @param {{providerId:string, model?:string}} primary
 * @param {(providerId:string)=>boolean} [hasKey] optional predicate; entries for
 *        providers without a key are dropped.
 * @returns {Array<{providerId:string, model:string}>}
 */
export function buildFallbackChain(primary, hasKey) {
  const chain = [];
  const seen = new Set();
  const push = (entry) => {
    if (!entry || !entry.providerId) return;
    const key = `${entry.providerId}:${entry.model || ''}`;
    if (seen.has(key)) return;
    if (hasKey && !hasKey(entry.providerId)) return;
    seen.add(key);
    chain.push({ providerId: entry.providerId, model: entry.model });
  };
  if (primary && primary.providerId) push(primary);
  for (const entry of DEFAULT_FALLBACK_CHAIN) push(entry);
  return chain;
}

// Error classes that SHOULD trigger a fallback to the next provider (transient
// or provider-specific, not a bug in our payload). Used by the generation layer.
export function isFallbackableError(err) {
  const status = err?.status || 0;
  const msg = String(err?.message || '').toLowerCase();
  // 429 rate limit / quota, 5xx server, 402 payment/credits, 408 timeout.
  if ([402, 408, 429, 500, 502, 503, 504].includes(status)) return true;
  // Cohere hallucinated-all-tool-calls (422) — retry on a different model.
  if (status === 422 && msg.includes('hallucinated')) return true;
  // Provider-side model/context complaints that another model may not have.
  if (msg.includes('quota') || msg.includes('rate limit') || msg.includes('overloaded')) return true;
  if (msg.includes('no endpoints found') || msg.includes('not available')) return true;
  // A free slug that has been delisted or moved behind payment. OpenRouter answers 404
  // with "This model is unavailable for free." Twice now a pinned free slug has died
  // this way, and because 404 was not classified fallbackable the chain surfaced a hard
  // failure instead of advancing to the next candidate.
  if (status === 404 || msg.includes('unavailable for free') || msg.includes('is unavailable')) return true;
  // network-ish
  if (msg.includes('fetch failed') || msg.includes('econnreset') || msg.includes('timeout')) return true;
  return false;
}
