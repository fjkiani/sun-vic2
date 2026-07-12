// Factory — returns a provider instance for a given id.

import { CohereProvider } from './cohere.js';
import { OpenRouterProvider } from './openrouter.js';
import { GemmaProvider } from './gemma.js';
import { ProviderError } from './types.js';

export function getProvider(id, opts = {}) {
  switch ((id || 'cohere').toLowerCase()) {
    case 'cohere':     return new CohereProvider(opts);
    case 'openrouter': return new OpenRouterProvider(opts);
    case 'gemma':      return new GemmaProvider(opts);
    default:
      throw new ProviderError(`unknown provider "${id}"`, { status: 400, provider: id });
  }
}

export { ProviderError };
