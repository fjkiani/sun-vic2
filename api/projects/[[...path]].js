// Consolidated Vercel dispatcher for all /api/projects/* endpoints.
// Collapses 3 previously-separate functions into 1 to stay under the 12-function cap.
//
// Routes:
//   GET/POST /api/projects                    → netlify/functions/projects.js  (list/create)
//   GET/PATCH /api/projects/:id               → netlify/functions/project.js   (single)
//   GET /api/projects/:id/summary             → netlify/functions/project.js   (summary mode; uses path suffix)

import { adapt } from '../_lib/adapt.js';
import { handler as listHandler } from '../../netlify/functions/projects.js';
import { handler as itemHandler } from '../../netlify/functions/project.js';

const listAdapter = adapt(listHandler);
const itemAdapter = adapt(itemHandler);

export default async function projectsRouter(req, res) {
  const raw = req.query?.path;
  const segments = Array.isArray(raw) ? raw : (raw ? [raw] : []);

  // /api/projects/:id/summary — project.js detects via `event.path.endsWith('/summary')`
  if (segments.length === 2 && segments[1] === 'summary') {
    req.query = { ...(req.query || {}), id: segments[0] };
    return itemAdapter(req, res);
  }

  // /api/projects/:id (get/patch)
  if (segments.length === 1) {
    req.query = { ...(req.query || {}), id: segments[0] };
    return itemAdapter(req, res);
  }

  // /api/projects (list/create)
  if (segments.length === 0) {
    return listAdapter(req, res);
  }

  res.status(404).setHeader('content-type', 'application/json');
  return res.send(JSON.stringify({ error: 'not_found', detail: `no route for /api/projects/${segments.join('/')}` }));
}
