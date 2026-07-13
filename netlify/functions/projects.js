// GET  /api/projects          — list current user's projects (filters: status, q)
// POST /api/projects          — create a project

import { json, handleOptions, parseJson, bearer } from './_shared/http.js';
import { verifyUser } from '../../packages/db/supabase.js';
import { listProjects, createProject } from '../../packages/db/projects.js';

export const handler = async (event) => {
  const pre = handleOptions(event);
  if (pre) return pre;

  const { user, error: authErr } = await verifyUser(bearer(event));
  if (!user) return json(401, { error: 'unauthorized', detail: authErr });

  if (event.httpMethod === 'GET') {
    const q = event.queryStringParameters || {};
    try {
      const projects = await listProjects(user.id, { status: q.status, q: q.q });
      return json(200, { projects });
    } catch (e) {
      return json(500, { error: 'db_error', detail: String(e?.message || e) });
    }
  }

  if (event.httpMethod === 'POST') {
    const body = parseJson(event);
    if (body === null) return json(400, { error: 'bad_json' });
    if (!body.name || !String(body.name).trim()) return json(400, { error: 'missing_name' });
    try {
      const project = await createProject(user.id, body);
      return json(201, { project });
    } catch (e) {
      return json(500, { error: 'db_error', detail: String(e?.message || e) });
    }
  }

  return json(405, { error: 'method_not_allowed' });
};
