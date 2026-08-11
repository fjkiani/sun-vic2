// probe-trashed-money.mjs — measure how much money the project dashboard is inventing
// out of trashed documents.
//
// /api/documents filters `deleted_at is null`; packages/db/projects.js getProjectSummary
// did not. So the two endpoints disagree, and the disagreement is denominated in dollars.
// This prints the exact per-project delta so the fix can be proven, not asserted.

const BASE = process.env.E2E_BASE || 'https://sun-vic2.vercel.app';
const TOKEN = process.env.E2E_TOKEN || 'mock-local-token';

async function api(path) {
  const res = await fetch(`${BASE}/api${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const t = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${t.slice(0, 160)}`);
  return JSON.parse(t);
}
const usd = (c) => `$${((Number(c) || 0) / 100).toLocaleString('en-US')}`;
const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);

const live = (await api('/documents')).documents || [];
const trashed = (await api('/documents?trashed=1')).documents || [];
const liveIds = new Set(live.map((d) => d.id));
const liveNums = new Set(live.map((d) => d.doc_number));

console.log(`live documents: ${live.length}`);
console.log(`trashed documents: ${trashed.length}`);
console.log('\ntrashed doc                 project    total');
console.log('-'.repeat(56));
for (const d of trashed) {
  console.log(`${pad(d.doc_number, 26)} ${pad(d.project_id, 10)} ${usd(d.total_cents)}`);
}

const { projects } = await api('/projects');
console.log('\nproject   name                            summary_docs  ghost_docs  contract_total  ghost_money');
console.log('-'.repeat(104));

let totalGhostMoney = 0;
let projectsAffected = 0;
for (const p of projects) {
  let s;
  try { s = await api(`/projects/${p.id}/summary`); } catch { continue; }
  const docs = s.documents || [];
  const ghosts = docs.filter((d) => !liveIds.has(d.id) && !liveNums.has(d.doc_number));
  const ct = s.money?.contract_total_cents || 0;
  // The contract total is sourced from the NEWEST contract. If that contract is a ghost,
  // the whole displayed total is fictional.
  const contracts = docs.filter((d) => d.template === 'contract');
  const newest = contracts.length ? contracts[contracts.length - 1] : null;
  const totalIsGhost = !!newest && !liveIds.has(newest.id) && !liveNums.has(newest.doc_number);
  const ghostMoney = totalIsGhost ? ct : 0;
  if (ghosts.length > 0) {
    projectsAffected += 1;
    totalGhostMoney += ghostMoney;
    console.log(
      `${pad(p.id, 9)} ${pad(p.name, 31)} ${pad(docs.length, 13)} ${pad(ghosts.length, 11)} ${pad(usd(ct), 15)} ${totalIsGhost ? usd(ghostMoney) + '  <-- ENTIRELY FICTIONAL' : '$0'}`
    );
  }
}
console.log(`\nprojects showing money from trashed documents: ${projectsAffected}`);
console.log(`total fictional contract value on the dashboard: ${usd(totalGhostMoney)}`);

// Live-document counts per project, which is what the purge gate should actually use.
const byProject = new Map();
for (const d of live) byProject.set(d.project_id, (byProject.get(d.project_id) || 0) + 1);
console.log('\nlive-document count per project (ground truth):');
for (const p of projects) console.log(`  ${pad(p.id, 9)} ${pad(p.name, 31)} ${byProject.get(p.id) || 0}`);
