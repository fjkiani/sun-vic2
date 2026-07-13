// GET  /api/documents          — list current user's docs (filters: template, status, q)
// POST /api/documents          — create new; body: { template, payload?, prompt?, provider? }
//                                if `prompt` is present we call the agent oneshot before insert.

import { json, handleOptions, parseJson, bearer } from './_shared/http.js';
import { verifyUser, serviceClient } from '../../packages/db/supabase.js';
import { defaultPayloadFor, defaultLocksFor } from '../../packages/templates/defaults.js';
import { payloadSchemaFor } from '../../packages/schema/documents.js';
import { totalCentsFor } from './_shared/totals.js';
import { generateOneshot } from '../../packages/agent/oneshot.js';
import { classifyTemplate } from '../../packages/agent/classifier.js';
import { findOrCreateProjectForDocument } from '../../packages/db/projects.js';

export const handler = async (event) => {
  const pre = handleOptions(event);
  if (pre) return pre;

  const { user, error: authErr } = await verifyUser(bearer(event));
  if (!user) return json(401, { error: 'unauthorized', detail: authErr });

  const svc = serviceClient();

  // ─── LIST ────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const q = event.queryStringParameters || {};
    let query = svc
      .from('documents')
      .select('id, doc_number, template, status, title, client_name, client_email, project_ref, project_id, total_cents, updated_at, created_at, pdf_object_key, pdf_generated_at')
      .eq('created_by', user.id)
      .order('updated_at', { ascending: false });
    if (q.template) query = query.eq('template', q.template);
    if (q.status) query = query.eq('status', q.status);
    if (q.q) query = query.ilike('title', `%${q.q}%`);
    const { data, error } = await query.limit(200);
    if (error) return json(500, { error: 'db_error', detail: error.message });
    return json(200, { documents: data });
  }

  // ─── CREATE ──────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    const body = parseJson(event);
    if (body === null) return json(400, { error: 'bad_json' });

    let template = body.template;
    let payload = body.payload;
    let agentProvider = null;

    // Agentic path: if a prompt is present, classify (if template missing) and run oneshot.
    if (body.prompt && !payload) {
      if (!template) {
        try {
          template = await classifyTemplate(body.prompt, { providerId: body.provider, userId: user.id });
        } catch (e) {
          return json(502, { error: 'classifier_failed', detail: String(e?.message || e) });
        }
      }
      try {
        const oneshotResult = await generateOneshot({
          template,
          prompt: body.prompt,
          providerId: body.provider,
          model: body.model,
          userId: user.id,
        });
        payload = oneshotResult.payload;
        template = oneshotResult.template; // may have been reclassified
        agentProvider = oneshotResult.provider;
      } catch (e) {
        return json(502, { error: 'oneshot_failed', detail: String(e?.message || e) });
      }
    }

    if (!template || !['contract', 'invoice'].includes(template)) {
      return json(400, { error: 'invalid_template' });
    }

    // Fall back to defaults for missing fields; validate/normalize with Zod.
    const filled = { ...defaultPayloadFor(template), ...(payload || {}) };
    const parsed = payloadSchemaFor(template).safeParse(filled);
    if (!parsed.success) {
      return json(400, { error: 'invalid_payload', issues: parsed.error.issues });
    }
    const finalPayload = parsed.data;
    const locks = defaultLocksFor(template);

    // Get doc number from the DB sequence function.
    const { data: numRows, error: numErr } = await svc.rpc('next_doc_number', { p_template: template });
    if (numErr) return json(500, { error: 'doc_number_failed', detail: numErr.message });
    const docNumber = numRows;

    // If this is an invoice, write the doc number into the payload.
    if (template === 'invoice') finalPayload.invoice_number = docNumber;

    const totalCents = totalCentsFor(template, finalPayload);
    const clientName = template === 'invoice'
      ? finalPayload.bill_to?.client_name || null
      : finalPayload.homeowner?.name || null;
    const clientEmail = template === 'invoice'
      ? finalPayload.bill_to?.recipient_email || null
      : finalPayload.homeowner?.email || null;
    const projectRef = template === 'invoice' ? finalPayload.project_ref || null : null;

    // Find-or-create the project so every document lands under one.
    let projectId = null;
    try {
      const proj = await findOrCreateProjectForDocument(user.id, finalPayload, template);
      projectId = proj?.id || null;
      // If this is a contract, refresh the project's denormalized contract_total.
      if (proj && template === 'contract') {
        await svc
          .from('projects')
          .update({ contract_total_cents: totalCents })
          .eq('id', proj.id)
          .eq('created_by', user.id);
      }
    } catch (e) {
      // Non-fatal — log but continue. Doc creation should not fail due to project attach.
      // eslint-disable-next-line no-console
      console.warn('findOrCreateProjectForDocument failed:', e?.message || e);
    }

    const { data: doc, error: insErr } = await svc
      .from('documents')
      .insert({
        doc_number: docNumber,
        template,
        status: 'draft',
        title: body.title || (template === 'contract' ? 'New Contract' : 'New Invoice'),
        client_name: clientName,
        client_email: clientEmail,
        project_ref: projectRef,
        project_id: projectId,
        total_cents: totalCents,
        payload: finalPayload,
        locks,
        created_by: user.id,
      })
      .select('*')
      .single();
    if (insErr) return json(500, { error: 'insert_failed', detail: insErr.message });

    await svc.from('document_revisions').insert({
      document_id: doc.id,
      payload: finalPayload,
      locks,
      changed_by: user.id,
      change_source: body.prompt ? 'agent_oneshot' : 'user_edit',
    });

    return json(200, { document: doc });
  }

  return json(405, { error: 'method_not_allowed' });
};
