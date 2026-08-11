// Thread-agent orchestrator — slot-driven.
//
// State machine per turn:
//
//   1. Determine template (classifier if thread.template is null).
//   2. If thread.pending_slot is set, coerce the user's message into that slot
//      and clear pending_slot.
//   3. Run all extractors over the concatenated user history to opportunistically
//      auto-fill additional slots.
//   4. If we already have a document in the thread OR the user is issuing an
//      action ("send it"), skip gathering and hand off to the LLM in editing mode.
//   5. Otherwise:
//      - If all required slots are filled → LLM turn with template="drafting"
//        system prompt that pushes it toward generate_document.
//      - Elif clarify_count < MAX → LLM turn with tools = [ask_slot] only,
//        strongly hinted to pick the next required slot.
//      - Else (clarify_count >= MAX) → LLM turn with tools = [refuse_and_summarize].
//
// The tool loop after that is the same shape as the previous free-form agent
// (LLM → tool_calls → executor → maybe loop); the difference is that ask_slot
// is deterministic — the server, not the LLM, renders the question text.

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
import { TAX } from '../config/business.js';
import {
  slotDefsFor,
  slotByKey,
  slotsToOneshotPrompt,
  autoFillSlots,
  nextRequiredSlot,
  missingRequiredSlots,
  coerceSlotValue,
  foreignSlotHits,
  clarifyBudget,
} from './thread-slots.js';

// NOTE: there is deliberately no MAX_CLARIFY_TURNS constant any more. A fixed
// cap of 3 made a 5-required-slot contract impossible to finish (see
// clarifyBudget in thread-slots.js). The budget is per-template, and the
// counter only advances on turns that learn nothing.
const MAX_ITERATIONS = 4;

// ─── Template classifier (single-shot) ────────────────────

async function classifyTemplate({ userMessage, threadTitle, provider }) {
  // Quick keyword prescan — free.
  const t = `${threadTitle || ''} ${userMessage || ''}`.toLowerCase();
  if (/\binvoice\b|\bdeposit\s+invoice\b|\bmilestone\s+invoice\b|\bbill\b/.test(t) && !/\bcontract\b/.test(t)) {
    return 'invoice';
  }
  if (/\bcontract\b|\breno(?:vation)?\b|\bnew\s+build\b|\baddition\b|\bkitchen\b|\bbath(?:room)?\b|\broof\b|\bsiding\b/.test(t) && !/\binvoice\b/.test(t)) {
    return 'contract';
  }
  // Otherwise ask the LLM in a single tiny call.
  try {
    const { text } = await provider.generate({
      system: 'You classify a user request as either "contract" or "invoice". Reply with ONLY the word "contract" or "invoice". No punctuation, no explanation.',
      prompt: userMessage,
      temperature: 0,
      max_tokens: 8,
    });
    const v = (text || '').trim().toLowerCase().replace(/[^a-z]/g, '');
    if (v === 'invoice') return 'invoice';
    if (v === 'contract') return 'contract';
  } catch { /* ignore */ }
  return 'contract'; // safe default
}

// ─── System prompt (slot-aware) ───────────────────────────

