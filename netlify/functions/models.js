// GET /api/models — list available LLM providers + models for the frontend dropdown.

import { json, handleOptions, bearer } from './_shared/http.js';
import { verifyUser } from '../../packages/db/supabase.js';
import { listUserKeys } from '../../packages/db/user-keys.js';

export const handler = async (event) => {
  const pre = handleOptions(event);
  if (pre) return pre;

  // Try to identify user — anonymous requests still allowed
  let userProviders = new Set();
  try {
    const auth = bearer(event);
    if (auth) {
      const { user } = await verifyUser(auth);
      if (user) {
        const keys = await listUserKeys(user.id);
        keys.forEach((k) => userProviders.add(k.provider));
      }
    }
  } catch { /* ignore — anonymous */ }

  const providers = [
    {
      id: 'cohere',
      label: 'Cohere Command A',
      requires_key: 'COHERE_API_KEY',
      available: !!process.env.COHERE_API_KEY || userProviders.has('cohere'),
      user_key_present: userProviders.has('cohere'),
      default_model: 'command-a-03-2025',
      supports_tools: true,
    },
    {
      id: 'openrouter',
      label: 'OpenRouter (GPT-OSS)',
      requires_key: 'OPENROUTER_API_KEY',
      available: !!process.env.OPENROUTER_API_KEY || userProviders.has('openrouter'),
      user_key_present: userProviders.has('openrouter'),
      default_model: 'openai/gpt-oss-20b',
      supports_tools: true,
    },
    {
      id: 'gemma',
      label: 'Google Gemma 2',
      requires_key: 'GEMMA_API_KEY',
      available: !!process.env.GEMMA_API_KEY || userProviders.has('gemma'),
      user_key_present: userProviders.has('gemma'),
      default_model: 'gemma-2-27b-it',
      supports_tools: false,
    },
  ];
  return json(200, { providers });
};
