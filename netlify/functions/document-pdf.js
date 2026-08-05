// POST /api/documents/:id/pdf
// Renders the doc's react-pdf tree server-side, uploads to Supabase Storage,
// returns { signed_url, object_key, expires_at }.

import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { json, handleOptions, parseJson, bearer } from './_shared/http.js';
import { verifyUser, serviceClient } from '../../packages/db/supabase.js';
import { pdfComponentFor } from '../../packages/templates/pdf/index.js';
import { preflight } from '../../packages/validation/guardrails.js';

export const handler = async (event) => {
  const pre = handleOptions(event);
  if (pre) return pre;
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const { user, error: authErr } = await verifyUser(bearer(event));
  if (!user) return json(401, { error: 'unauthorized', detail: authErr });
  const id = event.queryStringParameters?.id;
  if (!id) return json(400, { error: 'missing_id' });

  const svc = serviceClient();
  const { data: doc, error } = await svc
    .from('documents').select('*').eq('id', id).eq('created_by', user.id).maybeSingle();
  if (error) return json(500, { error: 'db_error', detail: error.message });
  if (!doc) return json(404, { error: 'not_found' });

  // Preflight. Non-blocking by default: generating a PDF is also how you look at your own
  // draft, and refusing that would make the Preview and PDF tabs useless for exactly the
  // documents still being written. Callers about to put the file in front of a homeowner
  // pass { strict: true } and get a hard stop naming the missing field.
  const reqBody = parseJson(event) || {};
  const check = preflight(doc, 'pdf', { strict: reqBody.strict === true });
  if (check.blocked) {
    return json(409, { error: 'not_ready', detail: check.summary, issues: check.blocking });
  }

  // Render PDF to Buffer.
  const Component = pdfComponentFor(doc.template);
  const logoUrl = (process.env.PUBLIC_SITE_URL || 'https://sunvicnj.com') + '/logo/sunvic.png';
  let pdfBuffer;
  try {
    pdfBuffer = await renderToBuffer(
      React.createElement(Component, { payload: doc.payload, docNumber: doc.doc_number, logoUrl })
    );
  } catch (e) {
    return json(500, { error: 'render_failed', detail: String(e?.message || e) });
  }

  // Upload to Supabase Storage.
  const objectKey = `docs/${doc.id}/${doc.doc_number}_${Date.now()}.pdf`;
  const { error: upErr } = await svc.storage
    .from('documents')
    .upload(objectKey, pdfBuffer, { contentType: 'application/pdf', upsert: true });
  if (upErr) return json(500, { error: 'upload_failed', detail: upErr.message });

  // Sign a URL good for 15 minutes.
  const { data: signed, error: signErr } = await svc.storage
    .from('documents')
    .createSignedUrl(objectKey, 60 * 15);
  if (signErr) return json(500, { error: 'sign_failed', detail: signErr.message });

  // Persist object key on the doc.
  await svc.from('documents').update({
    pdf_object_key: objectKey,
    pdf_generated_at: new Date().toISOString(),
  }).eq('id', id);

  return json(200, {
    // What is still wrong rides back even on a successful preview, so the PDF tab can warn
    // "this would not be ready to send" without a second round trip.
    preflight: { ok: check.issues.length === 0, issues: check.issues },
    signed_url: signed.signedUrl,
    object_key: objectKey,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
};
