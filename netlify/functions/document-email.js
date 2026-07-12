// POST /api/documents/:id/email
// Sends the current PDF to the client via Resend, then marks the doc status='sent'.

import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { Resend } from 'resend';
import { json, handleOptions, parseJson, bearer } from './_shared/http.js';
import { verifyUser, serviceClient } from '../../packages/db/supabase.js';
import { pdfComponentFor } from '../../packages/templates/pdf/index.js';
import { fmtUSD } from '../../packages/templates/format.js';

export const handler = async (event) => {
  const pre = handleOptions(event);
  if (pre) return pre;
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const { user, error: authErr } = await verifyUser(bearer(event));
  if (!user) return json(401, { error: 'unauthorized', detail: authErr });
  const id = event.queryStringParameters?.id;
  if (!id) return json(400, { error: 'missing_id' });

  const body = parseJson(event) || {};
  const svc = serviceClient();

  const { data: doc, error } = await svc.from('documents').select('*').eq('id', id).eq('created_by', user.id).maybeSingle();
  if (error) return json(500, { error: 'db_error', detail: error.message });
  if (!doc) return json(404, { error: 'not_found' });

  const to = body.to || doc.client_email;
  if (!to) return json(400, { error: 'missing_recipient' });

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

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return json(500, { error: 'resend_key_missing' });
  const resend = new Resend(apiKey);

  const totalUSD = fmtUSD((doc.total_cents || 0) / 100);
  const templateLabel = doc.template === 'contract' ? 'Contract' : 'Invoice';
  const subject = body.subject || `Your Sunvic ${templateLabel} — ${doc.doc_number}`;
  const html = body.html || `
    <div style="font-family:Inter,Arial,sans-serif;color:#111827">
      <h2 style="color:#f97316;margin-bottom:8px">Sunvic Construction</h2>
      <p>Hi ${doc.client_name || 'there'},</p>
      <p>Please find your ${templateLabel.toLowerCase()} <strong>#${doc.doc_number}</strong> attached.</p>
      <p><strong>Total:</strong> ${totalUSD}</p>
      <p>Reach us anytime at <a href="tel:+17328249203">(732) 824-9203</a> or reply to this email.</p>
      <p style="color:#6b7280;font-size:12px">Sunvic, LLC Contractors · Licensed & Insured · NJ License #13VH12429600</p>
    </div>
  `;

  const from = process.env.RESEND_FROM_EMAIL || 'Sunvic Construction <no-reply@sunvicnj.com>';
  const sendResult = await resend.emails.send({
    from,
    to: [to],
    subject,
    html,
    attachments: [{ filename: `${doc.doc_number}.pdf`, content: pdfBuffer.toString('base64') }],
  });
  if (sendResult.error) return json(502, { error: 'send_failed', detail: sendResult.error });

  await svc.from('documents').update({ status: 'sent' }).eq('id', id);

  return json(200, { sent: true, to, resend_id: sendResult.data?.id || null });
};
