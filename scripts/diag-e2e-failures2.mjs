#!/usr/bin/env node
/**
 * Round 2. Three things round 1 could not answer:
 *   A. Is "Lump Sum" actually printed? Round 1 searched the raw PDF bytes, but
 *      @react-pdf Flate-compresses its content streams, so that search was vacuous —
 *      it found neither spelling. Inflate the streams and search the real text.
 *   B. Why did /api/agent/chat return 500 on openrouter and a no-op 200 on cohere?
 *      Round 1 printed neither the error body nor the tool calls.
 *   C. Was the schedule "collateral damage" real, or just key-order sensitivity in
 *      JSON.stringify across a zod round-trip? Prove it either way.
 */

import zlib from 'node:zlib';

const BASE = process.env.E2E_BASE || 'https://sun-vic2.vercel.app';
const TOKEN = process.env.E2E_TOKEN || 'mock-local-token';

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* noop */ }
  return { status: res.status, json, text };
}
const line = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 60 - t.length))}`);

/** Inflate every FlateDecode stream in a PDF and concatenate the decoded text. */
function pdfText(buf) {
  const latin = buf.toString('latin1');
  let out = '';
  let i = 0;
  let streams = 0;
  let inflated = 0;
  for (;;) {
    const s = latin.indexOf('stream', i);
    if (s === -1) break;
    let a = s + 6;
    if (latin[a] === '\r') a += 1;
    if (latin[a] === '\n') a += 1;
    const e = latin.indexOf('endstream', a);
    if (e === -1) break;
    streams += 1;
    const raw = Buffer.from(latin.slice(a, e), 'latin1');
    try { out += zlib.inflateSync(raw).toString('latin1'); inflated += 1; }
    catch { /* not a flate stream (font/image) — skip */ }
    i = e + 9;
  }
  return { text: out, streams, inflated };
}

/** PDF text-show operands: pull the strings out of ( ) Tj / TJ arrays. */
function visibleStrings(streamText) {
  const parts = [];
  const re = /\((?:\\.|[^\\()])*\)/g;
  let m;
  while ((m = re.exec(streamText)) !== null) {
    parts.push(m[0].slice(1, -1).replace(/\\([()\\])/g, '$1'));
  }
  return parts.join('');
}

const created = [];

async function main() {
  const mk = await call('POST', '/api/documents', {
    template: 'contract',
    title: 'DIAG2 — safe to delete',
    payload: {
      homeowner: { name: 'Diag Subject Two', address: '3 Diagnostic Way, Edison NJ', phone: '', email: '' },
      payment: {
        labor_cost_cents: 3395000, materials_cost_cents: 1455000, total_cents: 4850000,
        schedule: [
          { milestone: 'Deposit', percent: 15, condition: '' },
          { milestone: 'Progress 1', percent: 20, condition: '' },
          { milestone: 'Progress 2', percent: 30, condition: '' },
          { milestone: 'Progress 3', percent: 15, condition: '' },
          { milestone: 'Progress 4', percent: 15, condition: '' },
          { milestone: 'Final', percent: 5, condition: '' },
        ],
        method: 'check', notes: '',
      },
      timeline: { start_date: '2026-03-03' },
      scope_of_work: {
        intro: '',
        groups: [{
          category: 'Interiors',
          tasks: [{ task: 'Kitchen cabinets', description: ['Install new cabinets'], qty: 'Lump Sum', unit_price_cents: 4850000, amount_cents: 4850000 }],
        }],
        total_cents: 4850000,
      },
    },
  });
  const doc = mk.json?.document || mk.json;
  const id = doc?.id;
  if (!id) { console.log('create failed:', JSON.stringify(mk.json).slice(0, 600)); return; }
  created.push(id);
  console.log(`created ${doc.doc_number} -> ${id}`);
  console.log(`stored scope qty = ${JSON.stringify(doc.payload?.scope_of_work?.groups?.[0]?.tasks?.[0]?.qty)}`);

  // ── A. Does the rendered PDF actually print "Lump Sum"? ──
  line('A — decompressed PDF text');
  const pdf = await call('POST', `/api/documents/${id}/pdf`);
  const url = pdf.json?.signed_url;
  const bin = await fetch(url);
  const buf = Buffer.from(await bin.arrayBuffer());
  const { text, streams, inflated } = pdfText(buf);
  const shown = visibleStrings(text);
  console.log(`${buf.length} bytes; ${streams} streams, ${inflated} inflated; ${text.length} chars decoded`);
  console.log(`decoded text contains "Lump Sum"  : ${text.includes('Lump Sum')}`);
  console.log(`decoded text contains "Lump Sump" : ${text.includes('Lump Sump')}`);
  console.log(`show-operands contain "Lump Sum"  : ${shown.includes('Lump Sum')}`);
  console.log(`show-operands contain "Lump Sump" : ${shown.includes('Lump Sump')}`);
  const occ = shown.match(/Lump Sum[p]?/g) || [];
  console.log(`occurrences in printed text       : ${occ.length} -> ${JSON.stringify([...new Set(occ)])}`);
  for (const probe of ['Diag Subject Two', 'Kitchen cabinets', 'Interiors', '48,500']) {
    console.log(`  sanity — printed text contains ${JSON.stringify(probe)}: ${shown.includes(probe)}`);
  }

  // ── C. Key-order sensitivity, proven before we touch the agent ──
  line('C — is JSON.stringify comparison sound across a zod round-trip?');
  const sent = { milestone: 'Deposit', percent: 15, condition: '' };
  const stored = (doc.payload?.payment?.schedule || [])[0];
  console.log(`sent   keys: ${JSON.stringify(Object.keys(sent))}`);
  console.log(`stored keys: ${JSON.stringify(Object.keys(stored || {}))}`);
  console.log(`JSON.stringify equal?           ${JSON.stringify(sent) === JSON.stringify(stored)}`);
  const norm = (o) => JSON.stringify(Object.fromEntries(Object.entries(o || {}).sort(([x], [y]) => x.localeCompare(y))));
  console.log(`key-order-normalised equal?     ${norm(sent) === norm(stored)}`);

  // ── B. What does the agent actually do, on each provider? ──
  const msg = 'In the warranties section only: set the workmanship warranty text to '
    + '"Contractor warrants all workmanship for twenty-four (24) months from substantial completion."';
  for (const provider of ['cohere', 'openrouter']) {
    line(`B — /api/agent/chat provider=${provider}`);
    const before = ((await call('GET', `/api/documents/${id}`)).json?.document || {}).payload || {};
    const chat = await call('POST', '/api/agent/chat', { doc_id: id, provider, message: msg });
    console.log(`HTTP ${chat.status}  keys=[${Object.keys(chat.json || {}).join(', ')}]`);
    if (chat.json?.error) console.log(`error   = ${JSON.stringify(chat.json.error)}`);
    if (chat.json?.detail) console.log(`detail  = ${JSON.stringify(String(chat.json.detail)).slice(0, 700)}`);
    console.log(`payload_changed       = ${JSON.stringify(chat.json?.payload_changed)}`);
    console.log(`applied_tool_calls    = ${JSON.stringify(chat.json?.applied_tool_calls)}`);
    console.log(`refused               = ${JSON.stringify(chat.json?.refused)}`);
    console.log(`confirm_required      = ${JSON.stringify(chat.json?.confirm_required)}`);
    console.log(`blocked_by_guardrails = ${JSON.stringify(chat.json?.blocked_by_guardrails)}`);
    console.log(`iterations            = ${JSON.stringify(chat.json?.iterations)}`);
    console.log(`reply                 = ${JSON.stringify((chat.json?.reply || '').slice(0, 400))}`);
    const after = ((await call('GET', `/api/documents/${id}`)).json?.document || {}).payload || {};
    console.log(`warranties.text changed: ${JSON.stringify(before.warranties?.text) !== JSON.stringify(after.warranties?.text)}`);
    console.log(`  now: ${JSON.stringify((after.warranties?.text || '').slice(0, 140))}`);
    const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    console.log(`blocks changed this turn: ${JSON.stringify(changed)}`);
    if (chat.status === 200 && chat.json?.payload_changed) break;
  }

  for (const cid of created) {
    await call('DELETE', `/api/documents/${cid}`);
    await call('DELETE', `/api/documents/${cid}?permanent=1`);
  }
  console.log('\ncleaned up.');
}

main().catch(async (e) => {
  console.error('crashed:', e);
  for (const cid of created) {
    await call('DELETE', `/api/documents/${cid}`);
    await call('DELETE', `/api/documents/${cid}?permanent=1`);
  }
});
