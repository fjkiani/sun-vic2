// One-function dispatcher for all /api/threads/* endpoints.

import { adapt } from '../_lib/adapt.js';
import { handler as listHandler } from '../../netlify/functions/threads.js';
import { handler as itemHandler } from '../../netlify/functions/thread.js';
import { handler as turnHandler } from '../../netlify/functions/thread-turn.js';

const listAdapter = adapt(listHandler);
const itemAdapter = adapt(itemHandler);
const turnAdapter = adapt(turnHandler);

export default async function threadsRouter(req, res) {
  try {
    const sub = req.query?.sub || '';
    const parts = String(sub).split('/').filter(Boolean);

    // /api/threads/:id/turn
    if (parts.length === 2 && parts[1] === 'turn') {
      req.query = { ...(req.query || {}), id: parts[0] };
      return turnAdapter(req, res);
    }

    // /api/threads/:id
    if (parts.length === 1) {
      req.query = { ...(req.query || {}), id: parts[0] };
      return itemAdapter(req, res);
    }

    // /api/threads
    if (parts.length === 0) {
      return listAdapter(req, res);
    }

    res.status(404).setHeader('content-type', 'application/json');
    return res.send(JSON.stringify({ error: 'not_found', detail: `no route for /api/threads/${sub}` }));
  } catch (err) {
    console.error('[api/threads] router error:', err);
    res.status(500).setHeader('content-type', 'application/json');
    return res.send(JSON.stringify({ error: 'router_error', detail: String(err?.message || err) }));
  }
}