function threadSystemPrompt({ stage, template, gathered, missing, clarifyCount, clarifyMax, memory, threadDocs, pendingSlot }) {
  const projects = memory.projects || [];
  const docs = memory.documents || [];

  const projectLines = projects.slice(0, 10).map((p) =>
    `- ${p.name} · homeowner=${p.homeowner_name || '—'} · address=${p.property_address || '—'} · total=${((p.contract_total_cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} · status=${p.status}`
  );
  const docLines = docs.slice(0, 15).map((d) =>
    `- id=${d.id} · ${d.template} ${d.doc_number} · ${d.client_name || '—'} · $${((d.total_cents || 0) / 100).toFixed(0)} · ${d.status}${d.summary ? ` · summary="${d.summary}"` : ''}`
  );
  const threadDocLines = (threadDocs || []).map((d) =>
    `- id=${d.id} · ${d.template} ${d.doc_number} · status=${d.status} · $${((d.total_cents || 0) / 100).toFixed(0)}`
  );

  const defs = template ? slotDefsFor(template) : [];
  const filledLines = defs
    .filter((d) => {
      const v = gathered[d.key];
      return v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
    })
    .map((d) => {
      let v = gathered[d.key];
      if (d.type === 'money') v = `$${(v / 100).toLocaleString('en-US')}`;
      if (Array.isArray(v)) v = v.join(', ');
      return `- [FILLED] ${d.key} (${d.label}): ${v}`;
    });
  const missingLines = (missing || []).map((d) =>
    `- [MISSING${d.required ? '/REQUIRED' : ''}] ${d.key} (${d.label})`
  );

  const stageHint = {
    gathering: [
      `Your current job is to GATHER the fields listed below before drafting the ${template || 'document'}.`,
      `Constraint: call ONLY the ask_slot tool right now, and pass one of the MISSING/REQUIRED slot keys shown below.`,
      `Do NOT compose your own question — the server will show the user the canonical question for that slot.`,
      `You have used ${clarifyCount} of ${clarifyMax} unproductive clarifying questions so far (the counter resets whenever the user actually tells you something).`,
    ].join('\n'),
    ready_to_generate: [
      `All required slots are filled. Your job now is to call generate_document to create the ${template}.`,
      `Do NOT ask more questions. Do NOT call ask_slot. Do NOT restate the slots in prose.`,
      `Call generate_document with no arguments (the server will use the gathered slots).`,
    ].join('\n'),
    refuse: [
      `You have used all ${clarifyMax} clarifying questions without learning anything new, and the required slots below are still empty.`,
      `Your only valid move is to call refuse_and_summarize with the list of missing slot keys.`,
      `Do NOT call ask_slot again. Do NOT call generate_document.`,
    ].join('\n'),
    drafting: [
      `A document was just generated. Confirm what you created in one short sentence and offer next steps ("Want me to email it to the homeowner? Or make edits?").`,
      `Do NOT call generate_document again.`,
    ].join('\n'),
    editing: [
      `The document exists and the user wants edits or actions. Use send_to_client to email; use lookup_document when you need to reference another doc.`,
      `Do NOT call ask_slot — this stage is action, not info-gathering.`,
    ].join('\n'),
    sending: 'A send is in progress. Confirm success briefly.',
    done:    'The job is complete. Answer questions but be concise.',
  }[stage] || '';

  const parts = [
    'You are Sunvic Contractors LLC\'s agentic assistant. You help a construction business owner (the user) prepare CONTRACTS and INVOICES for their homeowner clients through natural conversation.',
    '',
    'The user is the CONTRACTOR, not the homeowner. Speak to them as "you"; call the homeowner by name.',
    '',
    `Current template: ${template || '(unknown)'}`,
    '',
    stageHint,
    '',
  ];

  if (template) {
    parts.push('Slot checklist:');
    if (filledLines.length) parts.push(...filledLines);
    if (missingLines.length) parts.push(...missingLines);
    if (!filledLines.length && !missingLines.length) parts.push('(no slots)');
    parts.push('');
  }

  if (pendingSlot) {
    parts.push(`(The user's last reply was in response to a request for slot "${pendingSlot}". If they answered, it has already been recorded.)`);
    parts.push('');
  }

  parts.push(
    'Ground rules:',
    '- Prefer TOOLS over prose. When action is needed, call the tool; do not describe what you would do.',
    '- Never invent a homeowner. If a project in memory matches, mention it once.',
    '- Never invent legal text — Sunvic contract legal blocks are canonical and server-side.',
    `- Money: NJ pricing — gut renos $200–300/sqft, kitchens $30–80k, baths $15–35k. NJ tax ${TAX.rate_percent}%, ${TAX.applies_to === 'materials_only' ? 'materials-only' : TAX.applies_to}.`,
    '- Keep replies to one or two short sentences plus one tool call.',
    '',
    'Memory — recent projects for this user:',
    projectLines.length ? projectLines.join('\n') : '(no prior projects)',
    '',
    'Memory — recent documents:',
    docLines.length ? docLines.join('\n') : '(no prior documents)',
    '',
    'This thread already has these documents:',
    threadDocLines.length ? threadDocLines.join('\n') : '(none yet)',
  );

  return parts.join('\n');
}

