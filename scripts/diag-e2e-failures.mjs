#!/usr/bin/env node
/**
 * Diagnostic for the four non-passing assertions in e2e-live-api.mjs.
 * Measures rather than assumes. Creates ONE document from a direct payload (no LLM
 * spend) and makes exactly one agent-chat call, then prints the raw evidence.
 */

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

const created = [];

async function main() {
  // Build a document deterministically: valid 100% schedule, start date present, so the
  // only variable under test is what the agent does to it.
  const mk = await call('POST', '/api/documents', {
    template: 'contract',
    title: 'DIAG — safe to delete',
    payload: {
      homeowner: { name: 'Diag Subject', address: '2 Diagnostic Way, Edison NJ', phone: '', email: '' },
      payment: {
        labor_cost_cents: 3395000,
        materials_cost_cents: 1455000,
        total_cents: 4850000,
        schedule: [
          { milestone: 'Deposit', percent: 15, condition: '' },
          { milestone: 'Progress 1', percent: 20, condition: '' },
          { milestone: 'Progress 2', percent: 30, condition: '' },
          { milestone: 'Progress 3', percent: 15, condition: '' },
          { milestone: 'Progress 4', percent: 15, condition: '' },
          { milestone: 'Final', percent: 5, condition: '' },
        ],
        method: 'check',
        notes: '',
      },
      timeline: { start_date: '2026-03-03' },
    },
  });
  const doc = mk.json?.document || mk.json;
  const id = doc?.id;
  if (!id) { console.log('could not create:', JSON.stringify(mk.json).slice(0, 500)); return; }
  created.push(id);
  console.log(`created ${doc.doc_number} -> ${id}`);

  // ── FAILURE 2: what does the PDF endpoint actually return, and is it a real PDF? ──
  line('FAILURE 2 — PDF response shape');
  const pdf = await call('POST', `/api/documents/${id}/pdf`);
  console.log(`HTTP ${pdf.status}  keys=[${Object.keys(pdf.json || {}).join(', ')}]`);
  console.log(`preflight = ${JSON.stringify(pdf.json?.preflight)}`);
  const url = pdf.json?.signed_url;
  if (url) {
    const bin = await fetch(url);
    const buf = Buffer.from(await bin.arrayBuffer());
    console.log(`signed_url -> HTTP ${bin.status}, ${buf.length} bytes, header=${JSON.stringify(buf.subarray(0, 5).toString('latin1'))}`);
    // FlateDecode streams hide text, but @react-pdf writes many strings uncompressed.
    const asText = buf.toString('latin1');
    console.log(`contains "Lump Sum"  : ${asText.includes('Lump Sum')}`);
    console.log(`contains "Lump Sump" : ${asText.includes('Lump Sump')}`);
    // Count parenthesised PDF text-show operands mentioning the phrase, if visible.
    const hits = asText.match(/Lump Sum[p]?/g) || [];
    console.log(`raw occurrences      : ${hits.length} -> ${JSON.stringify([...new Set(hits)])}`);
  }

  // ── FAILURES 3 + 4: exactly what does the agent do, and to what? ──
  line('FAILURES 3 & 4 — agent chat, full response');
  const beforeDoc = (await call('GET', `/api/documents/${id}`)).json;
  const pBefore = (beforeDoc?.document || beforeDoc)?.payload || {};
  console.log(`before: warranties.text = ${JSON.stringify((pBefore.warranties?.text || '').slice(0, 90))}`);
  console.log(`before: schedule        = ${JSON.stringify(pBefore.payment?.schedule)}`);

  const chat = await call('POST', '/api/agent/chat', {
    doc_id: id,
    provider: 'openrouter',
    message: 'In the warranties section only: set the workmanship warranty text to '
      + '"Contractor warrants all workmanship for twenty-four (24) months from substantial completion."',
  });
  console.log(`\nHTTP ${chat.status}  keys=[${Object.keys(chat.json || {}).join(', ')}]`);
  console.log(`payload_changed      = ${JSON.stringify(chat.json?.payload_changed)}`);
  console.log(`applied_tool_calls   = ${JSON.stringify(chat.json?.applied_tool_calls)}`);
  console.log(`refused              = ${JSON.stringify(chat.json?.refused)}`);
  console.log(`confirm_required     = ${JSON.stringify(chat.json?.confirm_required)}`);
  console.log(`blocked_by_guardrails= ${JSON.stringify(chat.json?.blocked_by_guardrails)}`);
  console.log(`reply                = ${JSON.stringify((chat.json?.reply || '').slice(0, 300))}`);

  const afterDoc = (await call('GET', `/api/documents/${id}`)).json;
  const pAfter = (afterDoc?.document || afterDoc)?.payload || {};
  console.log(`\nafter:  warranties.text = ${JSON.stringify((pAfter.warranties?.text || '').slice(0, 90))}`);
  console.log(`after:  schedule        = ${JSON.stringify(pAfter.payment?.schedule)}`);

  line('schedule diff, field by field');
  const a = pBefore.payment?.schedule || [];
  const b = pAfter.payment?.schedule || [];
  console.log(`length before=${a.length} after=${b.length}`);
  console.log(`identical JSON: ${JSON.stringify(a) === JSON.stringify(b)}`);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
      console.log(`  row ${i} CHANGED`);
      console.log(`    before ${JSON.stringify(a[i])}`);
      console.log(`    after  ${JSON.stringify(b[i])}`);
    }
  }

  line('which top-level blocks changed at all');
  const keys = [...new Set([...Object.keys(pBefore), ...Object.keys(pAfter)])].sort();
  for (const k of keys) {
    if (JSON.stringify(pBefore[k]) !== JSON.stringify(pAfter[k])) console.log(`  ${k}`);
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
