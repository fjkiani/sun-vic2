// Thread-agent orchestrator.
//
// This is the "big" agent that owns the whole chat thread. It is responsible for:
//   - Loading the thread (state machine + full message history).
//   - Assembling memory context: contractor identity, recent projects, doc summaries.
//   - Running one LLM turn with a tool catalog scoped to the current stage.
//   - Applying the tool calls (create doc, ask user, send PDF, refuse...).
//   - Persisting new messages + updating thread state (stage, clarify_count).
//   - Returning the assistant reply + any newly-created doc so the client can
//     open the editor.
//
// The per-doc agent (packages/agent/chat.js + agent-chat.js) is still used
// inside the editor and remains unchanged; this is a higher layer.

import { getProvider } from './providers/index.js';
import { resolveProviderKey } from '../db/user-keys.js';
import { generateOneshot } from './oneshot.js';
import { threadToolDefs } from './thread-tools.js';
import {
  appendMessages,
  listUserMemory,
  updateThread,
} from '../db/threads.js';
import { serviceClient } from '../db/supabase.js';
import { totalDollarsForContract, totalDollarsForInvoice } from '../../netlify/functions/_shared/totals.js';
import { defaultLocksFor } from '../templates/defaults.js';
import { findOrCreateProjectForDocument } from '../db/projects.js';

const MAX_CLARIFY_TURNS = 3;

// ─── System prompt ────────────────────────────────────────
function threadSystemPrompt({ stage, clarifyCount, memory, threadDocs }) {
  const projects = memory.projects || [];
  const docs = memory.documents || [];

  const projectLines = projects.slice(0, 15).map((p) =>
    `- ${p.name} · homeowner=${p.homeowner_name || '—'} · address=${p.property_address || '—'} · total=${((p.contract_total_cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} · status=${p.status}`
  );
  const docLines = docs.slice(0, 20).map((d) =>
    `- id=${d.id} · ${d.template} ${d.doc_number} · ${d.client_name || '—'} · $${((d.total_cents || 0) / 100).toFixed(0)} · ${d.status}${d.summary ? ` · summary="${d.summary}"` : ''}`
  );
  const threadDocLines = (threadDocs || []).map((d) =>
    `- id=${d.id} · ${d.template} ${d.doc_number} · status=${d.status} · $${((d.total_cents || 0) / 100).toFixed(0)}`
  );

  const stageHint = {
    gathering: `Your current job is to GATHER INFO before generating a document. Required fields for a contract: homeowner name+address, scope categories (any of Demolition & Foundation / Exteriors / Interiors / MEP), total budget or sqft, timeline (weeks to start + months to complete). For an invoice you need the linked contract (via lookup_document) and the milestone name. You may ask UP TO ${MAX_CLARIFY_TURNS} clarifying questions total across the whole thread — you have used ${clarifyCount} so far. Use ask_user for one focused question at a time. When you have enough, call generate_document. If after ${MAX_CLARIFY_TURNS} questions you still lack info, call refuse_and_summarize.`,
    drafting: 'A document was just generated. Confirm what you created in one short sentence and offer next steps ("Want me to email it to the homeowner? Or make edits?"). Do not call generate_document again.',
    editing: 'The document exists and the user wants edits or actions. Use send_to_client to email; use lookup_document when you need to compare or copy from another doc. Do NOT call ask_user unless the user is clearly ambiguous — this stage is action, not info-gathering.',
    sending: 'A send is in progress. Confirm success briefly.',
    done:    'The job is complete. Answer questions but be concise.',
  }[stage] || '';

  return [
    'You are Sunvic Contractors LLC\'s agentic assistant. You help a construction business owner (the user) prepare CONTRACTS and INVOICES for their homeowner clients through natural conversation.',
    '',
    'The user is the CONTRACTOR, not the homeowner. Speak to them as "you"; call the homeowner by name (e.g. "the Nguyens").',
    '',
    stageHint,
    '',
    'Ground rules:',
    '- Prefer TOOLS over prose. When action is needed, call the tool; do not describe what you would do.',
    '- Never invent a homeowner. If you find a matching project in memory, confirm it before reusing.',
    '- Never invent legal text. Sunvic contract legal blocks are canonical and locked server-side.',
    '- Money: New Jersey pricing — gut renos $200–300/sqft, second-story additions $250–500/sqft, kitchens $30–80k, baths $15–35k. NJ sales tax = 6.625%, materials-only for construction.',
    '- Keep replies short. One or two sentences plus one tool call is ideal.',
    '',
    'Memory — recent projects for this user:',
    projectLines.length ? projectLines.join('\n') : '(no prior projects)',
    '',
    'Memory — recent documents (with summaries; call lookup_document for full payloads):',
    docLines.length ? docLines.join('\n') : '(no prior documents)',
    '',
    'This thread already has these documents:',
    threadDocLines.length ? threadDocLines.join('\n') : '(none yet)',
  ].join('\n');
}