// ─── Helpers ──────────────────────────────────────────────

function historyForLLM(messages) {
  return messages.map((m) => {
    const base = { role: m.role, content: m.content || '' };
    if (m.tool_calls) base.tool_calls = m.tool_calls;
    if (m.tool_call_id) base.tool_call_id = m.tool_call_id;
    return base;
  });
}

async function generateSummaryForDoc({ template, payload, providerId, model, userId }) {
  try {
    const apiKey = await resolveProviderKey(userId, providerId);
    if (!apiKey) return null;
    const provider = getProvider(providerId, { model, apiKey });
    const total = template === 'contract'
      ? totalDollarsForContract(payload)
      : totalDollarsForInvoice(payload);
    const context = {
      template,
      homeowner: template === 'contract' ? payload.homeowner : payload.bill_to,
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

// Best-effort: look up a doc for lookup_document by uuid, doc_number, or name.
async function resolveDocRef(user, identifier) {
  if (!identifier) return null;
  const svc = serviceClient();
  const idStr = String(identifier).trim();
  // Try UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idStr)) {
    const { data } = await svc
      .from('documents')
      .select('id, template, doc_number, status, payload, total_cents, client_name, summary')
      .eq('id', idStr)
      .eq('created_by', user.id)
      .maybeSingle();
    if (data) return data;
  }
  // Try doc_number
  if (/^(CTR|INV)-\d{4}-\d{4}$/i.test(idStr)) {
    const { data } = await svc
      .from('documents')
      .select('id, template, doc_number, status, payload, total_cents, client_name, summary')
      .eq('doc_number', idStr.toUpperCase())
      .eq('created_by', user.id)
      .maybeSingle();
    if (data) return data;
  }
  // Homeowner name search (contract only makes sense to link an invoice)
  const { data: hits } = await svc
    .from('documents')
    .select('id, template, doc_number, status, payload, total_cents, client_name, summary')
    .eq('created_by', user.id)
    .ilike('client_name', `%${idStr}%`)
    .order('created_at', { ascending: false })
    .limit(1);
  return hits?.[0] || null;
}

// ─── Deterministic slot flow ──────────────────────────────

// Try to write user's message into thread.pending_slot. Returns { key, value } if
// successful, else { key, error }.
// Exported so tests exercise the real function rather than a copy of it. A mirrored copy in a
// test is how the verbatim-message bug survived: the unit tests never ran this code path.
export function absorbPendingSlot(template, pendingSlotKey, userMessage) {
  if (!pendingSlotKey) return null;
  const def = slotByKey(template, pendingSlotKey);
  if (!def) return null;

  // 1. A liberal extractor that only exists because we KNOW this slot was just asked. Safe
  //    here in a way it would not be inside autoFillSlots, which scans the whole thread.
  let answered = null;
  try { answered = def.answerExtract ? def.answerExtract(userMessage) : null; } catch { answered = null; }
  if (answered != null) {
    const c = coerceSlotValue(def, answered);
    if (c.ok) return { key: def.key, value: c.value, via: 'answer' };
  }

  // 2. The conservative context-free extractor.
  let extracted = null;
  try { extracted = def.extract ? def.extract(userMessage) : null; } catch { extracted = null; }
  if (extracted != null) {
    const coerced = coerceSlotValue(def, extracted);
    if (coerced.ok) return { key: def.key, value: coerced.value, via: 'extract' };
  }

  // 3. Last resort is writing the message in verbatim, and that is where real damage happened:
  //    a contract was generated with homeowner.name = "Jane Smith, full gut renovation at 36
  //    Bushnell Rd, $65,000, starting September 1 2026." because coerceSlotValue accepts any
  //    non-empty string for type:'string'. The fallback is still load-bearing ("Jane Smith"
  //    fails every pattern above and must be accepted), so it is gated rather than removed.
  const raw = String(userMessage || '').trim();

  //    3a. If the message carries other slots' content it is a compound sentence, not an
  //        answer. Refuse; autoFillSlots below will harvest what it can and the agent re-asks.
  const foreign = foreignSlotHits(template, def.key, userMessage);
  if (foreign.length > 0) {
    return { key: def.key, error: 'compound_message', foreign };
  }

  //    3b. Slot-specific shape check, so "i dont know yet" never becomes a legal name.
  if (def.validateRaw && !def.validateRaw(raw)) {
    return { key: def.key, error: 'raw_rejected' };
  }

  const direct = coerceSlotValue(def, raw);
  if (direct.ok) return { key: def.key, value: direct.value, via: 'raw' };

  return { key: def.key, error: direct.error || 'coerce_failed' };
}

// ─── Tool executors ───────────────────────────────────────

async function executeThreadTool({ call, thread, user, providerId, model, dispatch, template, gatheredSlots }) {
  const name = call.name;
  const args = call.arguments || {};

  if (name === 'ask_slot') {
    const slotKey = args.slot_key;
    if (!slotKey || !template) {
      return { applied: false, error: 'invalid_slot_ask', meta: { slot_key: slotKey } };
    }
    const def = slotByKey(template, slotKey);
    if (!def) {
      return { applied: false, error: 'unknown_slot', meta: { slot_key: slotKey } };
    }
    // Guard: don't re-ask a slot that's already filled.
    const cur = gatheredSlots[slotKey];
    if (cur != null && cur !== '' && !(Array.isArray(cur) && cur.length === 0)) {
      return { applied: false, error: 'slot_already_filled', meta: { slot_key: slotKey } };
    }
    const question = def.hint ? `${def.question}\n\n${def.hint}` : def.question;
    return {
      applied: true,
      user_facing: question,
      meta: { tool: 'ask_slot', slot_key: slotKey, slot_label: def.label },
      pending_slot: slotKey,
    };
  }

  if (name === 'set_thread_title') {
    if (args.title) {
      await updateThread(thread.id, user.id, { title: String(args.title).slice(0, 200) });
    }
    return { applied: true, meta: { title: args.title } };
  }

  if (name === 'lookup_document') {
    const doc = await resolveDocRef(user, args.identifier || args.doc_id);
    if (!doc) return { applied: false, error: 'lookup_failed', meta: { identifier: args.identifier || args.doc_id } };
    return { applied: true, tool_result: doc, meta: { tool: 'lookup_document', doc_id: doc.id } };
  }

  if (name === 'refuse_and_summarize') {
    const keys = Array.isArray(args.missing_slot_keys) ? args.missing_slot_keys : [];
    const labels = keys.map((k) => {
      const def = template ? slotByKey(template, k) : null;
      return def ? def.label : k;
    });
    const list = labels.length ? labels.map((f) => `• ${f}`).join('\n') : '• (unspecified)';
    const message =
      `I still need a few more details before I can draft this cleanly:\n${list}\n\n` +
      `Want me to (a) make my best guess, (b) keep asking, or (c) fill these in yourself?`;
    return {
      applied: true,
      user_facing: message,
      meta: { missing_slot_keys: keys, tool: 'refuse_and_summarize' },
    };
  }

  if (name === 'generate_document') {
    const effectiveTemplate = args.template || template;
    if (!effectiveTemplate) return { applied: false, error: 'no_template' };

    const slots = gatheredSlots || {};
    const slotsPrompt = slotsToOneshotPrompt(effectiveTemplate, slots);
    const extra = (args.extra_context || '').trim();
    const prompt = [
      `Prepare a ${effectiveTemplate} with the following user-provided fields:`,
      slotsPrompt || '(none provided — use defaults)',
      extra ? `\nAdditional context:\n${extra}` : '',
    ].filter(Boolean).join('\n');

    // For invoices, resolve the linked contract so the milestone math is anchored
    // on the real contract total (closes the gap where the generator had to guess).
    let invoiceContext = {};
    if (effectiveTemplate === 'invoice') {
      const linkRef = slots['linked_contract_id'];
      let linkedContract = null;
      if (linkRef) {
        try { linkedContract = await resolveDocRef(user, linkRef); } catch { linkedContract = null; }
      }
      if (linkedContract && linkedContract.template === 'contract') {
        const cp = linkedContract.payload || {};
        invoiceContext = {
          contractTotalCents:
            linkedContract.total_cents ||
            cp?.payment?.total_cents ||
            cp?.scope_of_work?.total_cents || 0,
          contractRef: linkedContract.doc_number || linkRef,
          billTo: {
            client_name: cp?.homeowner?.name || linkedContract.client_name || '',
            property_address: cp?.homeowner?.address || '',
            recipient_email: cp?.homeowner?.email || '',
            recipient_phone: cp?.homeowner?.phone || '',
          },
        };
      }
    }

    let result;
    try {
      result = await generateOneshot({
        prompt,
        template: effectiveTemplate,
        providerId,
        model,
        userId: user.id,
        gatheredSlots: slots,
        invoiceContext,
      });
    } catch (e) {
      return { applied: false, error: 'oneshot_failed', detail: e.message };
    }

    const svc = serviceClient();
    // Use the atomic next_doc_number() counter (same as the REST documents.js path).
    // The previous count(contracts)+1 approach raced and collided with existing
    // doc_numbers (doc_number is globally UNIQUE), causing insert_failed on generate.
    const { data: docNumber, error: numErr } = await svc.rpc('next_doc_number', { p_template: effectiveTemplate });
    if (numErr || !docNumber) {
      return { applied: false, error: 'doc_number_failed', detail: numErr?.message || 'no number returned' };
    }

    const totalDollars = effectiveTemplate === 'contract'
      ? totalDollarsForContract(result.payload)
      : totalDollarsForInvoice(result.payload);

    const insertRow = {
      created_by: user.id,
      template: effectiveTemplate,
      doc_number: docNumber,
      status: 'draft',
      title:
        effectiveTemplate === 'contract'
          ? `Contract — ${result.payload.homeowner?.name || 'Untitled'}`
          : `Invoice ${docNumber}`,
      client_name: result.client_name || null,
      client_email: result.client_email || null,
      total_cents: Math.round(totalDollars * 100),
      payload: result.payload,
      locks: defaultLocksFor(effectiveTemplate),
      thread_id: thread.id,
    };

    try {
      const project = await findOrCreateProjectForDocument(user.id, result.payload, effectiveTemplate);
      if (project?.id) {
        insertRow.project_id = project.id;
        if (thread.project_id !== project.id) {
          await updateThread(thread.id, user.id, { project_id: project.id });
        }
      }
    } catch { /* non-fatal */ }

    const summary = await generateSummaryForDoc({
      template: effectiveTemplate,
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

    if (effectiveTemplate === 'contract' && inserted.project_id) {
      await svc
        .from('projects')
        .update({ contract_total_cents: insertRow.total_cents })
        .eq('id', inserted.project_id)
        .eq('created_by', user.id);
    }

    return {
      applied: true,
      tool_result: { doc_id: inserted.id, doc_number: inserted.doc_number, template: effectiveTemplate },
      new_document: inserted,
      user_facing: null,
      meta: { tool: 'generate_document', doc_id: inserted.id, template: effectiveTemplate },
      stage_transition: 'drafting',
    };
  }

  if (name === 'send_to_client') {
    if (!dispatch) return { applied: false, error: 'dispatch_unavailable' };
    const pdfRes = await dispatch({ name: 'generate_pdf', args: {}, docId: args.doc_id });
    if (pdfRes?.error) return { applied: false, error: 'pdf_failed', detail: pdfRes };
    const emailRes = await dispatch({ name: 'email_document', args: { to: args.to }, docId: args.doc_id });
    if (emailRes?.error) return { applied: false, error: 'email_failed', detail: emailRes };
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

// ─── Main entry ───────────────────────────────────────────

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

  let memory;
  try {
    memory = await listUserMemory(user.id, { limit: 20 });
  } catch (e) { throw tag('list_memory', e); }

  // Doc records already tied to this thread (for the "editing" branch).
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

  // ─── Step 1: template ────────────────────────────
  let template = thread.template || null;
  const threadPatchImmediate = {};
  if (!template) {
    try {
      template = await classifyTemplate({
        userMessage,
        threadTitle: thread.title,
        provider,
      });
    } catch (e) { throw tag('classify_template', e); }
    threadPatchImmediate.template = template;
  }

  // ─── Step 2: absorb pending slot from previous ask_slot ─
  const gathered = { ...(thread.gathered_slots || {}) };
  const pendingSlot = thread.pending_slot || null;

  let absorbed = null;
  if (pendingSlot) {
    absorbed = absorbPendingSlot(template, pendingSlot, userMessage);
    if (absorbed?.value != null && !absorbed.error) {
      gathered[absorbed.key] = absorbed.value;
    }
    threadPatchImmediate.pending_slot = null;
  }

  // ─── Step 3: opportunistic auto-fill from all user history ─
  const userMessageTexts = [
    ...messages.filter((m) => m.role === 'user').map((m) => m.content),
    userMessage,
  ];
  const { patch: extractedPatch, newlyFilled } = autoFillSlots(template, gathered, userMessageTexts);
  Object.assign(gathered, extractedPatch);
  if (Object.keys(extractedPatch).length > 0 || absorbed?.value != null) {
    threadPatchImmediate.gathered_slots = gathered;
  }

  // Did this turn actually learn something? The clarify budget exists to stop a
  // stalled interrogation, not to cap a legitimate interview — so a turn where
  // the user answered must not spend budget. Without this reset, a cooperative
  // user answering one question per turn still hits the cap and gets refused.
  const learnedSomething =
    Object.keys(extractedPatch).length > 0 || (absorbed?.value != null && !absorbed.error);

  // ─── Step 4: figure out stage for this turn ─────
  const missingReq = missingRequiredSlots(template, gathered);
  const hasDoc = threadDocs.length > 0;
  // A productive turn zeroes the stall counter; an unproductive one carries it.
  const clarifyCount = learnedSomething ? 0 : (thread.clarify_count || 0);
  if (learnedSomething && (thread.clarify_count || 0) !== 0) {
    threadPatchImmediate.clarify_count = 0;
  }
  const clarifyMax = clarifyBudget(template);

  let effectiveStage;
  let toolsSubset;
  if (hasDoc) {
    effectiveStage = 'editing';
    toolsSubset = threadToolDefs().filter((t) =>
      ['send_to_client', 'lookup_document', 'set_thread_title'].includes(t.name)
    );
  } else if (missingReq.length === 0) {
    effectiveStage = 'ready_to_generate';
    toolsSubset = threadToolDefs().filter((t) =>
      ['generate_document', 'lookup_document', 'set_thread_title'].includes(t.name)
    );
  } else if (clarifyCount >= clarifyMax) {
    effectiveStage = 'refuse';
    // ask_slot stays on the menu even here. Declaring a single tool is what
    // turned "the model wants to ask another question" into a hard Cohere 422
    // (HALLUCINATED_ALL_TOOL_CALLS); the prompt, not the schema, is what steers
    // it toward refusing, and executeThreadTool still owns the final say.
    toolsSubset = threadToolDefs().filter((t) =>
      ['refuse_and_summarize', 'ask_slot'].includes(t.name)
    );
  } else {
    effectiveStage = 'gathering';
    toolsSubset = threadToolDefs().filter((t) =>
      ['ask_slot', 'set_thread_title', 'lookup_document'].includes(t.name)
    );
  }

  const missingAll = template
    ? slotDefsFor(template).filter((d) => {
        const v = gathered[d.key];
        return v == null || v === '' || (Array.isArray(v) && v.length === 0);
      })
    : [];

  const system = threadSystemPrompt({
    stage: effectiveStage,
    template,
    gathered,
    missing: missingAll,
    clarifyCount,
    clarifyMax,
    memory,
    threadDocs,
    pendingSlot,
  });

  const historyBase = historyForLLM(messages);
  const provMessages = [...historyBase, { role: 'user', content: userMessage }];

  // Persistence buffer for this turn.
  const toPersist = [{ role: 'user', content: userMessage, meta: {} }];
  // If we absorbed a pending slot, record that as an internal system-note tool
  // message so the UI can show "recorded X" if we want later.
  const appliedTools = [];
  const refusedTools = [];
  const newDocuments = [];
  let assistantReply = '';
  let stageTransition = null;
  let clarifyIncrement = 0;
  let pendingSlotAfter = null;
  let iterations = 0;
  let providerFailure = null;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    let text, tool_calls;
    try {
      ({ text, tool_calls } = await provider.chat({
        system,
        messages: provMessages,
        tools: toolsSubset,
        temperature: 0.3,
        max_tokens: 1200,
        // Ask the provider to constrain generation to the tools we actually
        // declared. Adapters that cannot do this ignore the flag.
        strict_tools: true,
      }));
    } catch (e) {
      // A provider outage must not eat the user's answer. Everything we learned
      // before the call (absorbed slot, classified template, cleared pending
      // slot, reset counter) is already in threadPatchImmediate and gets
      // persisted below, and the user's message is already in toPersist — so
      // the next turn resumes from the right place instead of rewinding.
      providerFailure = tag(`llm_iter_${iterations}`, e);
      console.error('[thread-agent] provider failed, degrading turn:', providerFailure?.message);
      break;
    }

    if (!tool_calls?.length) {
      assistantReply = (text || '').trim();
      provMessages.push({ role: 'assistant', content: assistantReply });
      toPersist.push({ role: 'assistant', content: assistantReply, meta: {} });
      break;
    }

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
        template,
        gatheredSlots: gathered,
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
      if (result.pending_slot) pendingSlotAfter = result.pending_slot;

      if (call.name === 'ask_slot' && result.applied) {
        clarifyIncrement++;
        mustBreakAfterExec = true;
      }
      if (call.name === 'refuse_and_summarize') {
        mustBreakAfterExec = true;
      }
    }

    if (mustBreakAfterExec) {
      if (userFacingMessage) {
        assistantReply = userFacingMessage;
        toPersist.push({ role: 'assistant', content: userFacingMessage, meta: { synthetic: true } });
      } else {
        assistantReply = '(agent asked but the question was empty)';
      }
      break;
    }
  }

  if (providerFailure && !assistantReply) {
    const stillNeeded = missingRequiredSlots(template, gathered);
    const next = stillNeeded[0];
    assistantReply = next
      ? `I saved what you just told me, but the model call failed on that turn. Nothing is lost — say anything to continue, and I still need ${next.label.toLowerCase()}.`
      : 'I saved what you just told me, but the model call failed on that turn. Nothing is lost — say anything to continue.';
    toPersist.push({
      role: 'assistant',
      content: assistantReply,
      meta: { synthetic: true, degraded: true, provider_error: providerFailure?.message || 'provider_failed' },
    });
  }

  if (!assistantReply && iterations >= MAX_ITERATIONS) {
    assistantReply = 'I made changes but hit the tool-call limit. Let me know if you want to continue.';
    toPersist.push({ role: 'assistant', content: assistantReply, meta: { synthetic: true, iteration_capped: true } });
  }

  // Persist.
  let persisted;
  try {
    persisted = await appendMessages(thread.id, toPersist);
  } catch (e) { throw tag('append_messages', e); }

  // Compose thread patch.
  const patch = { ...threadPatchImmediate };
  if (clarifyIncrement > 0) patch.clarify_count = clarifyCount + clarifyIncrement;
  if (pendingSlotAfter) patch.pending_slot = pendingSlotAfter;
  if (stageTransition) patch.stage = stageTransition;
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
    degraded: providerFailure ? { code: 'provider_failed', detail: providerFailure?.message || null } : null,
    slot_state: {
      template,
      gathered_slots: gathered,
      pending_slot: pendingSlotAfter,
      clarify_count: clarifyCount + clarifyIncrement,
      newly_filled_from_extract: newlyFilled,
    },
  };
}
