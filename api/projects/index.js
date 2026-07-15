// One-function dispatcher for all /api/projects/* endpoints.

import { adapt } from '../_lib/adapt.js';
import { handler as listHandler } from '../../netlify/functions/projects.js';
import { handler as itemHandler } from '../../netlify/functions/project.js';

const listAdapter = adapt(listHandler);
const itemAdapter = adapt(itemHandler);

export default async function projectsRouter(req, res) {
  try {
    const sub = req.query?.sub || '';
    const parts = String(sub).split('/').filter(Boolean);

    // /api/projects/:id/summary → force ?summary=1 for the underlying handler.
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
  } catch (err) {
    console.error('[api/projects] router error:', err);
    res.status(500).setHeader('content-type', 'application/json');
    return res.send(JSON.stringify({ error: 'router_error', detail: String(err?.message || err) }));
  }
}
