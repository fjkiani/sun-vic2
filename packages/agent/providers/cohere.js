// Cohere Chat API v2 adapter. Default provider.
// - generate(): forces JSON with response_format: { type: 'json_object' }
// - chat(): supports tools (Cohere's tool_calls schema is OpenAI-compatible)

import { LLMProvider, ProviderError } from './types.js';

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
      max_tokens,
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

  async chat({ system, messages, tools, temperature = 0.3, max_tokens = 2000 }) {
    const body = {
      model: this.model,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...this.#translateForCohere(messages),
      ],
      temperature,
      max_tokens,
    };
    if (tools?.length) {
      body.tools = tools.map((t) => ({ type: 'function', function: t }));
      body.tool_choice = 'auto';
    }
    const data = await this.#post(body);
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
