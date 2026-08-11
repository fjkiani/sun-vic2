// purge-fixtures.mjs — remove the projects that previous agent test runs left behind.
//
// Prior sessions purged test *documents* but never the projects those documents
// auto-created (findOrCreateProjectForDocument runs on every POST /api/documents), so the
// user's project list ended up mostly agent litter: 18 projects, 4 with real work in them.
//
// Deleting by name pattern alone is guessing — "1 St, Newark NJ" looks exactly like a real
// job. So a project is only condemned on evidence, and it must have ZERO live documents in
// every case:
//
//   A. its name or homeowner reads as harness vocabulary (Probe / Diagnostic / Test / …);
//   B. every document it ever held is a trashed, fixture-named document — i.e. the project
//      exists solely because a test run created a document under it and then binned it;
//   C. its name exactly duplicates another project that DOES hold live documents, so it is
//      an empty shadow of a real job.
//
// Live-document counts come from /api/documents, never from the project summary. The
// summary used to count trashed rows, and a purge script must not depend on the endpoint
// whose bug it is cleaning up after.
//
// Dry-run by default: pass --apply to delete.

const BASE = process.env.E2E_BASE || 'https://sun-vic2.vercel.app';
const TOKEN = process.env.E2E_TOKEN || 'mock-local-token';
const APPLY = process.argv.includes('--apply');

const FIXTURE_NAME = /probe|diagnostic|test|proof|lock way|mobile way|workspace way|untitled|^\s*fk\b|^\s*\d+\s+a\s+st/i;
const FIXTURE_DOC = /DIAG6|DOM2|DOMDUMP|MOBILE E2E|WS7 E2E|PDFPROOF|DIAGACC|DIAGCHIP|DIAGUX|PROBE\d*|DIAGLOCK|DIAG412|safe to delete/i;

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${res.status} ${path}: ${String(typeof body === 'string' ? body : JSON.stringify(body)).slice(0, 200)}`);
  return body;
}

const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);

const live = (await api('/documents')).documents || [];
const trashed = (await api('/documents?trashed=1')).documents || [];
const { projects } = await api('/projects');

const liveBy = new Map();
for (const d of live) liveBy.set(d.project_id, [...(liveBy.get(d.project_id) || []), d]);
const trashBy = new Map();
for (const d of trashed) trashBy.set(d.project_id, [...(trashBy.get(d.project_id) || []), d]);

// Names that belong to a project holding real work — used for rule C.
const realNames = new Set(projects.filter((p) => (liveBy.get(p.id) || []).length > 0).map((p) => (p.name || '').trim().toLowerCase()));

console.log(`projects ${projects.length} · live docs ${live.length} · trashed docs ${trashed.length}`);

const rows = projects.map((p) => {
  const liveDocs = liveBy.get(p.id) || [];
  const trashDocs = trashBy.get(p.id) || [];
  const name = (p.name || '').trim();

  const ruleA = FIXTURE_NAME.test(name) || FIXTURE_NAME.test(p.homeowner_name || '');
  const ruleB = trashDocs.length > 0 && trashDocs.every((d) => FIXTURE_DOC.test(`${d.title || ''} ${d.doc_number || ''}`));
  const ruleC = liveDocs.length === 0 && realNames.has(name.toLowerCase());

  const why = [ruleA && 'name', ruleB && 'trashed-fixture-only', ruleC && 'empty-duplicate'].filter(Boolean).join('+');
  return {
    id: p.id, name, liveDocs, trashDocs,
    purge: liveDocs.length === 0 && (ruleA || ruleB || ruleC),
    why: why || '-',
  };
});

console.log('\nproject   name                              live  trash  evidence                action');
console.log('-'.repeat(94));
for (const r of rows) {
  console.log(
    `${pad(r.id, 9)} ${pad(r.name, 33)} ${pad(r.liveDocs.length, 5)} ${pad(r.trashDocs.length, 6)} ${pad(r.why, 23)} ${r.purge ? 'DELETE' : 'keep'}` +
    (r.liveDocs.length ? `  [${r.liveDocs.map((d) => d.doc_number).join(', ')}]` : '')
  );
}

const toPurge = rows.filter((r) => r.purge);
const kept = rows.filter((r) => !r.purge);
console.log(`\nwould delete ${toPurge.length} of ${rows.length}`);
console.log(`keeping ${kept.length}: ${kept.map((r) => r.name).join(' | ')}`);
const noEvidence = kept.filter((r) => r.liveDocs.length === 0);
if (noEvidence.length) {
  console.log(`\nKEPT WITHOUT EVIDENCE (empty, but nothing proves they are fixtures — left alone deliberately):`);
  for (const r of noEvidence) console.log(`  ${r.id}  ${r.name}`);
}

if (!APPLY) { console.log('\nDRY RUN — pass --apply to delete.'); process.exit(0); }

// Projects are SOFT-deleted by default. The evidence rules above are good but they are
// still heuristics applied to someone else's business records, and 13 of 18 is most of the
// list. A soft delete cleans the list and stays reversible with restoreProject if a single
// judgement here is wrong; --permanent opts into the irreversible version.
const PERMANENT = process.argv.includes('--permanent');
const suffix = PERMANENT ? '?permanent=1' : '';
console.log(`\ndeleting projects (${PERMANENT ? 'PERMANENT — irreversible' : 'soft — recoverable via restore'})`);

let ok = 0, fail = 0;
for (const r of toPurge) {
  try { await api(`/projects/${r.id}${suffix}`, { method: 'DELETE' }); ok += 1; console.log(`  deleted ${r.id} ${r.name} (${r.why})`); }
  catch (e) { fail += 1; console.log(`  FAILED  ${r.id} ${r.name}: ${e.message}`); }
}

// The trashed fixture documents themselves. They no longer affect any dashboard now that
// getProjectSummary filters deleted_at, but they are still litter in the user's Trash.
let dok = 0;
for (const d of trashed) {
  if (!FIXTURE_DOC.test(`${d.title || ''} ${d.doc_number || ''}`)) { console.log(`  keeping trashed ${d.doc_number} (not fixture-named)`); continue; }
  try { await api(`/documents/${d.id}?permanent=1`, { method: 'DELETE' }); dok += 1; console.log(`  hard-deleted trashed ${d.doc_number}`); }
  catch (e) { console.log(`  FAILED trashed ${d.doc_number}: ${e.message}`); }
}

console.log(`\npurged ${ok} projects (${fail} failed), ${dok} trashed documents`);
const after = await api('/projects');
console.log(`projects remaining: ${after.projects.length}`);
for (const p of after.projects) console.log(`  ${pad(p.id, 9)} ${p.name}`);
