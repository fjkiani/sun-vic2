// verify-thread-interview.mjs — end-to-end proof that a contract can actually be
// finished by talking to the copilot.
//
// Why this exists: production could not do it. MAX_CLARIFY_TURNS was 3 while a
// contract has 5 required slots, so the stage machine flipped to `refuse` at
// question 3 of 5. In `refuse` the only declared tool was refuse_and_summarize,
// so when the model tried to ask the next question Cohere rejected the whole
// request with 422 HALLUCINATED_ALL_TOOL_CALLS — a hard 500 that also discarded
// the answer the user had just typed.
//
// Two arms, both against the live deployment with the real model:
//   A — one slot per turn (the cooperative user). Must reach 5/5 and produce a
//       real document row. This is the arm that was arithmetically impossible.
//   B — one compound message that fills several slots at once. Must not 500.
//
// Usage: node scripts/verify-thread-interview.mjs [--base https://...] [--keep]

const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const BASE = argOf('--base', process.env.E2E_BASE || 'https://sun-vic2.vercel.app');
const TOKEN = process.env.E2E_TOKEN || 'mock-local-token';
const KEEP = argv.includes('--keep');
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

const REQUIRED = ['homeowner.name', 'homeowner.address', 'scope_categories', 'payment.total_cents', 'timeline.start_date'];

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ok  ', msg); } else { fail++; console.log('  FAIL', msg); } };
const note = (msg) => console.log('  ~   ', msg);

async function jfetch(path, init) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const createThread = async () => {
  const { status, body } = await jfetch('/api/threads', { method: 'POST', body: JSON.stringify({}) });
  const t = body.thread || body;
  if (!t?.id) throw new Error(`thread create failed ${status}`);
  return t.id;
};
const getThread = async (id) => (await jfetch(`/api/threads/${id}`)).body?.thread || {};
const turn = async (id, message) =>
  jfetch(`/api/threads/${id}/turn`, { method: 'POST', body: JSON.stringify({ message, provider: 'cohere' }) });

function filledCount(th) {
  const g = th?.gathered_slots || {};
  return REQUIRED.filter((k) => {
    const v = g[k];
    return v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
  }).length;
}

// Anything that looks like a provider error object must never reach the transcript.
const LEAKY = /error_type|HALLUCINATED|Cohere \d{3}|\{"error/i;

async function runArm(label, script, { expectDocument }) {
  console.log(`\n${label}`);
  const id = await createThread();
  const created = [];
  let hardFailures = 0, degraded = 0, leaks = 0, maxFilled = 0;
  let refusedEarly = false;

  for (let i = 0; i < script.length; i++) {
    const before = await getThread(id);
    const nBefore = filledCount(before);
    // Stop early once every required slot is in — the next turn should draft.
    const r = await turn(id, script[i]);
    const after = await getThread(id);
    const nAfter = filledCount(after);
    maxFilled = Math.max(maxFilled, nAfter);

    const reply = String(r.body.reply || '');
    if (r.status !== 200) {
      hardFailures++;
      note(`t${i + 1} HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 180)}`);
      const lost = nBefore === nAfter;
      ok(!lost, `t${i + 1}: the answer survived the failure (slots ${nBefore}->${nAfter})`);
    } else {
      if (r.body.degraded) { degraded++; note(`t${i + 1} degraded: ${String(r.body.degraded.detail).slice(0, 120)}`); }
      if (LEAKY.test(reply)) { leaks++; note(`t${i + 1} LEAKED provider detail into the transcript: ${reply.slice(0, 120)}`); }
      note(`t${i + 1} ${nBefore}->${nAfter}/5 · ${JSON.stringify(reply.slice(0, 90))}`);
    }
    if (/give up|can'?t (continue|proceed)|still missing/i.test(reply) && nAfter < REQUIRED.length) refusedEarly = true;
    for (const d of r.body.new_documents || []) { created.push(d); note(`t${i + 1} DOC ${d.doc_number} ${d.id}`); }
    if (created.length) break;
  }

  // If all slots are in but no document appeared yet, give the agent the one
  // turn it needs to draft — that is the ready_to_generate stage doing its job.
  if (expectDocument && !created.length && maxFilled === REQUIRED.length) {
    const r = await turn(id, 'Go ahead and draft it.');
    if (r.status !== 200) { hardFailures++; note(`draft turn HTTP ${r.status}`); }
    for (const d of r.body.new_documents || []) { created.push(d); note(`draft DOC ${d.doc_number} ${d.id}`); }
  }

  ok(hardFailures === 0, `${label}: no turn hard-failed (${hardFailures} did)`);
  ok(leaks === 0, `${label}: no raw provider error text in the transcript (${leaks} leaks)`);
  if (expectDocument) {
    ok(!refusedEarly, `${label}: the agent never gave up while the user was answering`);
    ok(maxFilled === REQUIRED.length, `${label}: all ${REQUIRED.length} required slots were gathered (reached ${maxFilled})`);
    ok(created.length === 1, `${label}: exactly one real document was produced (${created.length})`);
  }
  return { id, created, degraded };
}

const ARM_A = [
  'Create a new home-improvement contract.',
  'Jane Smith',
  '36 Bushnell Rd, Edison, NJ 08820',
  'Interiors',
  '$65,000',
  'September 1, 2026',
];
const ARM_B = [
  'Create a new home-improvement contract.',
  'Jane Smith, full gut renovation at 36 Bushnell Rd, $65,000, starting Sept 1',
];

const runs = [];
try {
  runs.push(await runArm('A — one slot per turn (the arm that was impossible)', ARM_A, { expectDocument: true }));
  runs.push(await runArm('B — one compound message', ARM_B, { expectDocument: false }));
} finally {
  console.log('\ncleanup');
  for (const r of runs) {
    for (const d of r.created) {
      if (KEEP) { note(`kept ${d.doc_number}`); continue; }
      const del = await fetch(`${BASE}/api/documents/${d.id}?permanent=1`, { method: 'DELETE', headers: H });
      const check = await fetch(`${BASE}/api/documents/${d.id}`, { headers: H });
      ok(del.status < 300 && check.status === 404, `${d.doc_number} permanently removed (delete ${del.status}, refetch ${check.status})`);
    }
  }
}

console.log(`\nPASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
