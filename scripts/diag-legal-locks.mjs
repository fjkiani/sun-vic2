#!/usr/bin/env node
/**
 * Decisive test for the locks hypothesis.
 *
 * DEFAULT_CONTRACT_LOCKS locks 16 of the 20 paths the rebuilt Legal editor writes.
 * netlify/functions/_shared/locks.js#mergeWithLocks SKIPS locked paths and reports them
 * in `skipped_locks`, and document.js still answers HTTP 200. The rebuilt LegalEditor
 * has no unlock affordance at all.
 *
 * If that chain holds, every edit a user makes to those 16 fields is silently discarded
 * with a success response — the same "save returns 200, nothing persists" defect the
 * legal rebuild was supposed to eliminate.
 *
 * This measures it end to end against production. No LLM.
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
const line = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 62 - t.length))}`);

// The 20 paths the rebuilt Legal editor writes (LEGAL_BLOCK_META), as dot-paths.
const LEGAL_PATHS = [
  ['permits', 'intro'], ['permits', 'contractor_responsible'], ['permits', 'homeowner_responsible'],
  ['change_orders', 'text'], ['material_selection', 'text'], ['invoice_terms', 'text'],
  ['warranties', 'text'], ['warranties', 'start_text'], ['warranties', 'materials_text'],
  ['insurance', 'text'],
  ['unforeseen', 'text'], ['unforeseen', 'option_1'], ['unforeseen', 'option_2'],
  ['right_to_cancel', 'text'],
  ['dispute_resolution', 'intro'], ['dispute_resolution', 'footer'],
  ['signature', 'intro'],
];

const created = [];

async function main() {
  const mk = await call('POST', '/api/documents', {
    template: 'contract',
    title: 'LOCKDIAG — safe to delete',
    payload: {
      homeowner: { name: 'Lock Diag', address: '4 Lock Way, Edison NJ', phone: '', email: '' },
      payment: {
        labor_cost_cents: 700000, materials_cost_cents: 300000, total_cents: 1000000,
        schedule: [{ milestone: 'Final', percent: 100, condition: 'On completion' }],
        method: 'check', notes: '',
      },
      timeline: { start_date: '2026-03-03' },
    },
  });
  const doc = mk.json?.document || mk.json;
  const id = doc?.id;
  if (!id) { console.log('create failed:', JSON.stringify(mk.json).slice(0, 500)); return; }
  created.push(id);
  console.log(`created ${doc.doc_number} -> ${id}`);

  line('locks stored on a brand-new contract');
  const locks = doc.locks || {};
  const lockedKeys = Object.keys(locks).filter((k) => locks[k] === true);
  console.log(`${lockedKeys.length} locked paths`);

  line('per-path: does an edit through the Legal editor actually persist?');
  const results = [];
  for (const [block, field] of LEGAL_PATHS) {
    const path = `${block}.${field}`;
    const marker = `EDITED-${field.toUpperCase()}-MARKER`;
    // Exactly what the Legal editor sends: a partial payload patch for one block.
    const res = await call('PATCH', `/api/documents/${id}`, { payload: { [block]: { [field]: marker } } });
    const got = (await call('GET', `/api/documents/${id}`)).json;
    const stored = ((got?.document || got)?.payload || {})[block]?.[field];
    const persisted = stored === marker;
    results.push({
      path,
      declaredLocked: locks[path] === true,
      http: res.status,
      skipped: (res.json?.skipped_locks || []).includes(path),
      persisted,
    });
  }

  const w = Math.max(...results.map((r) => r.path.length));
  console.log(`${'path'.padEnd(w)}  locked  HTTP  skipped  persisted`);
  for (const r of results) {
    console.log(`${r.path.padEnd(w)}  ${String(r.declaredLocked).padEnd(6)}  ${r.http}   ${String(r.skipped).padEnd(7)}  ${r.persisted}`);
  }

  const silent = results.filter((r) => r.http === 200 && !r.persisted);
  line('verdict');
  console.log(`paths edited                              : ${results.length}`);
  console.log(`persisted                                 : ${results.filter((r) => r.persisted).length}`);
  console.log(`answered 200 but did NOT persist (silent) : ${silent.length}`);
  if (silent.length) console.log(`  ${silent.map((r) => r.path).join('\n  ')}`);
  console.log(`every silent one was reported in skipped_locks: ${silent.every((r) => r.skipped)}`);

  line('can the client even see it? does api.js surface skipped_locks?');
  const probe = await call('PATCH', `/api/documents/${id}`, { payload: { warranties: { text: 'PROBE' } } });
  console.log(`response keys: [${Object.keys(probe.json || {}).join(', ')}]`);
  console.log(`skipped_locks: ${JSON.stringify(probe.json?.skipped_locks)}`);

  line('does explicitly unlocking then writing work? (is there a supported path at all)');
  const unlock = await call('PATCH', `/api/documents/${id}`, { locks: { 'warranties.text': false } });
  console.log(`unlock PATCH -> HTTP ${unlock.status}`);
  const w2 = await call('PATCH', `/api/documents/${id}`, { payload: { warranties: { text: 'UNLOCKED-THEN-WRITTEN' } } });
  const after = (await call('GET', `/api/documents/${id}`)).json;
  const val = ((after?.document || after)?.payload || {}).warranties?.text;
  console.log(`write after unlock -> HTTP ${w2.status}, skipped=${JSON.stringify(w2.json?.skipped_locks)}`);
  console.log(`stored value: ${JSON.stringify(String(val).slice(0, 60))}`);
  console.log(`unlock+write works: ${val === 'UNLOCKED-THEN-WRITTEN'}`);

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
