// GET  /api/threads  — list current user's threads (?projectId, ?q, ?limit)
// POST /api/threads  — create thread { title?, projectId? }

import { json, handleOptions, parseJson, bearer } from './_shared/http.js';
import { verifyUser } from '../../packages/db/supabase.js';
import { listThreads, createThread } from '../../packages/db/threads.js';

export const handler = async (event) => {
  const pre = handleOptions(event);
  if (pre) return pre;

  const { user, error: authErr } = await verifyUser(bearer(event));
  if (!user) return json(401, { error: 'unauthorized', detail: authErr });

  if (event.httpMethod === 'GET') {
    try {
      const p = event.queryStringParameters || {};
      const rows = await listThreads(user.id, {
        projectId: p.projectId || undefined,
        q: p.q || undefined,
        limit: p.limit ? Number(p.limit) : undefined,
      });
      return json(200, { threads: rows });
    } catch (e) {
      console.error('[threads.GET] failure:', e);
      return json(500, { error: 'list_threads_failed', detail: e?.message || String(e), pgCode: e?.pgCode });
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const body = parseJson(event);
      if (body === null) return json(400, { error: 'bad_json' });
      const created = await createThread(user.id, {
        title: body.title,
        projectId: body.project_id || body.projectId,
      });
      return json(201, { thread: created });
    } catch (e) {
      console.error('[threads.POST] failure:', e);
      return json(500, { error: 'create_thread_failed', detail: e?.message || String(e), pgCode: e?.pgCode });
    }
  }

  return json(405, { error: 'method_not_allowed' });
};
