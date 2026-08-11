// Cohere Chat API v2 adapter. Default provider.
// - generate(): forces JSON with response_format: { type: 'json_object' }
// - chat(): supports tools (Cohere's tool_calls schema is OpenAI-compatible)

import { LLMProvider, ProviderError } from './types.js';
import { clampMaxTokens } from './capabilities.js';

const COHERE_URL = 'https://api.cohere.com/v2/chat';
const DEFAULT_MODEL = 'command-a-03-2025';

// Nothing here had a timeout, and chat() can issue three sequential requests
// (the hallucinated-tools fallback chain), inside a turn loop that can call
// chat() several times, inside a 60s Vercel function. That is up to 24 unbounded
// HTTP calls behind one gateway deadline, and it is how a real turn was killed
// with a 504 *after* it had already written a contract row — the document
// existed and the reply that would have announced it never arrived.
//
// POST_TIMEOUT_MS  — a single Cohere call that has not answered in 20s will not.
// MIN_POST_MS      — never start a request there is no time to finish.
// CHAT_BUDGET_MS   — default ceiling for the whole retry chain when the caller
//                    does not pass its own remaining budget.
const POST_TIMEOUT_MS = 20_000;
const MIN_POST_MS = 4_000;
const CHAT_BUDGET_MS = 30_000;

export class CohereProvider extends LLMProvider {
  constructor({ apiKey, model } = {}) {
    super();
    this.apiKey = apiKey || process.env.COHERE_API_KEY;
    this.model = model || DEFAULT_MODEL;
    if (!this.apiKey) throw new ProviderError('COHERE_API_KEY not set', { provider: 'cohere', status: 500 });
  }

  get id() { return 'cohere'; }
  supportsTools() { return true; }

