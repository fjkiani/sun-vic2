// GET /api/emails — list the current user's email activity log (newest first).
// Optional filters: ?document_id=, ?status=sent|failed, ?limit=

import { json, handleOptions, bearer } from './_shared/http.js';
import { verifyUser, serviceClient } from '../../packages/db/supabase.js';

export const handler = async (event) => {
  const pre = handleOptions(event);
  if (pre) return pre;
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });

  const { user, error: authErr } = await verifyUser(bearer(event));
  if (!user) return json(401, { error: 'unauthorized', detail: authErr });

  const svc = serviceClient();
  const q = event.queryStringParameters || {};
  let query = svc
    .from('email_log')
    .select('id, document_id, project_id, doc_number, template, recipient, subject, status, resend_id, error, created_at')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false });
  if (q.document_id) query = query.eq('document_id', q.document_id);
  if (q.status) query = query.eq('status', q.status);
  const limit = Math.min(Number(q.limit) || 100, 500);

  const { data, error } = await query.limit(limit);
  if (error) return json(500, { error: 'db_error', detail: error.message });
  return json(200, { emails: data || [] });
};
