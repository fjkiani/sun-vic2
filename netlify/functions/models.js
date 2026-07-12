// GET /api/models — list available LLM providers + models for the frontend dropdown.

import { json, handleOptions } from './_shared/http.js';

export const handler = async (event) => {
  const pre = handleOptions(event);
  if (pre) return pre;
  const providers = [
    {
      id: 'cohere',
      label: 'Cohere Command A',
      requires_key: 'COHERE_API_KEY',
      available: !!process.env.COHERE_API_KEY,
      default_model: 'command-a-03-2025',
      supports_tools: true,
    },
    {
      id: 'openrouter',
      label: 'OpenRouter (GPT-OSS)',
      requires_key: 'OPENROUTER_API_KEY',
      available: !!process.env.OPENROUTER_API_KEY,
      default_model: 'openai/gpt-oss-20b',
      supports_tools: true,
    },
    {
      id: 'gemma',
      label: 'Google Gemma 2',
      requires_key: 'GEMMA_API_KEY',
      available: !!process.env.GEMMA_API_KEY,
      default_model: 'gemma-2-27b-it',
      supports_tools: false, // Gemma via Google AI Studio does not support native tool-calling → oneshot mode only.
    },
  ];
  return json(200, { providers });
};
