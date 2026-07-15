// Consolidated Vercel dispatcher for all /api/threads/* endpoints.
// Vercel counts each api/*.js as a separate serverless function; the Hobby
// plan caps deployments at 12, so we route the whole /api/threads tree through
// one catch-all function.
//
// Routes:
//   GET/POST /api/threads              → netlify/functions/threads.js
//   GET/PATCH/DELETE /api/threads/:id  → netlify/functions/thread.js
//   POST /api/threads/:id/turn         → netlify/functions/thread-turn.js

import { adapt } from '../_lib/adapt.js';
import { handler as listHandler }  from '../../netlify/functions/threads.js';
import { handler as itemHandler }  from '../../netlify/functions/thread.js';
import { handler as turnHandler }  from '../../netlify/functions/thread-turn.js';

const listAdapter = adapt(listHandler);
const itemAdapter = adapt(itemHandler);
const turnAdapter = adapt(turnHandler);

export default async function threadsRouter(req, res) {
  // Vercel exposes the catch-all params on req.query.path (an array of segments).
  const raw = req.query?.path;
  const segments = Array.isArray(raw) ? raw : (raw ? [raw] : []);

  // POST /api/threads/:id/turn → turn handler (has 2 segments, second is 'turn')
  if (segments.length === 2 && segments[1] === 'turn') {
    // Preserve the id in the query so downstream handlers can read it.
    req.query = { ...(req.query || {}), id: segments[0] };
    return turnAdapter(req, res);
  }

  // GET/PATCH/DELETE /api/threads/:id → item handler
  if (segments.length === 1) {
    req.query = { ...(req.query || {}), id: segments[0] };
    return itemAdapter(req, res);
  }

  // GET/POST /api/threads → list handler
  if (segments.length === 0) {
    return listAdapter(req, res);
  }

  res.status(404).setHeader('content-type', 'application/json');
  return res.send(JSON.stringify({ error: 'not_found', detail: `no route for /api/threads/${segments.join('/')}` }));
}
