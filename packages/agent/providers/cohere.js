// Cohere Chat API v2 adapter. Default provider.
// - generate(): forces JSON with response_format: { type: 'json_object' }
// - chat(): supports tools (Cohere's tool_calls schema is OpenAI-compatible)

import { LLMProvider, ProviderError } from './types.js';
import { clampMaxTokens } from './capabilities.js';

const COHERE_URL = 'https://api.cohere.com/v2/chat';
const DEFAULT_MODEL = 'command-a-03-2025';

export class CohereProvider extends LLMProvider {
  constructor({ apiKey, model } = {}) {
    super();
    this.apiKey = apiKey || process.env.COHERE_API_KEY;
    this.model = model || DEFAULT_MODEL;
    if (!this.apiKey) throw new ProviderError('COHERE_API_KEY not set', { provider: 'cohere', status: 500 });
  }

  get id() { return 'cohere'; }
  supportsTools() { return true; }

  async #post(body) {
    const res = await fetch(COHERE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
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

  async chat({ system, messages, tools, temperature = 0.3, max_tokens = 2000, strict_tools = false }) {
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
      data = await this.#post(base);
    } else {
      const strictOk = CohereProvider.#strictEligible(tools);
      try {
        data = await this.#post(withTools(strict_tools && strictOk ? { strict_tools: true } : {}));
      } catch (e) {
        if (!CohereProvider.#isHallucinatedTools(e)) throw e;
        // Attempt 2: let Cohere constrain generation to the declared schema so
        // an undeclared tool is not expressible in the first place.
        if (strictOk && !strict_tools) {
          try {
            data = await this.#post(withTools({ strict_tools: true }));
          } catch (e2) {
            if (!CohereProvider.#isHallucinatedTools(e2)) throw e2;
            data = null;
          }
        }
        // Attempt 3: drop tools entirely. A prose answer is a worse turn than a
        // tool call, but it is an enormously better turn than a 500.
        if (!data) data = await this.#post(base);
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
