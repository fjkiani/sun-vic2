// probe-name-corruption — how much of the live data already carries a swallowed message?
//
// absorbPendingSlot() wrote the user's entire message into a free-text slot whenever the
// conservative extractor missed. Any contract or invoice drafted through the copilot since that
// path existed could be carrying a sentence where a party name belongs. This measures it rather
// than assuming it was a one-off from the test run.
//
// Read-only. Prints a repair list; changes nothing.

const BASE = process.env.E2E_BASE || 'https://sun-vic2.vercel.app';
const TOKEN = process.env.E2E_TOKEN || 'mock-local-token';

async function api(p) {
  const r = await fetch(`${BASE}${p}`, { headers: { authorization: `Bearer ${TOKEN}` } });
  const t = await r.text();
  try { return { status: r.status, data: JSON.parse(t) }; } catch { return { status: r.status, data: null, text: t }; }
}

// A party name that is actually a sentence. Deliberately several independent signals, so one
// weak heuristic cannot drive the count on its own.
function nameSmells(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const reasons = [];
  if (s.length > 60) reasons.push(`length ${s.length}`);
  if (s.split(/\s+/).length > 6) reasons.push(`${s.split(/\s+/).length} words`);
  if (/\$\s*[\d,]/.test(s)) reasons.push('contains money');
  if (/\b\d{1,6}\s+[A-Z][A-Za-z]*\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Dr|Drive|Ln|Lane|Ct|Way)\b/i.test(s)) reasons.push('contains an address');
  if (/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i.test(s)) reasons.push('contains a date');
  if (/\b(?:renovation|remodel|gut|kitchen|bathroom|starting|budget)\b/i.test(s)) reasons.push('contains scope/price wording');
  if (/^(?:i\s+)?(?:dont|don't|not\s+sure|no\s+idea|dunno|unknown|tbd|n\/a)\b/i.test(s)) reasons.push('is a non-answer');
  return reasons.length ? reasons : null;
}

const NAME_PATHS = [
  ['homeowner.name', (p) => p?.homeowner?.name],
  ['bill_to.client_name', (p) => p?.bill_to?.client_name],
  ['homeowner.address', (p) => p?.homeowner?.address],
  ['bill_to.property_address', (p) => p?.bill_to?.property_address],
];

// ---- positive controls -------------------------------------------------------------------
// A detector that reports zero is worthless unless it is shown to fire. These are the shapes the
// bug actually produced. If any of them fails to trip, a zero count below means nothing.
const CONTROLS = [
  ['whole message swallowed', 'Jane Smith, full gut renovation at 36 Bushnell Rd, $65,000, starting September 1 2026.'],
  ['message minus the money', 'Jane Smith, full gut renovation at 36 Bushnell Rd, starting September 1'],
  ['message minus the date', 'Jane Smith, full gut renovation at 36 Bushnell Rd, $65,000'],
  ['bare scope sentence', 'we want to remodel the kitchen and bathroom'],
  ['non-answer', 'i dont know yet'],
  ['long run-on with no keywords', 'the people who are buying the house from us later this year once everything closes'],
];
const NEGATIVES = [
  'Jane Smith', 'John and Jane Smith', "Aoife O’Brien", 'Ravi Ramachandran',
  'The Okonkwo Family', 'Smith-Hendrickson Trust',
];
let ctlFail = 0;
for (const [label, s] of CONTROLS) {
  const r = nameSmells(s);
  if (!r) { ctlFail++; console.log(`CONTROL MISS  ${label}: detector did not fire on ${JSON.stringify(s.slice(0, 60))}`); }
}
for (const s of NEGATIVES) {
  const r = nameSmells(s);
  if (r) { ctlFail++; console.log(`FALSE POSITIVE  ${JSON.stringify(s)} -> ${r.join('; ')}`); }
}
console.log(`detector self-test: ${CONTROLS.length} positive controls, ${NEGATIVES.length} real names, ${ctlFail} failure(s)`);
if (ctlFail) { console.log('\ndetector is not trustworthy; the scan below cannot support a zero result'); process.exit(1); }
if (process.argv.includes('--selftest')) process.exit(0);

const list = await api('/api/documents');
const docs = list.data?.documents || [];
console.log(`\nscanning ${docs.length} live documents at ${BASE}\n`);

let flagged = 0;
let inspected = 0;   // fields that actually held a value — the real denominator
let empty = 0;
let payloadless = 0;
const repair = [];
const seen = [];
for (const d of docs) {
  const full = await api(`/api/documents/${d.id}`);
  const p = full.data?.document?.payload;
  if (!p || typeof p !== 'object') { payloadless++; console.log(`NO PAYLOAD  ${d.doc_number} (${full.status})`); continue; }
  for (const [label, get] of NAME_PATHS) {
    const v = get(p);
    if (String(v || '').trim() === '') { empty++; } else { inspected++; seen.push(`${d.doc_number} ${label} = ${JSON.stringify(String(v).slice(0, 80))}`); }
    // Address fields are allowed to be long; only judge them on the non-address signals.
    const reasons = nameSmells(v);
    if (!reasons) continue;
    const isAddr = label.includes('address');
    const kept = isAddr ? reasons.filter((r) => r !== 'contains an address' && !r.startsWith('length')) : reasons;
    if (kept.length === 0) continue;
    flagged++;
    repair.push({ doc: d.doc_number, id: d.id, status: d.status, label, value: v, reasons: kept });
    console.log(`${d.doc_number}  ${d.status.padEnd(7)}  ${label}`);
    console.log(`   value:  ${JSON.stringify(String(v).slice(0, 120))}`);
    console.log(`   smells: ${kept.join('; ')}\n`);
  }
}

if (process.argv.includes('--show')) { console.log('every non-empty party field inspected:'); for (const s of seen) console.log('  ' + s); console.log(''); }

console.log(`documents fetched      ${docs.length}  (payload missing: ${payloadless})`);
console.log(`party fields inspected ${inspected}  (empty, not judged: ${empty})`);
console.log(`flagged                ${flagged} field(s) across ${new Set(repair.map((r) => r.id)).size} document(s)`);
if (payloadless) console.log('\nWARNING: some documents returned no payload — the zero below does not cover them');
if (inspected === 0) console.log('\nWARNING: zero fields carried a value — a null result here proves nothing about the data');
else if (flagged === 0) console.log(`\nnull is real: ${inspected} populated party fields, detector proven to fire on ${CONTROLS.length} corruption shapes, none matched`);
