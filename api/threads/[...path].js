// Consolidated Vercel dispatcher for /api/threads/:id and /api/threads/:id/turn.
// Zero-segment /api/threads is handled by the sibling index.js.
//
// Routes:
//   GET/PATCH/DELETE /api/threads/:id  → netlify/functions/thread.js
//   POST /api/threads/:id/turn         → netlify/functions/thread-turn.js

import { adapt } from '../_lib/adapt.js';
import { handler as itemHandler } from '../../netlify/functions/thread.js';
import { handler as turnHandler } from '../../netlify/functions/thread-turn.js';

const itemAdapter = adapt(itemHandler);
const turnAdapter = adapt(turnHandler);

export default async function threadsRouter(req, res) {
  const raw = req.query?.path;
  const segments = Array.isArray(raw) ? raw : (raw ? [raw] : []);

  // /api/threads/:id/turn
  if (segments.length === 2 && segments[1] === 'turn') {
    req.query = { ...(req.query || {}), id: segments[0] };
    return turnAdapter(req, res);
  }

  // /api/threads/:id
  if (segments.length === 1) {
    req.query = { ...(req.query || {}), id: segments[0] };
    return itemAdapter(req, res);
  }

  res.status(404).setHeader('content-type', 'application/json');
  return res.send(JSON.stringify({ error: 'not_found', detail: `no route for /api/threads/${segments.join('/')}` }));
}
