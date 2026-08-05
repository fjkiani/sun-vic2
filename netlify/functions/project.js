// GET    /api/projects/:id            — full project details (fetch from DB)
// GET    /api/projects/:id/summary    — aggregated dashboard summary
// PATCH  /api/projects/:id            — partial update
// POST   /api/projects/:id            — {action:'restore'} clears deleted_at (restore from Trash)
// DELETE /api/projects/:id            — move to Trash (sets deleted_at); ?permanent=1 hard-deletes

import { json, handleOptions, parseJson, bearer } from './_shared/http.js';
import { verifyUser, serviceClient } from '../../packages/db/supabase.js';
import { getProject, updateProject, getProjectSummary } from '../../packages/db/projects.js';

export const handler = async (event) => {
  const pre = handleOptions(event);
  if (pre) return pre;

  const { user, error: authErr } = await verifyUser(bearer(event));
  if (!user) return json(401, { error: 'unauthorized', detail: authErr });

  const id = event.queryStringParameters?.id;
  if (!id) return json(400, { error: 'missing_id' });
  // Strip query string before matching /summary — Vercel's req.url includes it.
  const pathNoQuery = String(event.path || '').split('?')[0];
  const isSummary = event.queryStringParameters?.summary === '1'
    || pathNoQuery.endsWith('/summary');

  try {
    if (event.httpMethod === 'GET') {
      if (isSummary) {
        const summary = await getProjectSummary(user.id, id);
        if (!summary) return json(404, { error: 'not_found' });
        return json(200, summary);
      }
      const project = await getProject(user.id, id);
      if (!project) return json(404, { error: 'not_found' });
      return json(200, { project });
    }

    if (event.httpMethod === 'PATCH') {
      const body = parseJson(event);
      if (body === null) return json(400, { error: 'bad_json' });
      const project = await updateProject(user.id, id, body);
      if (!project) return json(404, { error: 'not_found' });
      return json(200, { project });
    }

    if (event.httpMethod === 'POST') {
      const body = parseJson(event) || {};
      if (body.action !== 'restore') return json(400, { error: 'unsupported_action' });
      const svc = serviceClient();
      const { data: restored, error } = await svc
        .from('projects').update({ deleted_at: null }).eq('id', id).eq('created_by', user.id)
        .select('*').single();
      if (error) return json(500, { error: 'restore_failed', detail: error.message });
      return json(200, { project: restored, restored: true });
    }

    if (event.httpMethod === 'DELETE') {
      const svc = serviceClient();
      const permanent = event.queryStringParameters?.permanent === '1';
      if (permanent) {
        // Hard delete: detach documents from the project (do NOT delete the docs), then
        // remove the project row.
        await svc.from('documents').update({ project_id: null }).eq('project_id', id).eq('created_by', user.id);
        const { error } = await svc
          .from('projects').delete().eq('id', id).eq('created_by', user.id);
        if (error) return json(500, { error: 'delete_failed', detail: error.message });
        return json(200, { deleted: true, permanent: true, id });
      }
      // Soft delete → Trash.
      const { data: trashed, error } = await svc
        .from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('created_by', user.id)
        .select('*').single();
      if (error) return json(500, { error: 'delete_failed', detail: error.message });
      return json(200, { project: trashed, trashed: true });
    }
  } catch (e) {
    return json(500, { error: 'db_error', detail: String(e?.message || e) });
  }

  return json(405, { error: 'method_not_allowed' });
};
