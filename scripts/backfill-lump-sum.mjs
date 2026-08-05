#!/usr/bin/env node
// Repairs the misspelled scope quantity in existing documents.
//
// Policy (plan decision 1): the code fix stops the typo going forward, but a contract that
// has been sent, signed or paid is an executed legal artifact. Silently rewriting the text
// of a delivered document destroys the audit trail, so this script mutates draft and void
// documents only and *reports* everything else for a human re-issue decision.
//
//   node scripts/backfill-lump-sum.mjs              # dry run (default) — mutates nothing
//   node scripts/backfill-lump-sum.mjs --apply      # writes draft/void documents
//   node scripts/backfill-lump-sum.mjs --apply --include-void=false
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Uses PostgREST over fetch rather
// than supabase-js because the client library needs a native WebSocket this Node build
// does not provide.

const BAD = ['Lump', 'Sump'].join(' ');
const GOOD = 'Lump Sum';

const MUTABLE_STATUSES = new Set(['draft', 'void']);

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const INCLUDE_VOID = !args.includes('--include-void=false');

const URL_BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(2);
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

async function rest(path, init = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// Walk any JSON value, replacing the bad string wherever it appears. Returns a new value
// and a count, so the report can say exactly how many strings changed rather than just
// "this document was touched".
function repair(value) {
  let changed = 0;
  function go(v) {
    if (typeof v === 'string') {
      if (v.includes(BAD)) { changed += 1; return v.split(BAD).join(GOOD); }
      return v;
    }
    if (Array.isArray(v)) return v.map(go);
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, child] of Object.entries(v)) out[k] = go(child);
      return out;
    }
    return v;
  }
  const next = go(value);
  return { next, changed };
}

function fmtRow(d, occurrences) {
  const when = (d.updated_at || d.created_at || '').slice(0, 10);
  return `    ${d.doc_number.padEnd(16)} ${String(d.status).padEnd(8)} ${when}  ${occurrences} occurrence${occurrences === 1 ? '' : 's'}  ${(d.client_name || '—')}`;
}

async function main() {
  console.log(`\nBackfill: "${BAD}" -> "${GOOD}"`);
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes)'}`);
  console.log(`Mutable statuses: ${[...MUTABLE_STATUSES].filter((s) => s !== 'void' || INCLUDE_VOID).join(', ')}\n`);

  const docs = await rest('documents?select=id,doc_number,status,client_name,created_at,updated_at,payload,deleted_at&order=created_at.asc');
  console.log(`Scanned ${docs.length} documents.`);

  const affected = [];
  for (const d of docs) {
    const { next, changed } = repair(d.payload);
    if (changed > 0) affected.push({ doc: d, next, changed });
  }

  if (affected.length === 0) {
    console.log('\nNothing to do — no document contains the misspelling.\n');
    return;
  }

  const byStatus = {};
  for (const a of affected) {
    const s = a.doc.status || 'unknown';
    byStatus[s] = byStatus[s] || { docs: 0, occurrences: 0 };
    byStatus[s].docs += 1;
    byStatus[s].occurrences += a.changed;
  }

  console.log(`\nAffected: ${affected.length} document(s), ${affected.reduce((a, x) => a + x.changed, 0)} string(s).`);
  console.log('\n  Per status:');
  for (const [status, c] of Object.entries(byStatus).sort()) {
    const mutable = MUTABLE_STATUSES.has(status) && (status !== 'void' || INCLUDE_VOID);
    console.log(`    ${status.padEnd(8)} ${String(c.docs).padStart(3)} doc(s)  ${String(c.occurrences).padStart(4)} string(s)   ${mutable ? 'will be repaired' : 'LEFT UNTOUCHED'}`);
  }

  const mutable = affected.filter((a) => MUTABLE_STATUSES.has(a.doc.status) && (a.doc.status !== 'void' || INCLUDE_VOID));
  const frozen = affected.filter((a) => !mutable.includes(a));

  if (frozen.length > 0) {
    console.log('\n  Executed documents left byte-intact — re-issue is a human decision:');
    for (const a of frozen) console.log(fmtRow(a.doc, a.changed));
  }

  if (mutable.length > 0) {
    console.log(`\n  ${APPLY ? 'Repairing' : 'Would repair'}:`);
    for (const a of mutable) console.log(fmtRow(a.doc, a.changed));
  }

  if (!APPLY) {
    console.log('\nDry run complete. Nothing was written. Re-run with --apply to repair the drafts.\n');
    return;
  }

  let written = 0;
  for (const a of mutable) {
    // Snapshot before mutating so the change is recoverable from document_revisions.
    await rest('document_revisions', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        document_id: a.doc.id,
        payload: a.doc.payload,
        locks: {},
        change_source: 'backfill_lump_sum',
      }),
    });
    await rest(`documents?id=eq.${a.doc.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ payload: a.next, updated_at: new Date().toISOString() }),
    });
    written += 1;
    console.log(`    repaired ${a.doc.doc_number}`);
  }

  // Prove it: re-read and confirm the string is gone from everything we touched.
  const ids = mutable.map((a) => a.doc.id);
  const after = await rest(`documents?select=id,doc_number,payload&id=in.(${ids.join(',')})`);
  const stillBad = after.filter((d) => JSON.stringify(d.payload).includes(BAD));
  console.log(`\nWrote ${written} document(s). Verification: ${stillBad.length === 0 ? 'clean' : `STILL BAD -> ${stillBad.map((d) => d.doc_number).join(', ')}`}`);
  console.log(`${frozen.length} executed document(s) intentionally untouched.\n`);
  if (stillBad.length > 0) process.exit(1);
}

main().catch((e) => { console.error('\nFailed:', e.message); process.exit(1); });
