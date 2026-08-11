// probe-send-wall — where exactly does "I cant even send the contract" stop?
//
// There are three walls between a contractor and a delivered email, and until you
// hit each one in order you cannot say which is the real blocker:
//
//   1. the client never asked         (fixed: the Send panel now posts)
//   2. the server refuses the document (preflight, HTTP 409 not_ready)
//   3. the mail provider is not wired  (HTTP 500 resend_key_missing)
//
// This walks a real document through all three against live production, using a
// scratch copy of a document that already passes readiness so wall 2 is genuinely
// cleared rather than avoided. The recipient is nobody@example.com — example.com is
// IANA-reserved and undeliverable by construction, so no real inbox is touched.
//
// Read-only against existing data: the scratch document is permanently deleted.
//
// Usage: node scripts/probe-send-wall.mjs [--base https://sun-vic2.vercel.app]

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const BASE = arg('--base', process.env.E2E_BASE || 'https://sun-vic2.vercel.app');
const TOKEN = process.env.E2E_TOKEN || 'mock-local-token';

async function api(path, init = {}) {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) },
  });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: r.status, data, text };
}

let scratchId = null;

async function main() {
  // ── the population, and how much of it is stuck at which wall ──────────────
  const list = await api('/api/documents?readiness=1');
  const docs = list.data?.documents || [];
  const rated = docs.filter((d) => d.readiness);
  const ready = rated.filter((d) => d.readiness.ok);
  const blocked = rated.filter((d) => !d.readiness.ok);
  const noEmail = docs.filter((d) => !d.client_email);
  console.log(`documents:        ${docs.length}`);
  console.log(`  wall 2 (refused by preflight): ${blocked.length}`);
  console.log(`  clears preflight:              ${ready.length}  [${ready.map((d) => d.doc_number).join(', ')}]`);
  console.log(`  no recipient on file:          ${noEmail.length}  (so Send needs one typed in either way)`);

  if (!ready.length) { console.log('\nno document clears preflight — cannot test wall 3'); process.exit(1); }

  // ── wall 2, hit deliberately, on a document known to be blocked ────────────
  const victim = blocked[0];
  const r409 = await api(`/api/documents/${victim.id}/email`, {
    method: 'POST', body: JSON.stringify({ to: 'nobody@example.com' }),
  });
  console.log(`\nwall 2 — ${victim.doc_number} (blocked): HTTP ${r409.status} ${r409.data?.error || ''}`);
  console.log(`         issues returned to the client: ${(r409.data?.issues || []).map((i) => i.field).join(', ') || '(none)'}`);

  // ── a scratch copy of a document that already passes, so wall 2 is cleared ─
  const src = await api(`/api/documents/${ready[0].doc_number}`);
  const srcDoc = src.data?.document || src.data;
  const created = await api('/api/documents', {
    method: 'POST',
    body: JSON.stringify({
      template: srcDoc.template,
      title: 'SEND WALL PROBE — delete me',
      client_name: srcDoc.client_name,
      payload: srcDoc.payload,
    }),
  });
  const scratch = created.data?.document || created.data;
  scratchId = scratch?.id;
  console.log(`\nscratch copy of ${ready[0].doc_number}: ${scratch?.doc_number} (${scratchId})`);

  const check = await api('/api/documents?readiness=1');
  const mine = (check.data?.documents || []).find((d) => d.id === scratchId);
  console.log(`scratch readiness.ok = ${mine?.readiness?.ok} (blockers: ${(mine?.readiness?.blockers || []).length})`);

  // ── wall 3 ─────────────────────────────────────────────────────────────────
  const r3 = await api(`/api/documents/${scratchId}/email`, {
    method: 'POST', body: JSON.stringify({ to: 'nobody@example.com' }),
  });
  console.log(`\nwall 3 — a document that passes every check: HTTP ${r3.status}`);
  console.log(`         error: ${r3.data?.error || '(none)'}`);
  console.log(`         detail: ${String(r3.data?.detail || r3.text).slice(0, 300)}`);

  if (r3.status === 200) {
    console.log('\n>>> AN EMAIL WAS ACTUALLY SENT. The Resend key is live and delivery works end to end.');
  } else if (r3.data?.error === 'resend_key_missing') {
    console.log('\n>>> Wall 3 stands: the document is send-ready and the only thing left is the provider key.');
  } else {
    console.log('\n>>> Wall 3 failed for a different reason than the missing key — read the detail above.');
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => {
    if (scratchId) {
      const d = await api(`/api/documents/${scratchId}?permanent=1`, { method: 'DELETE' });
      const g = await api(`/api/documents/${scratchId}`);
      console.log(`\nscratch deleted: HTTP ${d.status}; refetch: HTTP ${g.status}${g.status === 404 ? ' (gone)' : ' (STILL THERE)'}`);
    }
  });
