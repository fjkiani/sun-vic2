// Consolidated Vercel dispatcher for /api/projects/:id and /api/projects/:id/summary.
// Zero-segment /api/projects is handled by the sibling index.js.
//
// Routes:
//   GET/PATCH /api/projects/:id               → netlify/functions/project.js (list/single by presence of id)
//   GET /api/projects/:id/summary             → netlify/functions/project.js (summary mode via path suffix)

import { adapt } from '../_lib/adapt.js';
import { handler as itemHandler } from '../../netlify/functions/project.js';

const itemAdapter = adapt(itemHandler);

export default async function projectsRouter(req, res) {
  const raw = req.query?.path;
  const segments = Array.isArray(raw) ? raw : (raw ? [raw] : []);

  // /api/projects/:id/summary  (project.js checks event.path.endsWith('/summary'))
  if (segments.length === 2 && segments[1] === 'summary') {
    req.query = { ...(req.query || {}), id: segments[0] };
    return itemAdapter(req, res);
  }

  // /api/projects/:id
  if (segments.length === 1) {
    req.query = { ...(req.query || {}), id: segments[0] };
    return itemAdapter(req, res);
  }

  res.status(404).setHeader('content-type', 'application/json');
  return res.send(JSON.stringify({ error: 'not_found', detail: `no route for /api/projects/${segments.join('/')}` }));
}
