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
      label: 'OpenRouter (free models)',
      requires_key: 'OPENROUTER_API_KEY',
      available: !!process.env.OPENROUTER_API_KEY || userProviders.has('openrouter'),
      user_key_present: userProviders.has('openrouter'),
      default_model: 'openrouter/free',
      supports_tools: true,
      // Curated list of currently-free OpenRouter models that also support
      // tool/function calling (verified live from openrouter.ai/api/v1/models).
      // 'openrouter/free' is the meta-router — it auto-picks a working free model.
      // If a specific pick goes paid, users can still use the meta-router.
      models: [
        { id: 'openrouter/free',                         label: 'Auto (free router)',       ctx: 200000 },
        { id: 'openai/gpt-oss-20b:free',                 label: 'GPT-OSS 20B (free)',       ctx: 131072 },
        { id: 'meta-llama/llama-3.3-70b-instruct:free',  label: 'Llama 3.3 70B (free)',     ctx: 131072 },
        { id: 'qwen/qwen3-coder:free',                   label: 'Qwen3 Coder 480B (free)',  ctx: 1048576 },
        { id: 'qwen/qwen3-next-80b-a3b-instruct:free',   label: 'Qwen3 Next 80B (free)',    ctx: 262144 },
        { id: 'nvidia/nemotron-3-nano-9b-v2:free',       label: 'Nemotron Nano 9B (free)',  ctx: 128000 },
        { id: 'nvidia/nemotron-3-ultra-550b-a55b:free',  label: 'Nemotron Ultra 550B (free)', ctx: 1000000 },
        { id: 'google/gemma-4-31b-it:free',              label: 'Gemma 4 31B (free)',       ctx: 262144 },
        { id: 'cohere/north-mini-code:free',             label: 'Cohere North Mini (free)', ctx: 256000 },
      ],
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
