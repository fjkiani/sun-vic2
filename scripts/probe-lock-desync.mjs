#!/usr/bin/env node
// probe-lock-desync.mjs — prove, against the LIVE server, what happens when the Form tab
// writes a path the PDF tab refuses as "locked".
//
// The hypothesis under test (from reading the code, now to be measured):
//   ContractFormEditor's ContractorBlock renders contractor.* as plain editable inputs with
//   no lock consultation and no padlock, while PdfDocView refuses the same paths and
//   netlify/functions/_shared/locks.js#mergeWithLocks silently drops them server-side and
//   answers 200. If true, the user types, sees the change locally, gets a success, and the
//   value reverts on the next load. That is silent data loss, not a copy problem.
//
// Positive control: the same PATCH shape against an UNLOCKED path must persist. Without it,
// "the value did not change" is indistinguishable from "the probe sent a malformed body".
//
// Creates its own throwaway document and permanently deletes it. Touches nothing else.

const BASE = process.env.E2E_BASE || 'https://sun-vic2.vercel.app';
const TOKEN = process.env.E2E_TOKEN || 'mock-local-token';
const H = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` };

async function call(method, path, body, extra = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...H, ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = { _raw: text.slice(0, 300) }; }
  return { status: res.status, data };
}

const get = (o, p) => String(p).split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);

let created = null;
try {
  // ── 1. throwaway contract ────────────────────────────────────────────────
  const mk = await call('POST', '/api/documents', { template: 'contract' });
  if (mk.status !== 200 && mk.status !== 201) {
    console.error(`create failed ${mk.status}`, JSON.stringify(mk.data).slice(0, 400));
    process.exit(1);
  }
  const doc = mk.data.document || mk.data;
  created = doc.id;
  console.log(`created ${doc.doc_number} (${doc.id})`);

  const lockedPath = 'contractor.address';
  const freePath = 'homeowner.name';
  console.log(`locks[${lockedPath}] = ${JSON.stringify(doc.locks?.[lockedPath])}`);
  console.log(`locks[${freePath}]   = ${JSON.stringify(doc.locks?.[freePath])}`);
  const before = { locked: get(doc.payload, lockedPath), free: get(doc.payload, freePath) };
  console.log(`before: ${lockedPath} = ${JSON.stringify(before.locked)}`);
  console.log(`before: ${freePath}   = ${JSON.stringify(before.free)}`);

  // ── 2. write both in ONE patch, exactly as the form's saveField would ────
  const stamp = Date.now();
  const patch = {
    payload: {
      contractor: { address: `PROBE-LOCKED-${stamp}` },
      homeowner: { name: `PROBE-FREE-${stamp}` },
    },
  };
  const up = await call('PATCH', `/api/documents/${created}`, patch);
  console.log(`\nPATCH status = ${up.status}`);
  console.log(`response keys = ${Object.keys(up.data).join(', ')}`);
  if ('skipped_locks' in up.data) console.log(`skipped_locks = ${JSON.stringify(up.data.skipped_locks)}`);
  else console.log(`skipped_locks = <ABSENT from the response body>`);

  // ── 3. read it back from the server, not from the response ───────────────
  const rd = await call('GET', `/api/documents/${created}`);
  const after = {
    locked: get(rd.data.document.payload, lockedPath),
    free: get(rd.data.document.payload, freePath),
  };
  console.log(`\nafter:  ${lockedPath} = ${JSON.stringify(after.locked)}`);
  console.log(`after:  ${freePath}   = ${JSON.stringify(after.free)}`);

  const lockedPersisted = after.locked === `PROBE-LOCKED-${stamp}`;
  const freePersisted = after.free === `PROBE-FREE-${stamp}`;

  console.log(`\n=== RESULT ===`);
  console.log(`positive control (unlocked ${freePath}) persisted : ${freePersisted}`);
  console.log(`locked ${lockedPath} persisted                 : ${lockedPersisted}`);
  if (!freePersisted) {
    console.log(`INCONCLUSIVE — the positive control did not persist either, so the patch shape is wrong.`);
  } else if (!lockedPersisted && up.status < 400) {
    console.log(`CONFIRMED — the server answered ${up.status} OK and silently discarded the write.`);
    console.log(`            The Form tab offers this field as an editable input with no padlock.`);
  } else if (lockedPersisted) {
    console.log(`REFUTED — the locked write DID persist. The lock is not enforced server-side.`);
  }
} finally {
  if (created) {
    const del = await call('DELETE', `/api/documents/${created}?permanent=1`);
    console.log(`\ncleanup: DELETE ${created} -> ${del.status}`);
  }
}
