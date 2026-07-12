// Provider interface — every LLM adapter implements this shape.
//
//   generate({ system, prompt, response_format, temperature, max_tokens }) -> { text, raw }
//   chat({ system, messages, tools, temperature, max_tokens })              -> { text, tool_calls, finish_reason, raw }
//
// Tools are described in OpenAI/Cohere-compatible JSON schema. Gemma does not support tools
// natively → its chat() throws if `tools` is passed, and the agent falls back to oneshot mode.

export class ProviderError extends Error {
  constructor(message, { status, provider, cause } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = status || 500;
    this.provider = provider;
    this.cause = cause;
  }
}

// eslint-disable-next-line no-unused-vars
export class LLMProvider {
  get id() { throw new Error('id not implemented'); }
  // eslint-disable-next-line class-methods-use-this
  supportsTools() { return false; }
  // eslint-disable-next-line no-unused-vars, class-methods-use-this
  async generate(_args) { throw new Error('generate not implemented'); }
  // eslint-disable-next-line no-unused-vars, class-methods-use-this
  async chat(_args) { throw new Error('chat not implemented'); }
}
