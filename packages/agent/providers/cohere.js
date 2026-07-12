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
    if (tools?.length) body.tools = tools;
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
