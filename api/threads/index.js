// One-function dispatcher for all /api/threads/* endpoints.
// Sub-handlers are LAZY-imported so the router's cold-start stays cheap.

import { adapt } from '../_lib/adapt.js';

const cache = {};
async function getAdapter(name) {
  if (cache[name]) return cache[name];
  let mod;
  switch (name) {
    case 'list': mod = await import('../../netlify/functions/threads.js');     break;
    case 'item': mod = await import('../../netlify/functions/thread.js');      break;
    case 'turn': mod = await import('../../netlify/functions/thread-turn.js'); break;
    default: throw new Error(`unknown handler: ${name}`);
  }
  cache[name] = adapt(mod.handler);
  return cache[name];
}

export default async function threadsRouter(req, res) {
  try {
    const sub = req.query?.sub || '';
    const parts = String(sub).split('/').filter(Boolean);

    // /api/threads/:id/turn
    if (parts.length === 2 && parts[1] === 'turn') {
      req.query = { ...(req.query || {}), id: parts[0] };
      const a = await getAdapter('turn');
      return a(req, res);
    }

    // /api/threads/:id
    if (parts.length === 1) {
      req.query = { ...(req.query || {}), id: parts[0] };
      const a = await getAdapter('item');
      return a(req, res);
    }

    // /api/threads (list/create)
    if (parts.length === 0) {
      const a = await getAdapter('list');
      return a(req, res);
    }

    res.status(404).setHeader('content-type', 'application/json');
    return res.send(JSON.stringify({ error: 'not_found', detail: `no route for /api/threads/${sub}` }));
  } catch (err) {
    console.error('[api/threads] router error:', err);
    res.status(500).setHeader('content-type', 'application/json');
    return res.send(JSON.stringify({ error: 'router_error', detail: String(err?.message || err) }));
  }
}
