// OpenRouter adapter — OpenAI-compatible endpoint.
//
// Default is `tencent/hy3:free` — a large-context (262k), tool-capable free
// model. (The previous default meta-llama/llama-3.3-70b-instruct:free was
// delisted as a free tier on OpenRouter.) `openrouter/free` (meta-router) is
// available as an opt-in Settings choice; when used, we add
// `require_parameters: true` so the router refuses providers that can't accept
// our tool schema.

import { LLMProvider, ProviderError } from './types.js';
import { clampMaxTokens } from './capabilities.js';

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Verified live 2026-08-05: 'tencent/hy3:free' now answers 404 "This model is unavailable
// for free" — the second pinned free slug to be delisted this way. Pointing at the
// free meta-router instead of a single slug so one delisting cannot take the path down.
const DEFAULT_MODEL = 'openrouter/free';

// Model prefixes that behave as meta-routers on OpenRouter — anything before
// the first `/` matches. `openrouter/free`, `openrouter/auto`, etc.
function isMetaRouter(model) {
  return typeof model === 'string' && model.startsWith('openrouter/');
}

export class OpenRouterProvider extends LLMProvider {
  constructor({ apiKey, model } = {}) {
    super();
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY;
    this.model = model || DEFAULT_MODEL;
    if (!this.apiKey) throw new ProviderError('OPENROUTER_API_KEY not set', { provider: 'openrouter', status: 500 });
  }

  get id() { return 'openrouter'; }
  supportsTools() { return true; }

  #applyRouterConstraint(body) {
    // If the caller picked a meta-router (openrouter/free, openrouter/auto), tell
    // OpenRouter to require providers that accept our tool schema. Otherwise the
    // router happily picks Nvidia/Poolside which reject OpenAI-format tools with
    // `missing field 'function'`.
    if (isMetaRouter(this.model)) {
      body.provider = {
        require_parameters: true,
        // Prefer well-behaved providers first.
        // These names come from OpenRouter's provider registry.
        order: ['Meta', 'DeepInfra', 'Groq', 'Cerebras', 'Google', 'Anthropic', 'OpenAI'],
        // Bug B: do NOT allow silent fallback to providers that reject our
        // OpenAI-format tool schema (e.g. Novita). If none of the ordered
        // providers can serve the request, fail loudly so the generation layer
        // can move to the next entry in OUR fallback chain (which uses concrete
        // model ids, not a meta-router).
        allow_fallbacks: false,
      };
    } else if (body.tools?.length) {
      // For concrete (non-meta-router) models that use tools, still require the
      // chosen provider to accept our tool parameters rather than silently
      // dropping them.
      body.provider = { require_parameters: true, allow_fallbacks: false };
    }
  }

  async #post(body) {
    const res = await fetch(OR_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.PUBLIC_SITE_URL || 'https://sunvicnj.com',
        'X-Title': 'Sunvic Documents',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const rawDetail = await res.text().catch(() => '');
      // Try to unwrap the nested provider error so callers see the actual root cause.
      let unwrapped = rawDetail;
      try {
        const parsed = JSON.parse(rawDetail);
        const outer = parsed?.error?.message;
        const metadata = parsed?.error?.metadata;
        if (metadata?.provider_name || metadata?.raw) {
          const inner = metadata?.raw
            ? (typeof metadata.raw === 'string' ? metadata.raw : JSON.stringify(metadata.raw))
            : '';
          unwrapped = [
            outer,
            metadata?.provider_name && `provider=${metadata.provider_name}`,
            inner && `inner=${inner.slice(0, 500)}`,
          ].filter(Boolean).join(' | ');
        } else if (outer) {
          unwrapped = outer;
        }
      } catch { /* not JSON */ }
      throw new ProviderError(`OpenRouter ${res.status}: ${unwrapped.slice(0, 800)}`, {
        provider: 'openrouter', status: res.status, model: this.model,
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
      // Defense-in-depth: clamp to what this model actually accepts so an
      // over-large request can never 4xx (the root cause of the Cohere-class
      // token-cap bug). See capabilities.js.
      max_tokens: clampMaxTokens(max_tokens, 'openrouter', this.model),
    };
    // Reasoning-shaped models burn hidden reasoning tokens before emitting content;
    // cap effort so structured-output tasks don't blow the context window.
    if (/gpt-oss|nemotron|deepseek-r|qwen3|o1|o3|thinking/i.test(this.model)) {
      body.reasoning = { effort: 'low' };
    }
    if (response_format?.type === 'json_object') {
      body.response_format = { type: 'json_object' };
    } else if (response_format?.type === 'json_schema' && response_format.schema) {
      body.response_format = { type: 'json_schema', json_schema: { schema: response_format.schema, name: 'result', strict: true } };
    }
    this.#applyRouterConstraint(body);
    const data = await this.#post(body);
    const text = data.choices?.[0]?.message?.content || '';
    return { text, raw: data };
  }

  async chat({ system, messages, tools, temperature = 0.3, max_tokens = 2000 }) {
    const body = {
      model: this.model,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages,
      ],
      temperature,
      max_tokens,
    };
    if (tools?.length) {
      body.tools = tools.map((t) => ({ type: 'function', function: t }));
      body.tool_choice = 'auto';
    }
    this.#applyRouterConstraint(body);
    const data = await this.#post(body);
    const choice = data.choices?.[0] || {};
    const msg = choice.message || {};
    const tool_calls = (msg.tool_calls || []).map((tc) => ({
      id: tc.id,
      name: tc.function?.name,
      arguments: (() => { try { return JSON.parse(tc.function?.arguments || '{}'); } catch { return {}; } })(),
    }));
    return { text: msg.content || '', tool_calls, finish_reason: choice.finish_reason, raw: data };
  }
}
