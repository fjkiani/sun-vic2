// probe-readiness-rollup — run the readiness rollup the documents list will now compute,
// against every real payload, before the change is deployed.
//
// The rollup runs inside GET /api/documents. If preflight throws on any real row, the list
// endpoint 500s and the entire app goes dark — so this is checked against production data
// first rather than after. Read-only.

import { preflight } from '../packages/validation/guardrails.js';

const BASE = process.env.E2E_BASE || 'https://sun-vic2.vercel.app';
const TOKEN = process.env.E2E_TOKEN || 'mock-local-token';

async function api(p) {
  const r = await fetch(`${BASE}${p}`, { headers: { authorization: `Bearer ${TOKEN}` } });
  return { status: r.status, data: await r.json().catch(() => null) };
}

const list = await api('/api/documents');
const rows = list.data?.documents || [];
console.log(`checking the rollup against ${rows.length} real documents\n`);

let threw = 0, blocked = 0, ready = 0;
const tally = {};

for (const row of rows) {
  const full = await api(`/api/documents/${row.id}`);
  const doc = full.data?.document;
  if (!doc) { console.log(`SKIP  ${row.doc_number}: no document returned`); continue; }

  // Exactly what the handler does: list columns + payload, minus payload in the response.
  const { payload, ...rest } = doc;
  let pre;
  try {
    pre = preflight({ ...rest, payload }, 'send');
  } catch (e) {
    threw++;
    console.log(`THREW  ${row.doc_number}: ${e.message}`);
    continue;
  }

  // The shape the client will consume must be serialisable and complete.
  const readiness = {
    ok: !pre.blocked,
    blockers: pre.blocking.map((i) => ({ field: i.field, code: i.code, label: i.label || i.field })),
    summary: pre.summary,
  };
  try { JSON.parse(JSON.stringify(readiness)); } catch (e) {
    threw++; console.log(`UNSERIALISABLE  ${row.doc_number}: ${e.message}`); continue;
  }
  for (const b of readiness.blockers) {
    if (b.field === undefined && b.code === undefined) { threw++; console.log(`BLANK BLOCKER  ${row.doc_number}`); }
  }

  if (readiness.ok) { ready++; } else {
    blocked++;
    for (const b of readiness.blockers) {
      const k = b.field || b.code;
      tally[k] = (tally[k] || 0) + 1;
    }
  }
  console.log(`${row.doc_number.padEnd(14)} ${row.template.padEnd(8)} ${readiness.ok ? 'READY  ' : 'BLOCKED'}  ${readiness.summary || ''}`);
}

console.log(`\nready ${ready}   blocked ${blocked}   errors ${threw}   of ${rows.length}`);
console.log('\nblocking fields, most common first:');
for (const [f, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${f}`);
if (threw) { console.log('\nthe rollup is not safe to deploy'); process.exit(1); }
console.log('\nrollup is safe: no throw, no unserialisable value, no blank blocker');
