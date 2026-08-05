// GET    /api/documents/:id    — fetch document + latest revisions + agent messages
// PATCH  /api/documents/:id    — partial update {payload?, locks?, status?, title?}
// DELETE /api/documents/:id    — move to Trash (sets deleted_at); ?permanent=1 hard-deletes
// POST   /api/documents/:id    — {action:'restore'} clears deleted_at (restore from Trash)

import { json, handleOptions, parseJson, bearer } from './_shared/http.js';
import { verifyUser, serviceClient } from '../../packages/db/supabase.js';
import { mergeWithLocks } from './_shared/locks.js';
import { totalCentsFor } from './_shared/totals.js';
import { payloadSchemaFor } from '../../packages/schema/documents.js';
import { validatePayload, writeGuard, statusTransitionGuard } from '../../packages/validation/guardrails.js';

export const handler = async (event) => {
  const pre = handleOptions(event);
  if (pre) return pre;

  const { user, error: authErr } = await verifyUser(bearer(event));
  if (!user) return json(401, { error: 'unauthorized', detail: authErr });

  const id = event.queryStringParameters?.id;
  if (!id) return json(400, { error: 'missing_id' });

  const svc = serviceClient();

  // ownership check + fetch
  const { data: doc, error: fetchErr } = await svc
    .from('documents')
    .select('*')
    .eq('id', id)
    .eq('created_by', user.id)
    .maybeSingle();
  if (fetchErr) return json(500, { error: 'db_error', detail: fetchErr.message });
  if (!doc) return json(404, { error: 'not_found' });

  // ─── GET ─────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const { data: revisions } = await svc
      .from('document_revisions')
      .select('id, change_source, changed_by, created_at')
      .eq('document_id', id)
      .order('created_at', { ascending: false })
      .limit(50);
    const { data: messages } = await svc
      .from('agent_messages')
      .select('*')
      .eq('document_id', id)
      .order('created_at', { ascending: true })
      .limit(500);
    return json(200, { document: doc, revisions: revisions || [], messages: messages || [] });
  }

  // ─── PATCH ───────────────────────────────────────────
  if (event.httpMethod === 'PATCH') {
    const body = parseJson(event);
    if (body === null) return json(400, { error: 'bad_json' });

    // Optimistic concurrency: if the client sent an If-Match header with the
    // updated_at they last saw, refuse the write if the doc has moved on.
    // Header names are normalized to lowercase by the Vercel adapter and by Netlify.
    const ifMatch = event.headers?.['if-match'];
    if (ifMatch && doc.updated_at && ifMatch !== doc.updated_at) {
      return json(409, {
        error: 'conflict',
        detail: 'Document was updated in another tab/session since you loaded it.',
        current_updated_at: doc.updated_at,
      });
    }

    const updates = {};
    let newPayload = doc.payload;
    let newLocks   = doc.locks || {};
    const skippedLocks = [];

    if (body.locks && typeof body.locks === 'object') {
      // lock changes are a direct override (user explicitly clicks the lock icon).
      newLocks = { ...(doc.locks || {}), ...body.locks };
      updates.locks = newLocks;
    }

    if (body.payload && typeof body.payload === 'object') {
      const merged = mergeWithLocks(doc.payload, body.payload, newLocks);
      skippedLocks.push(...merged.skipped);
      newPayload = merged.out;

      const parsed = payloadSchemaFor(doc.template).safeParse(newPayload);
      if (!parsed.success) {
        return json(400, { error: 'invalid_payload', issues: parsed.error.issues, skipped_locks: skippedLocks });
      }
      newPayload = parsed.data;
      updates.payload = newPayload;
      updates.total_cents = totalCentsFor(doc.template, newPayload);

      // update denormalized client/project fields
      if (doc.template === 'invoice') {
        updates.client_name = newPayload.bill_to?.client_name || null;
        updates.client_email = newPayload.bill_to?.recipient_email || null;
        updates.project_ref = newPayload.project_ref || null;
      } else {
        updates.client_name = newPayload.homeowner?.name || null;
        updates.client_email = newPayload.homeowner?.email || null;
      }
    }

    // ── guardrails ────────────────────────────────────────────
    // Deliberately staged rather than uniform. The editor autosaves on a 500ms debounce,
    // so rejecting a PATCH whenever the arithmetic is mid-edit would throw away keystrokes
    // as the user types the second of six milestones. Arithmetic problems are therefore
    // reported on the response and enforced at the moment they matter — delivery — while
    // the two things that must never happen silently are blocked outright here.
    const payloadChanged = !!updates.payload
      && JSON.stringify(updates.payload) !== JSON.stringify(doc.payload);

    // 1. A document that has already gone out is not casually editable, by anyone.
    const guard = writeGuard({
      status: doc.status,
      confirmed: body.confirm === true,
      source: body.change_source === 'agent_tool' ? 'agent' : 'user',
      hasPayloadChange: payloadChanged,
    });
    if (guard) {
      return json(409, { error: guard.code, detail: guard.message, status: doc.status, confirm_required: true });
    }

    // 2. Moving into a delivery status is the moment the numbers have to be right.
    if (body.status && body.status !== doc.status) {
      const tGuard = statusTransitionGuard({
        from: doc.status,
        to: body.status,
        payload: updates.payload || doc.payload,
        template: doc.template,
      });
      if (tGuard) {
        return json(409, { error: tGuard.code, detail: tGuard.message, issues: tGuard.issues });
      }
    }

    const validation = validatePayload(updates.payload || doc.payload, doc.template);

    if (body.status && ['draft','sent','signed','paid','overdue','void'].includes(body.status)) {
      updates.status = body.status;
    }
    if (typeof body.title === 'string') updates.title = body.title;

    if (Object.keys(updates).length === 0) {
      return json(200, { document: doc, skipped_locks: skippedLocks });
    }

    const { data: updated, error: updErr } = await svc
      .from('documents').update(updates).eq('id', id).eq('created_by', user.id)
      .select('*').single();
    if (updErr) return json(500, { error: 'update_failed', detail: updErr.message });

    // append revision
    await svc.from('document_revisions').insert({
      document_id: id,
      payload: updated.payload,
      locks: updated.locks,
      changed_by: user.id,
      change_source: body.change_source || 'user_edit',
    });

    // If this is a contract, keep the project's denormalized total in sync.
    if (updated.template === 'contract' && updated.project_id) {
      await svc
        .from('projects')
        .update({ contract_total_cents: updated.total_cents || 0 })
        .eq('id', updated.project_id)
        .eq('created_by', user.id);
    }

    // ─── Proactive suggestion nudge ─────────────────────
    // When a contract flips to `signed` OR an invoice flips to `paid`, and the doc
    // belongs to a thread, append a canned assistant message so the user sees the
    // suggested next step next time they open the thread.
    // Best-effort — swallow errors, they must never break the PATCH.
    try {
      const prevStatus = doc.status;
      const newStatus  = updated.status;
      const changed    = prevStatus !== newStatus;
      const isMilestone =
        (updated.template === 'contract' && newStatus === 'signed') ||
        (updated.template === 'invoice'  && newStatus === 'paid');
      if (changed && isMilestone && updated.thread_id) {
        const nudgeText = updated.template === 'contract'
          ? `The contract **${updated.doc_number}** is now marked signed. Want me to generate the deposit invoice (~15% of the contract total) so you can send it to ${updated.client_name || 'the homeowner'}?`
          : `Invoice **${updated.doc_number}** is marked paid — nice. Want me to draft the next progress invoice?`;
        await svc.from('chat_messages').insert({
          thread_id: updated.thread_id,
          role: 'assistant',
          content: nudgeText,
          meta: { proactive: true, trigger: `${updated.template}_${newStatus}`, document_id: updated.id },
        });
        await svc
          .from('chat_threads')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', updated.thread_id)
          .eq('user_id', user.id);
      }
    } catch (nudgeErr) {
      // Log to server log; do not fail the PATCH.
      console.warn('[document.PATCH] proactive nudge failed:', nudgeErr?.message || nudgeErr);
    }

    // The save succeeded; anything still wrong with the numbers rides back on the response
    // so the editor can show it without a second round trip. Non-blocking by design — see
    // the guardrail note above.
    return json(200, { document: updated, skipped_locks: skippedLocks, validation });
  }

  // ─── POST (restore from Trash) ───────────────────────
  if (event.httpMethod === 'POST') {
    const body = parseJson(event) || {};
    if (body.action !== 'restore') return json(400, { error: 'unsupported_action' });
    const { data: restored, error } = await svc
      .from('documents').update({ deleted_at: null }).eq('id', id).eq('created_by', user.id)
      .select('*').single();
    if (error) return json(500, { error: 'restore_failed', detail: error.message });
    return json(200, { document: restored, restored: true });
  }

  // ─── DELETE (Trash / permanent) ──────────────────────
  if (event.httpMethod === 'DELETE') {
    const permanent = event.queryStringParameters?.permanent === '1';
    if (permanent) {
      // Hard delete: remove dependent rows first (revisions, agent messages), then the doc.
      await svc.from('document_revisions').delete().eq('document_id', id);
      await svc.from('agent_messages').delete().eq('document_id', id);
      const { error } = await svc
        .from('documents').delete().eq('id', id).eq('created_by', user.id);
      if (error) return json(500, { error: 'delete_failed', detail: error.message });
      return json(200, { deleted: true, permanent: true, id });
    }
    // Soft delete → Trash.
    const { data: trashed, error } = await svc
      .from('documents').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('created_by', user.id)
      .select('*').single();
    if (error) return json(500, { error: 'delete_failed', detail: error.message });
    return json(200, { document: trashed, trashed: true });
  }

  return json(405, { error: 'method_not_allowed' });
};
