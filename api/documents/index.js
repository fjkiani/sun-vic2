// One-function dispatcher for all /api/documents/* endpoints.
// Sub-handlers are LAZY-imported so the router's cold-start doesn't pay for
// the PDF renderer / React / template graph on every request.

import { adapt } from '../_lib/adapt.js';

// Cache adapters after first load to avoid re-importing on warm invocations.
const cache = {};

async function getAdapter(name) {
  if (cache[name]) return cache[name];
  let mod;
  switch (name) {
    case 'list':   mod = await import('../../netlify/functions/documents.js');       break;
    case 'item':   mod = await import('../../netlify/functions/document.js');        break;
    case 'pdf':    mod = await import('../../netlify/functions/document-pdf.js');    break;
    case 'email':  mod = await import('../../netlify/functions/document-email.js');  break;
    case 'public': mod = await import('../../netlify/functions/document-public.js'); break;
    default: throw new Error(`unknown handler: ${name}`);
  }
  cache[name] = adapt(mod.handler);
  return cache[name];
}

export default async function documentsRouter(req, res) {
  try {
    const sub = req.query?.sub || '';
    const parts = String(sub).split('/').filter(Boolean);

    // /api/documents/:id/{pdf|email|public}
    if (parts.length === 2) {
      const [id, action] = parts;
      req.query = { ...(req.query || {}), id };
      if (action === 'pdf'    || action === 'email' || action === 'public') {
        const a = await getAdapter(action);
        return a(req, res);
      }
      res.status(404).setHeader('content-type', 'application/json');
      return res.send(JSON.stringify({ error: 'not_found', detail: `no route for /api/documents/${id}/${action}` }));
    }

    // /api/documents/:id
    if (parts.length === 1) {
      req.query = { ...(req.query || {}), id: parts[0] };
      const a = await getAdapter('item');
      return a(req, res);
    }

    // /api/documents (list/create)
    if (parts.length === 0) {
      const a = await getAdapter('list');
      return a(req, res);
    }

    res.status(404).setHeader('content-type', 'application/json');
    return res.send(JSON.stringify({ error: 'not_found', detail: `no route for /api/documents/${sub}` }));
  } catch (err) {
    console.error('[api/documents] router error:', err);
    res.status(500).setHeader('content-type', 'application/json');
    return res.send(JSON.stringify({ error: 'router_error', detail: String(err?.message || err) }));
  }
}
