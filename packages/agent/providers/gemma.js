// Google AI Studio Gemma 2 adapter. Oneshot mode only — no native tool-calling.

import { LLMProvider, ProviderError } from './types.js';

const GEMMA_URL = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
const DEFAULT_MODEL = 'gemma-2-27b-it';

export class GemmaProvider extends LLMProvider {
  constructor({ apiKey, model } = {}) {
    super();
    this.apiKey = apiKey || process.env.GEMMA_API_KEY;
    this.model = model || DEFAULT_MODEL;
    if (!this.apiKey) throw new ProviderError('GEMMA_API_KEY not set', { provider: 'gemma', status: 500 });
  }

  get id() { return 'gemma'; }
  supportsTools() { return false; }

  async generate({ system, prompt, temperature = 0.2, max_tokens = 4000, response_format }) {
    const wantsJson =
      response_format?.type === 'json_object' || response_format?.type === 'json_schema';
    const combinedPrompt = [
      system,
      wantsJson ? 'Respond ONLY with a single valid JSON object. No prose, no code fences, no explanations.' : null,
      prompt,
    ].filter(Boolean).join('\n\n');

    const body = {
      contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: max_tokens,
        ...(wantsJson ? { responseMimeType: 'application/json' } : {}),
      },
    };
    const res = await fetch(GEMMA_URL(this.model, this.apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new ProviderError(`Gemma ${res.status}: ${detail.slice(0, 500)}`, {
        provider: 'gemma', status: res.status,
      });
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    return { text, raw: data };
  }

  async chat() {
    throw new ProviderError('Gemma provider does not support tool-calling chat mode. Use oneshot mode.', {
      provider: 'gemma', status: 400,
    });
  }
}
