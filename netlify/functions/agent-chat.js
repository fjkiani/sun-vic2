// POST /api/agent/chat
// Body: { doc_id, message, provider?, model?, history? }
// Runs one chat turn (may fire multiple tool calls internally), persists any resulting
// payload changes and agent messages, returns the assistant reply + updated doc snapshot.

import { json, handleOptions, parseJson, bearer } from './_shared/http.js';
import { verifyUser, serviceClient } from '../../packages/db/supabase.js';
import { runChatTurn } from '../../packages/agent/chat.js';
import { totalDollarsForContract, totalDollarsForInvoice } from './_shared/totals.js';
import {
  introducedIssues, writeGuard, statusTransitionGuard, validatePayload, SEVERITY,
} from '../../packages/validation/guardrails.js';

// Dispatch callback for generate_pdf / email_document tools — hits our own endpoints via internal http.
async function makeDispatcher({ event, docRow }) {
  const baseUrl = process.env.URL || process.env.PUBLIC_SITE_URL || 'http://localhost:8888';
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  return async function dispatch({ name, args, docId }) {
    if (name === 'generate_pdf') {
      const res = await fetch(`${baseUrl}/api/documents/${docId}/pdf`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      });
      return res.ok ? await res.json() : { error: 'pdf_dispatch_failed', status: res.status };
    }
    if (name === 'email_document') {
      const res = await fetch(`${baseUrl}/api/documents/${docId}/email`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: args.to || docRow.client_email }),
      });
      return res.ok ? await res.json() : { error: 'email_dispatch_failed', status: res.status };
    }
    return { error: 'unknown_dispatch' };
  };
}

