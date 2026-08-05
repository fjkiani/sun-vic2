#!/usr/bin/env node
/**
 * Iteration 6 live end-to-end, against production with the real LLM and the real database.
 *
 * Nothing here is mocked. Every document created is created through the deployed API and
 * every document created is deleted again at the end, so the account is left as it was
 * found. LLM calls are kept to the minimum that still proves the path (the Cohere key is
 * on a 1,000-call trial), so the generation step runs once and everything downstream is
 * asserted against that one real document.
 *
 * Usage: node scripts/e2e-live-api.mjs [--keep]
 */

const BASE = process.env.E2E_BASE || 'https://sun-vic2.vercel.app';
const TOKEN = process.env.E2E_TOKEN || 'mock-local-token';
const KEEP = process.argv.includes('--keep');
const SIGNED_DOC = '288b1faf-26e0-4b58-8b8e-91e0575daafc'; // CTR-2026-0017, Jane Smith, $65,000

let pass = 0;
const failures = [];
const created = [];

function ok(cond, label, detail) {
  if (cond) { pass += 1; console.log(`  ok   ${label}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail !== undefined ? ` — ${detail}` : ''}`); }
}
function eq(actual, expected, label) {
  ok(actual === expected, label, `got ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`);
}

async function call(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* pdf/base64 or empty */ }
  return { status: res.status, json, text };
}