  async #post(body, { timeoutMs = POST_TIMEOUT_MS } = {}) {
    let res;
    try {
      res = await fetch(COHERE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
        // 504 so callers that branch on status treat it as an upstream timeout
        // rather than as a bad request they should stop retrying.
        throw new ProviderError(`Cohere did not respond within ${Math.round(timeoutMs / 1000)}s`, {
          provider: 'cohere', status: 504,
        });
      }
      throw e;
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new ProviderError(`Cohere ${res.status}: ${detail.slice(0, 500)}`, {
        provider: 'cohere', status: res.status,
      });
    }
    return res.json();
  }

  async generate({ system, prompt, temperature = 0.2, max_tokens = 4000, response_format }) {
    const body = {
      model: this.model,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt },
      ],
      temperature,
      // Defense-in-depth: Cohere command-a hard-caps completion at 8192; a raw
      // request > 8192 returns HTTP 400. Clamp here so no call site can trip it.
      max_tokens: clampMaxTokens(max_tokens, 'cohere', this.model),
    };
    if (response_format?.type === 'json_object') {
      body.response_format = { type: 'json_object' };
    } else if (response_format?.type === 'json_schema' && response_format.schema) {
      body.response_format = { type: 'json_object', schema: response_format.schema };
    }
    const data = await this.#post(body);
    const text = data.message?.content?.map((c) => c.text || '').join('') || '';
    return { text, raw: data };
  }

  // ─── Message-shape translation (internal ↔ Cohere v2) ─────
  //
  // Our internal shape is OpenAI-flavored:
  //   assistant:  { role, content, tool_calls: [{ id, name, arguments }] }
  //   tool:       { role: 'tool', content: '<json string>', tool_call_id }
  //
  // Cohere v2 wants:
  //   assistant:  { role, tool_plan, tool_calls: [{ id, type: 'function',
  //                 function: { name, arguments: '<string>' } }] }
  //   tool:       { role: 'tool', tool_call_id,
  //                 content: [{ type: 'document', document: { data: '<string>' } }] }
  //
  // Round-trip failure modes if we skip translation:
  //   - Sending our bare { name, description, parameters } tools -> 400
  //     "missing required field: 'type'".
  //   - Sending our tool-role message with raw string content -> Cohere
  //     rejects (expects an array of documents).
  //   - Sending our internal tool_calls without type/function wrapping ->
  //     Cohere silently drops them, model forgets it called anything.
  #translateForCohere(messages) {
    return messages.map((m) => {
      // Assistant with tool_calls -> add type/function wrap + a tool_plan.
      if (m.role === 'assistant' && m.tool_calls?.length) {
        return {
          role: 'assistant',
          tool_plan: m.content || 'Calling tools.',
          tool_calls: m.tool_calls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.function?.name || tc.name,
              arguments: typeof tc.function?.arguments === 'string'
                ? tc.function.arguments
                : (typeof tc.arguments === 'string'
                  ? tc.arguments
                  : JSON.stringify(tc.function?.arguments || tc.arguments || {})),
            },
          })),
        };
      }
      // Tool result -> wrap raw content into a document array.
      if (m.role === 'tool') {
        const raw = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? {});
        return {
          role: 'tool',
          tool_call_id: m.tool_call_id,
          content: [{ type: 'document', document: { data: raw } }],
        };
      }
      // user / system / plain assistant pass through.
      return { role: m.role, content: m.content ?? '' };
    });
  }

  // Cohere returns HTTP 422 { error_type: 'HALLUCINATED_ALL_TOOL_CALLS' } when
  // EVERY tool call the model generated fails validation against the declared
  // tools. In practice that means the model wanted a tool we did not offer —
  // which happens constantly with a stage machine that narrows `tools` turn by
  // turn. Left unhandled it is a hard 500 and the user's message is lost.
  static #isHallucinatedTools(err) {
    return err?.status === 422 && /HALLUCINATED_ALL_TOOL_CALLS/i.test(err?.message || '');
  }

  // strict_tools is Cohere's documented cure, but it refuses any tool whose
  // parameters are all optional. Check before asking for it, or the retry
  // trades a 422 for a 400.
  static #strictEligible(tools) {
    return !!tools?.length && tools.every((t) => Array.isArray(t.parameters?.required) && t.parameters.required.length > 0);
  }

  // budget_ms: how much wall clock the CALLER still has. The retry chain spends
  // from it and refuses to start an attempt it cannot finish, so three fallback
  // attempts can never outlive the request that asked for one answer.
  async chat({ system, messages, tools, temperature = 0.3, max_tokens = 2000, strict_tools = false, budget_ms = CHAT_BUDGET_MS }) {
    const startedAt = Date.now();
    const remaining = () => budget_ms - (Date.now() - startedAt);
    const post = (b) => this.#post(b, { timeoutMs: Math.max(MIN_POST_MS, Math.min(POST_TIMEOUT_MS, remaining())) });
    const base = {
      model: this.model,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...this.#translateForCohere(messages),
      ],
      temperature,
      max_tokens,
    };
    const withTools = (extra = {}) => ({
      ...base,
      tools: tools.map((t) => ({ type: 'function', function: t })),
      ...extra,
    });

    let data;
    if (!tools?.length) {
      data = await post(base);
    } else {
      const strictOk = CohereProvider.#strictEligible(tools);
      try {
        data = await post(withTools(strict_tools && strictOk ? { strict_tools: true } : {}));
      } catch (e) {
        if (!CohereProvider.#isHallucinatedTools(e)) throw e;
        // Out of time: surface the real error instead of spending the caller's
        // remaining budget on a retry that will be killed at the gateway anyway.
        if (remaining() < MIN_POST_MS) throw e;
        // Attempt 2: let Cohere constrain generation to the declared schema so
        // an undeclared tool is not expressible in the first place.
        if (strictOk && !strict_tools) {
          try {
            data = await post(withTools({ strict_tools: true }));
          } catch (e2) {
            if (!CohereProvider.#isHallucinatedTools(e2)) throw e2;
            if (remaining() < MIN_POST_MS) throw e2;
            data = null;
          }
        }
        // Attempt 3: drop tools entirely. A prose answer is a worse turn than a
        // tool call, but it is an enormously better turn than a 500.
        if (!data) data = await post(base);
      }
    }
    const msg = data.message || {};
    const text = msg.content?.map((c) => c.text || '').join('') || '';
    const tool_calls = (msg.tool_calls || []).map((tc) => ({
      id: tc.id,
      name: tc.function?.name,
      arguments: (() => { try { return JSON.parse(tc.function?.arguments || '{}'); } catch { return {}; } })(),
    }));
    return { text, tool_calls, finish_reason: data.finish_reason, raw: data };
  }
}
