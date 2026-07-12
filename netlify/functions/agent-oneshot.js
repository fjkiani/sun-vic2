// POST /api/agent/oneshot
// Body: { prompt, template?, provider?, model? }
// Returns a full generated payload — does NOT create a document. The caller (frontend)
// decides whether to display for review or POST to /api/documents.

import { json, handleOptions, parseJson, bearer } from './_shared/http.js';
import { verifyUser } from '../../packages/db/supabase.js';
import { oneshot } from '../../packages/agent/oneshot.js';

export const handler = async (event) => {
  const pre = handleOptions(event);
  if (pre) return pre;
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const { user } = await verifyUser(bearer(event));
  if (!user) return json(401, { error: 'unauthorized' });

  const body = parseJson(event);
  if (!body) return json(400, { error: 'invalid_json' });
  const { prompt, template, provider = 'cohere', model } = body;
  if (!prompt) return json(400, { error: 'prompt_required' });

  try {
    const result = await oneshot({ prompt, template, providerId: provider, model });
    return json(200, result);
  } catch (e) {
    return json(500, { error: 'oneshot_failed', detail: String(e?.message || e) });
  }
};
