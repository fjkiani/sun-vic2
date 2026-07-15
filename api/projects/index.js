// One-function dispatcher for all /api/projects/* endpoints.
// See vercel.json rewrites.

import { adapt } from '../_lib/adapt.js';
import { handler as listHandler } from '../../netlify/functions/projects.js';
import { handler as itemHandler } from '../../netlify/functions/project.js';

const listAdapter = adapt(listHandler);
const itemAdapter = adapt(itemHandler);

export default async function projectsRouter(req, res) {
  const sub = req.query?.sub || '';
  const parts = String(sub).split('/').filter(Boolean);

  // /api/projects/:id/summary
  // project.js detects summary mode via either `?summary=1` OR path suffix. Since our
  // adapter sees the rewritten URL (`/api/projects?sub=:id/summary`), the suffix
  // check fails — force the query flag so the underlying handler switches modes.
  if (parts.length === 2 && parts[1] === 'summary') {
    req.query = { ...(req.query || {}), id: parts[0], summary: '1' };
    return itemAdapter(req, res);
  }

  // /api/projects/:id
  if (parts.length === 1) {
    req.query = { ...(req.query || {}), id: parts[0] };
    return itemAdapter(req, res);
  }

  // /api/projects
  if (parts.length === 0) {
    return listAdapter(req, res);
  }

  res.status(404).setHeader('content-type', 'application/json');
  return res.send(JSON.stringify({ error: 'not_found', detail: `no route for /api/projects/${sub}` }));
}
