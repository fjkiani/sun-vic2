// GET    /api/user-keys           — list current user's stored providers (with fingerprints)
// POST   /api/user-keys           — body: {provider, key}
// DELETE /api/user-keys           — body: {provider}

import { json, handleOptions, parseJson, bearer } from './_shared/http.js';
import { verifyUser } from '../../packages/db/supabase.js';
import { saveUserKey, listUserKeys, deleteUserKey } from '../../packages/db/user-keys.js';

export const handler = async (event) => {
  const pre = handleOptions(event);
  if (pre) return pre;

  const { user, error: authErr } = await verifyUser(bearer(event));
  if (!user) return json(401, { error: 'unauthorized', detail: authErr });

  if (event.httpMethod === 'GET') {
    try {
      const keys = await listUserKeys(user.id);
      return json(200, { keys });
    } catch (err) {
      return json(500, { error: 'db_error', detail: String(err?.message || err) });
    }
  }

  if (event.httpMethod === 'POST') {
    const body = parseJson(event);
    if (body === null) return json(400, { error: 'bad_json' });
    const { provider, key } = body || {};
    if (!provider || !key) return json(400, { error: 'provider_and_key_required' });
    if (!['openrouter', 'cohere', 'gemma', 'resend'].includes(provider))
      return json(400, { error: 'unknown_provider' });
    if (String(key).length < 8) return json(400, { error: 'key_too_short' });
    try {
      const result = await saveUserKey(user.id, provider, String(key));
      return json(200, result);
    } catch (err) {
      return json(500, { error: 'save_failed', detail: String(err?.message || err) });
    }
  }

  if (event.httpMethod === 'DELETE') {
    const body = parseJson(event);
    if (body === null) return json(400, { error: 'bad_json' });
    const { provider } = body || {};
    if (!provider) return json(400, { error: 'provider_required' });
    try {
      await deleteUserKey(user.id, provider);
      return json(200, { deleted: true, provider });
    } catch (err) {
      return json(500, { error: 'delete_failed', detail: String(err?.message || err) });
    }
  }

  return json(405, { error: 'method_not_allowed' });
};
