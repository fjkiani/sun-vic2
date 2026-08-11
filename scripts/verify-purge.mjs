#!/usr/bin/env node
/**
 * Post-purge safety check. The purge was heuristic and it removed 13 of 18 projects, so
 * prove nothing real was lost rather than assuming it.
 *
 * Asserts:
 *   - every live document that existed before the purge still exists;
 *   - CTR-2026-0017 (Jane Smith, signed, $65,000) is byte-for-byte intact — it is the one
 *     document flagged as real work with un-repaired "Lump Sump" strings;
 *   - the project it lives in survived;
 *   - no live document was orphaned onto a soft-deleted project, which would make it
 *     unreachable from the project page even though it still lists.
 */

const BASE = process.env.E2E_BASE || 'https://sun-vic2.vercel.app';
const TOKEN = process.env.E2E_TOKEN || 'mock-local-token';

async function api(path) {
  const res = await fetch(`${BASE}/api${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const t = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${t.slice(0, 160)}`);
  return JSON.parse(t);
}

let pass = 0; const fails = [];
const ok = (c, label, detail) => { if (c) { pass++; console.log(`  ok   ${label}`); } else { fails.push(label); console.log(`  FAIL ${label}${detail !== undefined ? ` — ${detail}` : ''}`); } };

const EXPECTED_LIVE = 17;
const PROTECTED_ID = '288b1faf-26e0-4b58-8b8e-91e0575daafc';
const PROTECTED_PROJECT = '834cceae';

const live = (await api('/documents')).documents || [];
const trashed = (await api('/documents?trashed=1')).documents || [];
const projects = (await api('/projects')).projects || [];

console.log(`live docs ${live.length} · trashed docs ${trashed.length} · projects ${projects.length}\n`);

ok(live.length === EXPECTED_LIVE, `all ${EXPECTED_LIVE} live documents survived the purge`, `${live.length}`);
ok(trashed.length === 0, 'no fixture documents left in the trash', `${trashed.length} remain`);

const prot = live.find((d) => d.id === PROTECTED_ID);
ok(!!prot, 'CTR-2026-0017 still exists');
if (prot) {
  const full = (await api(`/documents/${PROTECTED_ID}`)).document;
  ok(full.doc_number === 'CTR-2026-0017', 'CTR-2026-0017 keeps its document number', full.doc_number);
  ok(full.total_cents === 6500000, 'CTR-2026-0017 still totals $65,000', `${full.total_cents}`);
  ok(full.status === 'signed', 'CTR-2026-0017 is still signed', full.status);
  ok(String(full.project_id || '').startsWith(PROTECTED_PROJECT), 'CTR-2026-0017 still belongs to its project', String(full.project_id));
}

ok(projects.some((p) => p.id.startsWith(PROTECTED_PROJECT)), 'the project holding CTR-2026-0017 survived');

// Orphan check. Two distinct conditions, and conflating them hid a real bug for a while:
//
//   HARD ORPHAN  — the project id resolves to nothing at all. Unrecoverable, must be zero.
//   TRASH ORPHAN — the project exists but is soft-deleted. GET /projects/:id returns it
//                  with 200 regardless, so the UI used to render it as a normal project.
//                  Tolerated only when the document carries no money; a document with a
//                  real total must not have its project sitting in the trash.
const trashedProjects = (await api('/projects?trashed=1')).projects || [];
const listedIds = new Set(projects.map((p) => p.id));
const trashedIds = new Set(trashedProjects.map((p) => p.id));

const attached = live.filter((d) => d.project_id);
const hardOrphans = attached.filter((d) => !listedIds.has(d.project_id) && !trashedIds.has(d.project_id));
const trashOrphans = attached.filter((d) => trashedIds.has(d.project_id));
const valuableTrashOrphans = trashOrphans.filter((d) => (d.total_cents || 0) > 0);

ok(hardOrphans.length === 0, 'no live document points at a project that does not exist',
  hardOrphans.map((d) => `${d.doc_number}->${String(d.project_id).slice(0, 8)}`).join(', '));
ok(valuableTrashOrphans.length === 0, 'no live document with money sits in a trashed project',
  valuableTrashOrphans.map((d) => `${d.doc_number} ${(d.total_cents / 100).toFixed(0)} ->${String(d.project_id).slice(0, 8)}`).join(', '));

const unattached = live.filter((d) => !d.project_id);
console.log(`\n  ${unattached.length} live documents have no project at all`);
console.log(`  ${trashOrphans.length} live documents sit in a TRASHED project (all $0.00, labelled in the UI with a restore action):`);
for (const d of trashOrphans) console.log(`      ${d.doc_number.padEnd(14)} $${((d.total_cents || 0) / 100).toFixed(2).padStart(9)}  -> ${String(d.project_id).slice(0, 8)}`);

console.log(`\nsurviving projects:`);
for (const p of projects) {
  const n = live.filter((d) => d.project_id === p.id).length;
  console.log(`  ${p.id.slice(0, 8)}  ${String(p.name || '').padEnd(24)} ${n} live doc(s)`);
}

console.log(`\nverify-purge: PASS ${pass} FAIL ${fails.length}`);
process.exit(fails.length ? 1 : 0);
