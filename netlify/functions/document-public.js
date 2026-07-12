// GET /api/documents/:id/public?token=<hmac>
// Returns a signed PDF URL without requiring auth. Token is an HMAC of the doc id and the SESSION_JWT_SECRET.
// Use case: the client-facing signed link the Sunvic team sends to homeowners.

import crypto from 'node:crypto';
import { json, handleOptions } from './_shared/http.js';
import { serviceClient } from '../../packages/db/supabase.js';

function sign(id) {
  const secret = process.env.SESSION_JWT_SECRET || 'change-me';
  return crypto.createHmac('sha256', secret).update(id).digest('hex').slice(0, 32);
}

export const handler = async (event) => {
  const pre = handleOptions(event);
  if (pre) return pre;
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });

  const id = event.queryStringParameters?.id;
  const token = event.queryStringParameters?.token;
  if (!id || !token) return json(400, { error: 'missing_id_or_token' });
  if (sign(id) !== token) return json(403, { error: 'invalid_token' });

  const svc = serviceClient();
  const { data: doc, error } = await svc.from('documents')
    .select('id, doc_number, template, pdf_object_key, total_cents, updated_at')
    .eq('id', id).maybeSingle();
  if (error) return json(500, { error: 'db_error', detail: error.message });
  if (!doc) return json(404, { error: 'not_found' });
  if (!doc.pdf_object_key) return json(409, { error: 'pdf_not_generated' });

  const { data: signed, error: signErr } = await svc.storage
    .from('documents')
    .createSignedUrl(doc.pdf_object_key, 60 * 60); // 1 hour
  if (signErr) return json(500, { error: 'sign_failed', detail: signErr.message });

  return json(200, {
    doc_number: doc.doc_number,
    template: doc.template,
    total_cents: doc.total_cents,
    signed_url: signed.signedUrl,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
};

// Utility export so servers can generate the token before mailing a link.
export function publicToken(id) {
  return sign(id);
}
