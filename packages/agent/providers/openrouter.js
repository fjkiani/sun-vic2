// OpenRouter adapter — OpenAI-compatible endpoint. Default model: openai/gpt-oss-20b.

import { LLMProvider, ProviderError } from './types.js';

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-20b';

export class OpenRouterProvider extends LLMProvider {
  constructor({ apiKey, model } = {}) {
    super();
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY;
    this.model = model || DEFAULT_MODEL;
    if (!this.apiKey) throw new ProviderError('OPENROUTER_API_KEY not set', { provider: 'openrouter', status: 500 });
  }

  get id() { return 'openrouter'; }
  supportsTools() { return true; }

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
      const detail = await res.text().catch(() => '');
      throw new ProviderError(`OpenRouter ${res.status}: ${detail.slice(0, 500)}`, {
        provider: 'openrouter', status: res.status,
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
      body.response_format = { type: 'json_schema', json_schema: { schema: response_format.schema, name: 'result', strict: true } };
    }
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
