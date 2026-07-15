// One-function dispatcher for all /api/documents/* endpoints.
// See vercel.json rewrites for how /api/documents/:sub* funnels into this file.

import { adapt } from '../_lib/adapt.js';
import { handler as listHandler }   from '../../netlify/functions/documents.js';
import { handler as itemHandler }   from '../../netlify/functions/document.js';
import { handler as pdfHandler }    from '../../netlify/functions/document-pdf.js';
import { handler as emailHandler }  from '../../netlify/functions/document-email.js';
import { handler as publicHandler } from '../../netlify/functions/document-public.js';

const listAdapter   = adapt(listHandler);
const itemAdapter   = adapt(itemHandler);
const pdfAdapter    = adapt(pdfHandler);
const emailAdapter  = adapt(emailHandler);
const publicAdapter = adapt(publicHandler);

export default async function documentsRouter(req, res) {
  const sub = req.query?.sub || '';
  const parts = String(sub).split('/').filter(Boolean);

  // /api/documents/:id/{pdf|email|public}
  if (parts.length === 2) {
    const [id, action] = parts;
    req.query = { ...(req.query || {}), id };
    if (action === 'pdf')    return pdfAdapter(req, res);
    if (action === 'email')  return emailAdapter(req, res);
    if (action === 'public') return publicAdapter(req, res);
    res.status(404).setHeader('content-type', 'application/json');
    return res.send(JSON.stringify({ error: 'not_found', detail: `no route for /api/documents/${id}/${action}` }));
  }

  // /api/documents/:id
  if (parts.length === 1) {
    req.query = { ...(req.query || {}), id: parts[0] };
    return itemAdapter(req, res);
  }

  // /api/documents  (list/create)
  if (parts.length === 0) {
    return listAdapter(req, res);
  }

  res.status(404).setHeader('content-type', 'application/json');
  return res.send(JSON.stringify({ error: 'not_found', detail: `no route for /api/documents/${sub}` }));
}
