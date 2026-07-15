// Consolidated Vercel dispatcher for all /api/documents/* endpoints.
// Collapses 5 previously-separate functions into 1 to stay under the 12-function cap.
//
// Routes:
//   GET/POST /api/documents                  → netlify/functions/documents.js  (list/create)
//   GET/PATCH/DELETE /api/documents/:id      → netlify/functions/document.js   (single)
//   POST /api/documents/:id/pdf              → netlify/functions/document-pdf.js
//   POST /api/documents/:id/email            → netlify/functions/document-email.js
//   GET  /api/documents/:id/public           → netlify/functions/document-public.js

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
  const raw = req.query?.path;
  const segments = Array.isArray(raw) ? raw : (raw ? [raw] : []);

  // /api/documents/:id/pdf | email | public
  if (segments.length === 2) {
    const [id, sub] = segments;
    req.query = { ...(req.query || {}), id };
    if (sub === 'pdf')    return pdfAdapter(req, res);
    if (sub === 'email')  return emailAdapter(req, res);
    if (sub === 'public') return publicAdapter(req, res);
    res.status(404).setHeader('content-type', 'application/json');
    return res.send(JSON.stringify({ error: 'not_found', detail: `no route for /api/documents/${id}/${sub}` }));
  }

  // /api/documents/:id (get/patch/delete)
  if (segments.length === 1) {
    req.query = { ...(req.query || {}), id: segments[0] };
    return itemAdapter(req, res);
  }

  // /api/documents (list/create)
  if (segments.length === 0) {
    return listAdapter(req, res);
  }

  res.status(404).setHeader('content-type', 'application/json');
  return res.send(JSON.stringify({ error: 'not_found', detail: `no route for /api/documents/${segments.join('/')}` }));
}
