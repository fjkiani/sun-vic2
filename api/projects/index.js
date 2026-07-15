// One-function dispatcher for all /api/projects/* endpoints.

import { adapt } from '../_lib/adapt.js';

const cache = {};
async function getAdapter(name) {
  if (cache[name]) return cache[name];
  let mod;
  switch (name) {
    case 'list': mod = await import('../../netlify/functions/projects.js'); break;
    case 'item': mod = await import('../../netlify/functions/project.js');  break;
    default: throw new Error(`unknown handler: ${name}`);
  }
  cache[name] = adapt(mod.handler);
  return cache[name];
}

export default async function projectsRouter(req, res) {
  try {
    const sub = req.query?.sub || '';
    const parts = String(sub).split('/').filter(Boolean);

    // /api/projects/:id/summary — force ?summary=1 for the underlying handler.
    if (parts.length === 2 && parts[1] === 'summary') {
      req.query = { ...(req.query || {}), id: parts[0], summary: '1' };
      const a = await getAdapter('item');
      return a(req, res);
    }

    // /api/projects/:id
    if (parts.length === 1) {
      req.query = { ...(req.query || {}), id: parts[0] };
      const a = await getAdapter('item');
      return a(req, res);
    }

    // /api/projects (list/create)
    if (parts.length === 0) {
      const a = await getAdapter('list');
      return a(req, res);
    }

    res.status(404).setHeader('content-type', 'application/json');
    return res.send(JSON.stringify({ error: 'not_found', detail: `no route for /api/projects/${sub}` }));
  } catch (err) {
    console.error('[api/projects] router error:', err);
    res.status(500).setHeader('content-type', 'application/json');
    return res.send(JSON.stringify({ error: 'router_error', detail: String(err?.message || err) }));
  }
}
