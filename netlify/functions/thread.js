// GET   /api/threads/:id  — get thread + messages
// PATCH /api/threads/:id  — update title / stage / project_id
// DELETE /api/threads/:id — delete thread (cascades messages)

import { json, handleOptions, parseJson, bearer } from './_shared/http.js';
import { verifyUser } from '../../packages/db/supabase.js';
import { getThreadWithMessages, updateThread, deleteThread } from '../../packages/db/threads.js';

export const handler = async (event) => {
  const pre = handleOptions(event);
  if (pre) return pre;

  const { user, error: authErr } = await verifyUser(bearer(event));
  if (!user) return json(401, { error: 'unauthorized', detail: authErr });

  const pathNoQuery = String(event.path || '').split('?')[0];
  const parts = pathNoQuery.split('/').filter(Boolean);
  const threadId = event.queryStringParameters?.id || parts[parts.length - 1];
  if (!threadId || threadId === 'threads') {
    return json(400, { error: 'missing_thread_id' });
  }

  if (event.httpMethod === 'GET') {
    try {
      const bundle = await getThreadWithMessages(threadId, user.id);
      if (!bundle) return json(404, { error: 'not_found' });
      return json(200, bundle);
    } catch (e) {
      return json(500, { error: 'get_thread_failed', detail: e.message });
    }
  }

  if (event.httpMethod === 'PATCH') {
    try {
      const body = parseJson(event);
      if (body === null) return json(400, { error: 'bad_json' });
      const updated = await updateThread(threadId, user.id, body);
      if (!updated) return json(404, { error: 'not_found' });
      return json(200, { thread: updated });
    } catch (e) {
      return json(500, { error: 'update_thread_failed', detail: e.message });
    }
  }

  if (event.httpMethod === 'DELETE') {
    try {
      await deleteThread(threadId, user.id);
      return json(200, { ok: true });
    } catch (e) {
      return json(500, { error: 'delete_thread_failed', detail: e.message });
    }
  }

  return json(405, { error: 'method_not_allowed' });
};