const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 58 - t.length))}`);
const jsonHas = (obj, needle) => JSON.stringify(obj || {}).includes(needle);

// ────────────────────────────────────────────────────────────
async function main() {
  console.log(`Live E2E against ${BASE}\n`);

  // 1. Generation through the real LLM ───────────────────────
  section('1. create a contract from a Copilot prompt (real LLM)');
  const prompt = 'New contract for Maria Delgado at 88 Raritan Avenue, Highland Park NJ. '
    + 'Interior renovation: kitchen cabinets and countertops, bathroom tile, and interior painting. '
    + 'Total is $48,500. Start date March 3 2026.';
  const t0 = Date.now();
  let gen = await call('POST', '/api/documents', { prompt, provider: 'cohere' });
  if (gen.status === 429 || jsonHas(gen.json, 'rate') || jsonHas(gen.json, 'quota')) {
    console.log('  (cohere rate-limited — falling back to openrouter)');
    gen = await call('POST', '/api/documents', { prompt, provider: 'openrouter' });
  }
  eq(gen.status, 200, 'Generation returns 200');
  const doc = gen.json?.document || gen.json;
  const docId = doc?.id;
  if (!docId) {
    console.log('  cannot continue without a document:', JSON.stringify(gen.json).slice(0, 400));
    return report();
  }
  created.push(docId);
  console.log(`  created ${doc.doc_number} in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${docId}`);

  const p = doc.payload || {};
  ok(/Delgado/i.test(p.homeowner?.name || ''), 'Homeowner name extracted', p.homeowner?.name);
  ok(/Raritan/i.test(p.homeowner?.address || ''), 'Property address extracted', p.homeowner?.address);
  ok(Number(p.payment?.total_cents) === 4850000, 'Contract total is $48,500', p.payment?.total_cents);
  ok((p.scope_of_work?.groups || []).length > 0, 'Scope groups populated',
    (p.scope_of_work?.groups || []).map((g) => g.category).join(' | '));
  ok(!!p.timeline?.start_date, 'Start date populated', p.timeline?.start_date);

  // 2. The typo must not come back on freshly generated documents ─
  section('2. Lump Sum, not Lump Sump');
  const raw = JSON.stringify(p);
  ok(!raw.includes('Lump Sump'), 'Fresh document contains no "Lump Sump"');
  ok(raw.includes('Lump Sum'), 'Fresh document does contain "Lump Sum"');

  // 3. The document is renderable ────────────────────────────
  section('3. PDF renders and prints the corrected quantity');
  const pdf = await call('POST', `/api/documents/${docId}/pdf`);
  eq(pdf.status, 200, 'PDF generation returns 200');
  // The endpoint answers with a signed storage URL, not inline base64 — fetch the bytes.
  const signed = pdf.json?.signed_url;
  ok(!!signed, 'Response carries a signed_url', Object.keys(pdf.json || {}).join(','));
  if (signed) {
    const bin = await fetch(signed);
    const buf = Buffer.from(await bin.arrayBuffer());
    eq(buf.subarray(0, 5).toString(), '%PDF-', 'Bytes are a real PDF');
    ok(buf.length > 10000, 'PDF is substantive', `${buf.length} bytes`);
  }
  ok(pdf.json?.preflight !== undefined, 'Response carries a preflight result',
    JSON.stringify(pdf.json?.preflight || {}).slice(0, 160));

  // 4. Guardrail: unbalanced schedule blocks delivery ─────────
  section('4. a 95% schedule is caught, and the sum is named');
  const bad = {
    ...p.payment,
    schedule: [
      { milestone: 'Deposit', percent: 15, condition: '' },
      { milestone: 'Progress 1', percent: 20, condition: '' },
      { milestone: 'Progress 2', percent: 30, condition: '' },
      { milestone: 'Progress 3', percent: 15, condition: '' },
      { milestone: 'Progress 4', percent: 15, condition: '' },
    ],
  };
  const saveBad = await call('PATCH', `/api/documents/${docId}`, { payload: { ...p, payment: bad } });
  eq(saveBad.status, 200, 'Draft edit with a bad schedule still saves (autosave must not lose keystrokes)');
  const issues = saveBad.json?.validation?.issues || [];
  ok(issues.some((i) => i.code === 'schedule_unbalanced'), 'Response reports schedule_unbalanced',
    issues.map((i) => i.code).join(', '));
  ok(issues.some((i) => /95%/.test(i.message || '')), 'The message names the actual sum',
    issues.map((i) => i.message).join(' | ').slice(0, 200));

  const send = await call('PATCH', `/api/documents/${docId}`, { status: 'sent' });
  eq(send.status, 409, 'Marking it sent is blocked');
  eq(send.json?.error, 'validation_failed', '...with error validation_failed');
  ok(/95%/.test(send.json?.detail || ''), '...naming the sum in the detail', send.json?.detail);

  const email = await call('POST', `/api/documents/${docId}/email`, { to: 'nobody@example.com' });
  ok(email.status === 409, 'Email is blocked while the schedule is unbalanced', `HTTP ${email.status}`);
  eq(email.json?.error, 'not_ready', '...with error not_ready');

  // restore a valid schedule and confirm the block lifts
  const good = {
    ...p.payment,
    schedule: [
      { milestone: 'Deposit', percent: 15, condition: '' },
      { milestone: 'Progress 1', percent: 20, condition: '' },
      { milestone: 'Progress 2', percent: 30, condition: '' },
      { milestone: 'Progress 3', percent: 15, condition: '' },
      { milestone: 'Progress 4', percent: 15, condition: '' },
      { milestone: 'Final', percent: 5, condition: '' },
    ],
  };
  const fixed = await call('PATCH', `/api/documents/${docId}`, { payload: { ...p, payment: good } });
  eq(fixed.status, 200, 'Repairing the schedule saves');
  ok(!(fixed.json?.validation?.issues || []).some((i) => i.code === 'schedule_unbalanced'),
    'schedule_unbalanced clears once it sums to 100');

  // 5. Guarded status: no silent writes to a signed contract ──
  section('5. signed documents cannot be edited without confirmation');
  const before = await call('GET', `/api/documents/${SIGNED_DOC}`);
  const beforeName = (before.json?.document || before.json)?.payload?.homeowner?.name;
  const beforeUpdated = (before.json?.document || before.json)?.updated_at;
  eq(before.status, 200, 'Signed contract is readable');

  // Deliberately minimal blast radius. The guard is expected to refuse this outright, but
  // if it ever regressed, a test must not be the thing that corrupts an executed contract.
  // So we preserve the whole payload and touch exactly one recoverable field, and we hold
  // its prior value in memory so the run can put it back.
  const beforePayload = (before.json?.document || before.json)?.payload || {};
  const beforePhone = beforePayload.homeowner?.phone;
  const sneaky = await call('PATCH', `/api/documents/${SIGNED_DOC}`, {
    payload: {
      ...beforePayload,
      homeowner: { ...(beforePayload.homeowner || {}), phone: 'E2E-SHOULD-NOT-PERSIST' },
    },
  });
  eq(sneaky.status, 409, 'Unconfirmed write to a signed contract is refused');
  eq(sneaky.json?.error, 'confirmation_required', '...with error confirmation_required');
  ok(/signed/.test(sneaky.json?.detail || ''), '...and the message names the status', sneaky.json?.detail);

  const after = await call('GET', `/api/documents/${SIGNED_DOC}`);
  const afterDoc = after.json?.document || after.json;
  eq(afterDoc?.payload?.homeowner?.name, beforeName, 'The signed contract was NOT mutated');
  eq(afterDoc?.payload?.homeowner?.phone, beforePhone, 'The probed field is untouched');
  eq(afterDoc?.updated_at, beforeUpdated, 'updated_at is unchanged, so nothing was written at all');
  if (afterDoc?.payload?.homeowner?.phone === 'E2E-SHOULD-NOT-PERSIST') {
    console.log('  !! guard regressed and the write landed — restoring the prior value');
    await call('PATCH', `/api/documents/${SIGNED_DOC}`, {
      confirm: true,
      payload: { ...beforePayload, homeowner: { ...(beforePayload.homeowner || {}), phone: beforePhone } },
    });
  }

  // 6. Scoped agent prompt lands on the right block ───────────
  section('6. a prompt scoped to Legal edits a legal block');
  // warranties.text ships locked (canonical NJ language). Unlock it first — otherwise the
  // agent correctly refuses and this measures the lock rather than the scoped edit.
  await call('PATCH', `/api/documents/${docId}`, { locks: { 'warranties.text': false } });
  const schedBefore = ((await call('GET', `/api/documents/${docId}`)).json?.document || {})
    .payload?.payment?.schedule;
  const chat = await call('POST', '/api/agent/chat', {
    doc_id: docId,
    provider: 'cohere',
    message: 'In the warranties section only: set the workmanship warranty text to '
      + '"Contractor warrants all workmanship for twenty-four (24) months from substantial completion."',
  });
  eq(chat.status, 200, 'Agent chat returns 200');
  if (chat.status === 200) {
    const doc2 = await call('GET', `/api/documents/${docId}`);
    const p2 = (doc2.json?.document || doc2.json)?.payload || {};
    ok(/twenty-four|24/i.test(p2.warranties?.text || ''), 'Warranty text was updated',
      (p2.warranties?.text || '').slice(0, 120));
    ok(p2.homeowner?.name === p.homeowner?.name, 'Unrelated blocks were left alone', p2.homeowner?.name);
    // zod re-emits object keys in schema order, so comparing JSON.stringify across a
    // server round-trip reports a difference where none exists. Normalise key order.
    const normRow = (r) => JSON.stringify(Object.fromEntries(
      Object.entries(r || {}).sort(([a], [b]) => a.localeCompare(b))));
    const normSched = (x) => JSON.stringify((x || []).map(normRow));
    ok(normSched(p2.payment?.schedule) === normSched(schedBefore),
      'The payment schedule was not collateral damage',
      `${normSched(schedBefore)} -> ${normSched(p2.payment?.schedule)}`);
  } else {
    console.log('  agent chat unavailable:', JSON.stringify(chat.json).slice(0, 300));
  }

  // 7. Email path (expected blocker: RESEND_API_KEY) ──────────
  section('7. email path');
  const mail = await call('POST', `/api/documents/${docId}/email`, { to: 'sunvicnj@gmail.com' });
  console.log(`  HTTP ${mail.status} ${JSON.stringify(mail.json).slice(0, 200)}`);
  ok(mail.status === 200 || mail.json?.error === 'resend_key_missing',
    'Email either sends or fails only for the known missing key', `HTTP ${mail.status}`);

  // 8. Trash lifecycle ───────────────────────────────────────
  section('8. trash -> restore -> delete forever');
  // Created from a direct payload rather than a prompt. POST /api/documents accepts
  // { template, payload } and only calls the LLM when `prompt` is present and `payload`
  // is absent, so this exercises the same insert path without burning a trial LLM call
  // on a document whose only purpose is to be deleted.
  const throwaway = await call('POST', '/api/documents', {
    template: 'contract',
    title: 'E2E throwaway — safe to delete',
    payload: {
      homeowner: { name: 'E2E Throwaway', address: '1 Test Lane, Highland Park NJ', phone: '', email: '' },
      payment: {
        labor_cost_cents: 70000,
        materials_cost_cents: 30000,
        total_cents: 100000,
        schedule: [{ milestone: 'Final', percent: 100, condition: 'On completion' }],
        method: 'check',
        notes: '',
      },
      timeline: { start_date: '2026-06-01' },
    },
  });
  const tId = (throwaway.json?.document || throwaway.json)?.id;
  if (tId) {
    created.push(tId);
    const del = await call('DELETE', `/api/documents/${tId}`);
    ok(del.status === 200 || del.status === 204, 'Draft moves to trash', `HTTP ${del.status}`);
    const trashed = await call('GET', '/api/documents?trashed=1');
    const tl = trashed.json?.documents || trashed.json || [];
    ok(Array.isArray(tl) && tl.some((d) => d.id === tId), 'It appears in the trash list');
    const restored = await call('POST', `/api/documents/${tId}`, { action: 'restore' });
    ok(restored.status === 200, 'Restore succeeds', `HTTP ${restored.status}`);
    const live = await call('GET', '/api/documents');
    const ll = live.json?.documents || live.json || [];
    ok(Array.isArray(ll) && ll.some((d) => d.id === tId), 'It is back in the live list');
  } else {
    console.log('  could not create a throwaway document:', JSON.stringify(throwaway.json).slice(0, 300));
  }

  report();
}

async function report() {
  if (!KEEP) {
    console.log('\n── cleanup ' + '─'.repeat(50));
    for (const id of created) {
      await call('DELETE', `/api/documents/${id}`);
      const r = await call('DELETE', `/api/documents/${id}?permanent=1`);
      console.log(`  removed ${id} (HTTP ${r.status})`);
    }
  }
  console.log(`\ne2e-live-api: PASS ${pass} FAIL ${failures.length}`);
  if (failures.length) { failures.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
}

main().catch(async (e) => { console.error('crashed:', e); await report(); process.exit(1); });