export const handler = async (event) => {
  const pre = handleOptions(event);
  if (pre) return pre;
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const { user, error: authErr } = await verifyUser(bearer(event));
  if (!user) return json(401, { error: 'unauthorized', detail: authErr });

  const body = parseJson(event);
  if (!body) return json(400, { error: 'invalid_json' });
  const { doc_id, message, provider = 'cohere', model, history = [] } = body;
  if (!doc_id) return json(400, { error: 'doc_id_required' });
  if (!message) return json(400, { error: 'message_required' });

  const svc = serviceClient();
  const { data: doc, error: docErr } = await svc.from('documents').select('*').eq('id', doc_id).eq('created_by', user.id).maybeSingle();
  if (docErr) return json(500, { error: 'db_error', detail: docErr.message });
  if (!doc) return json(404, { error: 'not_found' });

  // Load recent DB-persisted history if the client didn't send one.
  let effectiveHistory = history;
  if (!Array.isArray(history) || history.length === 0) {
    const { data: past } = await svc.from('agent_messages')
      .select('role, content, tool_name, tool_args, tool_result')
      .eq('document_id', doc_id)
      .order('created_at', { ascending: true })
      .limit(30);
    // Reconstruct provider-neutral message shape. Tool rows fold back into the assistant
    // history as {role:'tool', content: <result-json>} so the LLM sees the outcome of each call.
    effectiveHistory = (past || []).map((m) => {
      if (m.role === 'tool') {
        return { role: 'tool', content: JSON.stringify({ tool: m.tool_name, args: m.tool_args, result: m.tool_result }) };
      }
      return { role: m.role, content: m.content || '' };
    });
  }
  effectiveHistory.push({ role: 'user', content: message });

  // Snapshot for revision log.
  const revisionBefore = doc.payload;

  let turn;
  try {
    const dispatch = await makeDispatcher({ event, docRow: doc });
    turn = await runChatTurn({
      providerId: provider,
      model,
      template: doc.template,
      payload: doc.payload,
      locks: doc.locks || {},
      docId: doc.id,
      history: effectiveHistory,
      dispatch,
      userId: user.id,
    });
  } catch (e) {
    return json(500, { error: 'chat_failed', detail: String(e?.message || e) });
  }

  const updates = {};
  const payloadChanged = JSON.stringify(turn.updated_payload) !== JSON.stringify(revisionBefore);

  // ── guardrails on the agent path ──────────────────────────
  // The agent runs unattended inside a turn, so unlike a human save these checks block
  // rather than warn. Two rules, both refusing to persist rather than persisting and
  // apologising afterwards.
  //
  // 1. A document that has already gone out needs explicit confirmation. The agent may
  //    propose the edit — the reply is still returned and shown — but the payload is not
  //    written until the user confirms.
  if (payloadChanged) {
    const guard = writeGuard({
      status: doc.status,
      confirmed: body.confirm === true,
      source: 'agent',
      hasPayloadChange: true,
    });
    if (guard) {
      return json(200, {
        reply: turn.reply,
        applied_tool_calls: [],
        refused: turn.refused,
        iterations: turn.iterations,
        payload_changed: false,
        confirm_required: {
          code: guard.code,
          status: doc.status,
          message: guard.message,
          proposed_tool_calls: turn.applied_tool_calls,
        },
        document: {
          id: doc.id, template: doc.template, doc_number: doc.doc_number,
          status: doc.status, total_cents: doc.total_cents,
          payload: doc.payload, locks: doc.locks,
        },
      });
    }

    // 2. The agent may not *introduce* an arithmetic fault. Measured as a diff, not as
    //    absolute validity: a document that already has a 95% schedule must stay editable,
    //    including to repair the very thing that is wrong with it. Holding the agent to
    //    absolute validity would deadlock exactly the documents that need fixing.
    const introduced = introducedIssues(revisionBefore, turn.updated_payload, doc.template)
      .filter((i) => i.severity === SEVERITY.ERROR);
    if (introduced.length > 0) {
      return json(200, {
        reply: turn.reply,
        applied_tool_calls: [],
        refused: [
          ...(turn.refused || []),
          ...introduced.map((i) => ({ reason: i.code, field: i.field, detail: i.message })),
        ],
        iterations: turn.iterations,
        payload_changed: false,
        blocked_by_guardrails: {
          message: `That change was not saved: ${introduced.map((i) => i.message).join(' ')}`,
          issues: introduced,
        },
        document: {
          id: doc.id, template: doc.template, doc_number: doc.doc_number,
          status: doc.status, total_cents: doc.total_cents,
          payload: doc.payload, locks: doc.locks,
        },
      });
    }
  }

  if (payloadChanged) {
    updates.payload = turn.updated_payload;
    const totalDollars = doc.template === 'contract'
      ? totalDollarsForContract(turn.updated_payload)
      : totalDollarsForInvoice(turn.updated_payload);
    updates.total_cents = Math.round(totalDollars * 100);
    updates.client_name = doc.template === 'contract'
      ? (turn.updated_payload.homeowner?.name || doc.client_name)
      : (turn.updated_payload.bill_to?.client_name || doc.client_name);
    updates.client_email = doc.template === 'contract'
      ? (turn.updated_payload.homeowner?.email || doc.client_email)
      : (turn.updated_payload.bill_to?.recipient_email || doc.client_email);
    updates.updated_at = new Date().toISOString();
  }
  // 3. The agent can mark a document sent/signed/paid via set_status. That is the moment
  //    the numbers have to be right, so it gets the same preflight a human transition does.
  const setStatus = turn.applied_tool_calls.find((c) => c.tool === 'set_status');
  if (setStatus) {
    const tGuard = statusTransitionGuard({
      from: doc.status,
      to: setStatus.args.status,
      payload: turn.updated_payload,
      template: doc.template,
    });
    if (tGuard) {
      return json(200, {
        reply: turn.reply,
        applied_tool_calls: [],
        refused: [...(turn.refused || []), { reason: tGuard.code, detail: tGuard.message }],
        iterations: turn.iterations,
        payload_changed: false,
        blocked_by_guardrails: { message: tGuard.message, issues: tGuard.issues },
        document: {
          id: doc.id, template: doc.template, doc_number: doc.doc_number,
          status: doc.status, total_cents: doc.total_cents,
          payload: doc.payload, locks: doc.locks,
        },
      });
    }
    updates.status = setStatus.args.status;
  }

  if (Object.keys(updates).length > 0) {
    const { error: updErr } = await svc.from('documents').update(updates).eq('id', doc.id);
    if (updErr) return json(500, { error: 'db_update_failed', detail: updErr.message });

    if (payloadChanged) {
      await svc.from('document_revisions').insert({
        document_id: doc.id,
        payload: turn.updated_payload,
        locks: doc.locks || {},
        changed_by: user.id,
        change_source: 'agent_tool',
      });
    }
  }

  // Persist agent messages (user turn + assistant reply + any tool calls).
  const inserts = [
    { document_id: doc.id, role: 'user', content: message, provider, model: model || null },
    ...turn.applied_tool_calls.map((tc) => ({
      document_id: doc.id,
      role: 'tool',
      content: '',
      tool_name: tc.tool,
      tool_args: tc.args || null,
      tool_result: tc.side_effect || { applied: true },
      provider,
      model: model || null,
    })),
    { document_id: doc.id, role: 'assistant', content: turn.reply, provider, model: model || null },
  ];
  await svc.from('agent_messages').insert(inserts);

  return json(200, {
    reply: turn.reply,
    applied_tool_calls: turn.applied_tool_calls,
    refused: turn.refused,
    iterations: turn.iterations,
    payload_changed: payloadChanged,
    validation: validatePayload(turn.updated_payload, doc.template),
    document: {
      id: doc.id,
      template: doc.template,
      doc_number: doc.doc_number,
      status: updates.status || doc.status,
      total_cents: updates.total_cents ?? doc.total_cents,
      payload: turn.updated_payload,
      locks: doc.locks,
    },
  });
};