// ─── Helpers ────────────────────────────────────────────
function historyForLLM(messages) {
  // messages are DB rows: { role, content, tool_calls, tool_call_id, meta, created_at }.
  // Provider-neutral shape expected by getProvider(...).chat():
  //   { role: 'user'|'assistant'|'tool'|'system', content, tool_calls?, tool_call_id? }
  return messages.map((m) => {
    const base = { role: m.role, content: m.content || '' };
    if (m.tool_calls) base.tool_calls = m.tool_calls;
    if (m.tool_call_id) base.tool_call_id = m.tool_call_id;
    return base;
  });
}

async function generateSummaryForDoc({ template, payload, providerId, model, userId }) {
  // Best-effort — never fail the parent flow because of this.
  try {
    const apiKey = await resolveProviderKey(userId, providerId);
    if (!apiKey) return null;
    const provider = getProvider(providerId, { model, apiKey });
    const total = template === 'contract'
      ? totalDollarsForContract(payload)
      : totalDollarsForInvoice(payload);
    const context = {
      template,
      homeowner: template === 'contract'
        ? payload.homeowner
        : payload.bill_to,
      total_dollars: total,
      scope_snippet: template === 'contract'
        ? (payload.agreement_summary?.scope_recap || '')
        : (payload.milestone_label || ''),
    };
    const { text } = await provider.generate({
      system: 'You write ONE plain-English sentence summarising a construction document. Never exceed 30 words. No markdown.',
      prompt: `Summarise this ${template} in one sentence:\n${JSON.stringify(context, null, 2)}`,
      temperature: 0.2,
      max_tokens: 80,
    });
    return (text || '').trim().replace(/^["“'`]+|["”'`]+$/g, '').slice(0, 300);
  } catch {
    return null;
  }
}

// ─── Tool executors — one entry per thread tool ───────────
async function executeThreadTool({ call, thread, user, providerId, model, dispatch }) {
  const name = call.name;
  const args = call.arguments || {};

  if (name === 'ask_user') {
    return {
      applied: true,
      user_facing: args.question,
      meta: { hint: args.hint || null, tool: 'ask_user' },
      stage_transition: null,
    };
  }

  if (name === 'set_thread_title') {
    if (args.title) {
      await updateThread(thread.id, user.id, { title: String(args.title).slice(0, 200) });
    }
    return { applied: true, meta: { title: args.title } };
  }

  if (name === 'lookup_document') {
    const svc = serviceClient();
    const { data, error } = await svc
      .from('documents')
      .select('id, template, doc_number, status, payload, total_cents, client_name, summary')
      .eq('id', args.doc_id)
      .eq('created_by', user.id)
      .maybeSingle();
    if (error || !data) return { applied: false, error: 'lookup_failed', meta: { doc_id: args.doc_id } };
    return { applied: true, tool_result: data, meta: { tool: 'lookup_document', doc_id: args.doc_id } };
  }

  if (name === 'refuse_and_summarize') {
    const missing = Array.isArray(args.missing_fields) ? args.missing_fields : [];
    const list = missing.length ? missing.map((f) => `• ${f}`).join('\n') : '• (unspecified)';
    const message =
      `I still need a few more details before I can draft this cleanly:\n${list}\n\n` +
      `Want me to (a) make my best guess, (b) keep asking, or (c) fill these in yourself?`;
    return {
      applied: true,
      user_facing: message,
      meta: { missing_fields: missing, tool: 'refuse_and_summarize' },
      stage_transition: null, // stay in gathering; user must pick a path
    };
  }

  if (name === 'generate_document') {
    const { template, prompt } = args;
    if (!template || !prompt) return { applied: false, error: 'missing_args' };
    let result;
    try {
      result = await generateOneshot({
        prompt,
        template,
        providerId,
        model,
        userId: user.id,
      });
    } catch (e) {
      return { applied: false, error: 'oneshot_failed', detail: e.message };
    }

    const svc = serviceClient();
    // Doc number: reuse the same counter approach as documents.js (next `${prefix}-${year}-${n}`).
    const year = new Date().getFullYear();
    const prefix = template === 'contract' ? 'CTR' : 'INV';
    const { count } = await svc
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', user.id)
      .eq('template', template);
    const docNumber = `${prefix}-${year}-${String((count || 0) + 1).padStart(4, '0')}`;

    // Compute total_cents.
    const totalDollars = template === 'contract'
      ? totalDollarsForContract(result.payload)
      : totalDollarsForInvoice(result.payload);

    const insertRow = {
      created_by: user.id,
      template,
      doc_number: docNumber,
      status: 'draft',
      title:
        template === 'contract'
          ? `Contract — ${result.payload.homeowner?.name || 'Untitled'}`
          : `Invoice ${docNumber}`,
      client_name: result.client_name || null,
      client_email: result.client_email || null,
      total_cents: Math.round(totalDollars * 100),
      payload: result.payload,
      locks: defaultLocksFor(template),
      thread_id: thread.id,
    };

    // Project link (reuses iter-2 helper).
    try {
      const project = await findOrCreateProjectForDocument(user.id, result.payload, template);
      if (project?.id) {
        insertRow.project_id = project.id;
        if (thread.project_id !== project.id) {
          await updateThread(thread.id, user.id, { project_id: project.id });
        }
      }
    } catch { /* non-fatal */ }

    // Generate + store summary (best-effort).
    const summary = await generateSummaryForDoc({
      template,
      payload: result.payload,
      providerId,
      model,
      userId: user.id,
    });
    if (summary) insertRow.summary = summary;

    const { data: inserted, error: insErr } = await svc
      .from('documents')
      .insert(insertRow)
      .select('id, doc_number, template, status, title, client_name, client_email, total_cents, payload, locks, thread_id, project_id, summary, created_at, updated_at')
      .single();
    if (insErr) return { applied: false, error: 'insert_failed', detail: insErr.message };

    // Refresh project.contract_total_cents on new contracts (mirrors documents.js).
    if (template === 'contract' && inserted.project_id) {
      await svc
        .from('projects')
        .update({ contract_total_cents: insertRow.total_cents })
        .eq('id', inserted.project_id)
        .eq('created_by', user.id);
    }

    return {
      applied: true,
      tool_result: { doc_id: inserted.id, doc_number: inserted.doc_number, template },
      new_document: inserted,
      user_facing: null,
      meta: { tool: 'generate_document', doc_id: inserted.id, template },
      stage_transition: 'drafting',
    };
  }

  if (name === 'send_to_client') {
    if (!dispatch) return { applied: false, error: 'dispatch_unavailable' };
    // Reuse the per-doc dispatcher (generate_pdf → email_document).
    const pdfRes = await dispatch({ name: 'generate_pdf', args: {}, docId: args.doc_id });
    if (pdfRes?.error) return { applied: false, error: 'pdf_failed', detail: pdfRes };
    const emailRes = await dispatch({ name: 'email_document', args: { to: args.to }, docId: args.doc_id });
    if (emailRes?.error) return { applied: false, error: 'email_failed', detail: emailRes };
    // Flip doc status to 'sent'.
    const svc = serviceClient();
    await svc
      .from('documents')
      .update({ status: 'sent' })
      .eq('id', args.doc_id)
      .eq('created_by', user.id);
    return {
      applied: true,
      tool_result: { doc_id: args.doc_id, sent_to: args.to || 'homeowner' },
      meta: { tool: 'send_to_client', doc_id: args.doc_id, to: args.to || null },
      stage_transition: 'sending',
    };
  }

  return { applied: false, error: `unknown_tool_${name}` };
}

// ─── Main entry ──────────────────────────────────────────
/**
 * Run one turn of the thread agent.
 * @returns {Promise<{
 *   assistant_message: string,
 *   messages_persisted: number,
 *   applied_tool_calls: Array,
 *   refused: Array,
 *   iterations: number,
 *   new_documents: Array,
 *   thread: object,
 * }>}
 */
export async function runThreadTurn({
  thread,
  messages,
  userMessage,
  user,
  providerId = 'openrouter',
  model,
  dispatch,
}) {
  const tag = (stage, err) => {
    if (err && !err.threadStage) err.threadStage = stage;
    return err;
  };
  if (!userMessage || !userMessage.trim()) throw tag('input', new Error('empty_user_message'));

  let apiKey;
  try {
    apiKey = await resolveProviderKey(user.id, providerId);
  } catch (e) { throw tag('resolve_api_key', e); }
  if (!apiKey) throw tag('resolve_api_key', new Error(`no_api_key_for_provider:${providerId}`));

  let provider;
  try {
    provider = getProvider(providerId, { model, apiKey });
  } catch (e) { throw tag('get_provider', e); }
  if (!provider.supportsTools()) {
    throw tag('get_provider', new Error(`Provider "${providerId}" does not support tools. Try openrouter or cohere.`));
  }

  // Memory context.
  let memory;
  try {
    memory = await listUserMemory(user.id, { limit: 20 });
  } catch (e) { throw tag('list_memory', e); }

  // Docs already in this thread (for the state hint).
  let threadDocs = [];
  try {
    const svc = serviceClient();
    const { data } = await svc
      .from('documents')
      .select('id, doc_number, template, status, total_cents')
      .eq('thread_id', thread.id)
      .eq('created_by', user.id)
      .order('created_at', { ascending: true });
    threadDocs = data || [];
  } catch { /* ignore */ }

  // Compute effective stage — if the thread had a doc drafted but user is still chatting,
  // treat it as editing so we don't try to re-generate.
  let effectiveStage = thread.stage;
  if (effectiveStage === 'gathering' && threadDocs.length > 0) effectiveStage = 'editing';

  const system = threadSystemPrompt({
    stage: effectiveStage,
    clarifyCount: thread.clarify_count,
    memory,
    threadDocs,
  });

  const tools = threadToolDefs();
  const historyBase = historyForLLM(messages);
  const provMessages = [...historyBase, { role: 'user', content: userMessage }];

  // Persistence buffer — everything we accumulate this turn is committed at the end.
  const toPersist = [{ role: 'user', content: userMessage, meta: {} }];
  const appliedTools = [];
  const refusedTools = [];
  const newDocuments = [];
  let assistantReply = '';
  let stageTransition = null;
  let clarifyIncrement = 0;
  let iterations = 0;
  const MAX_ITERATIONS = 4;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    let text, tool_calls;
    try {
      ({ text, tool_calls } = await provider.chat({
        system,
        messages: provMessages,
        tools,
        temperature: 0.3,
        max_tokens: 1200,
      }));
    } catch (e) { throw tag(`llm_iter_${iterations}`, e); }

    if (!tool_calls?.length) {
      assistantReply = (text || '').trim();
      provMessages.push({ role: 'assistant', content: assistantReply });
      toPersist.push({ role: 'assistant', content: assistantReply, meta: {} });
      break;
    }

    // Store the assistant's tool-call message.
    provMessages.push({ role: 'assistant', content: text || '', tool_calls });
    toPersist.push({ role: 'assistant', content: text || '', tool_calls, meta: {} });

    let userFacingMessage = null;
    let mustBreakAfterExec = false;

    for (const call of tool_calls) {
      const result = await executeThreadTool({
        call,
        thread,
        user,
        providerId,
        model,
        dispatch,
      });

      const toolPayload = {
        ok: !!result.applied,
        error: result.error || null,
        result: result.tool_result || null,
      };
      const toolMsg = {
        role: 'tool',
        content: JSON.stringify(toolPayload),
        tool_call_id: call.id,
        meta: { tool: call.name, ...(result.meta || {}) },
      };
      provMessages.push(toolMsg);
      toPersist.push(toolMsg);

      if (result.applied) {
        appliedTools.push({ tool: call.name, args: call.arguments || {}, result: result.tool_result || null });
      } else {
        refusedTools.push({ tool: call.name, args: call.arguments || {}, error: result.error });
      }
      if (result.new_document) newDocuments.push(result.new_document);
      if (result.stage_transition) stageTransition = result.stage_transition;
      if (result.user_facing) userFacingMessage = result.user_facing;

      if (call.name === 'ask_user') {
        clarifyIncrement++;
        mustBreakAfterExec = true;
      }
      if (call.name === 'refuse_and_summarize') {
        mustBreakAfterExec = true;
      }
    }

    // If the model called ask_user / refuse_and_summarize, we terminate this turn and
    // the tool's `user_facing` message is what the user sees. No further LLM round trip.
    if (mustBreakAfterExec) {
      if (userFacingMessage) {
        assistantReply = userFacingMessage;
        toPersist.push({ role: 'assistant', content: userFacingMessage, meta: { synthetic: true } });
      } else {
        assistantReply = '(agent asked but the question was empty)';
      }
      break;
    }
    // Otherwise loop — model will see tool results and either call more tools or reply.
  }

  if (!assistantReply && iterations >= MAX_ITERATIONS) {
    assistantReply = 'I made changes but hit the tool-call limit. Let me know if you want to continue.';
    toPersist.push({ role: 'assistant', content: assistantReply, meta: { synthetic: true, iteration_capped: true } });
  }

  // Persist everything atomically-ish.
  let persisted;
  try {
    persisted = await appendMessages(thread.id, toPersist);
  } catch (e) { throw tag('append_messages', e); }

  // Update thread state.
  const patch = {};
  const nextClarify = thread.clarify_count + clarifyIncrement;
  if (clarifyIncrement > 0) patch.clarify_count = nextClarify;
  if (stageTransition) patch.stage = stageTransition;
  // Auto-advance stage: if we generated a doc, go to editing after this turn (drafting is a transient marker).
  if (newDocuments.length > 0 && !patch.stage) patch.stage = 'editing';
  const nextThread = Object.keys(patch).length > 0
    ? await updateThread(thread.id, user.id, patch)
    : thread;

  return {
    assistant_message: assistantReply,
    messages_persisted: persisted.length,
    applied_tool_calls: appliedTools,
    refused: refusedTools,
    iterations,
    new_documents: newDocuments,
    thread: nextThread,
  };
}
