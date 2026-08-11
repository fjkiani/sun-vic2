// test-slot-absorption — the pending-slot answer path, against the real function.
//
// Origin: a real browser run against the real agent created a real contract carrying
//   homeowner.name = "Jane Smith, full gut renovation at 36 Bushnell Rd, $65,000, starting
//                     September 1 2026."
// The agent had asked "Who is the homeowner?"; absorbPendingSlot() tried the conservative
// extractor, got null, and fell through to coercing the RAW MESSAGE, which for type:'string' is
// an unconditional accept. The whole sentence became the homeowner's legal name on an NJ
// home-improvement contract.
//
// None of the 701 existing unit assertions touched this path, and the browser test that ran the
// conversation only asserted the slot was "filled" — which it was, with garbage. So the
// assertions here are about the VALUE, never about filled-ness.
//
// This imports packages/agent/thread-agent.js directly rather than reimplementing the logic. An
// earlier version of this file mirrored the function, which is exactly how the bug hid.

import { absorbPendingSlot } from '../packages/agent/thread-agent.js';
import { foreignSlotHits, slotDefsFor } from '../packages/agent/thread-slots.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log(`  FAIL ${m}`); } };
const eq = (got, want, m) => ok(got === want, `${m}\n         got:  ${JSON.stringify(got)}\n         want: ${JSON.stringify(want)}`);

const T = 'contract';
const val = (key, msg) => absorbPendingSlot(T, key, msg)?.value ?? null;
const err = (key, msg) => absorbPendingSlot(T, key, msg)?.error ?? null;

// ── 1. plain answers to "Who is the homeowner?" are taken as given ───────────────
console.log('1. plain answers');
eq(val('homeowner.name', 'Jane Smith'), 'Jane Smith', 'bare two-word name');
eq(val('homeowner.name', 'John and Jane Smith'), 'John and Jane Smith', 'joint owners');
eq(val('homeowner.name', "It's Maria Delgado"), 'Maria Delgado', 'conversational lead-in stripped');
eq(val('homeowner.name', 'That\u2019s Robert O\u2019Brien'), 'Robert O\u2019Brien', 'curly apostrophe surname');
eq(val('homeowner.name', 'Dr. Ramachandran Venkataraman'), 'Dr. Ramachandran Venkataraman', 'title + long name');
eq(val('homeowner.name', 'the Marchetti family'), 'Marchetti family', 'family form');

// ── 2. the reported corruption, and its neighbours ───────────────────────────────
console.log('2. compound messages must not be swallowed whole');
const REPORTED = 'Jane Smith, full gut renovation at 36 Bushnell Rd, $65,000, starting September 1 2026.';
eq(val('homeowner.name', REPORTED), 'Jane Smith', 'the exact message that corrupted CTR-2026-0059');
ok(val('homeowner.name', REPORTED) !== REPORTED, 'the whole sentence is never written in as a name');
eq(val('homeowner.name', 'Jane Smith, $65,000 budget'), 'Jane Smith', 'name + money');
eq(val('homeowner.name', 'Maria Delgado at 88 Raritan Avenue'), 'Maria Delgado', 'name + address');
eq(val('homeowner.name', 'Tom Weaver. Kitchen and bathroom remodel.'), 'Tom Weaver', 'name + scope');
eq(val('homeowner.name', 'homeowner is Jane Smith, starting next month'), 'Jane Smith', 'keyword + copula + date');
eq(val('homeowner.name', 'the client will be the Okonkwo family, budget 90000'), 'Okonkwo family', 'keyword + future copula');

// Every recovered value must be a strict prefix-or-substring of what the user typed — we never
// invent a name that was not on screen.
for (const msg of [REPORTED, 'Jane Smith, $65,000 budget', 'Maria Delgado at 88 Raritan Avenue',
                   'Tom Weaver. Kitchen and bathroom remodel.']) {
  const v = val('homeowner.name', msg);
  ok(v != null && msg.includes(v), `recovered name is literally present in the message: ${JSON.stringify(v)}`);
}

// ── 3. non-answers are refused rather than written in ────────────────────────────
console.log('3. non-answers');
eq(val('homeowner.name', 'i dont know yet'), null, '"i dont know yet" is not a name');
eq(err('homeowner.name', 'i dont know yet'), 'raw_rejected', 'and it is reported as rejected');
eq(val('homeowner.name', 'not sure, need to check with my partner'), null, 'hedge is not a name');
eq(val('homeowner.name', 'whoever ends up buying the place, probably a young family moving out from the city'),
   null, 'a rambling sentence is not a name');
eq(val('homeowner.name', 'tbd'), null, 'tbd is not a name');
eq(val('homeowner.name', ''), null, 'empty message');

// ── 4. the compound guard fires for the right reason ─────────────────────────────
console.log('4. compound guard');
// A message with foreign slot content that yields NO recoverable name must refuse, not absorb.
const compoundNoName = 'somewhere around 36 Bushnell Rd for about $65,000';
eq(val('homeowner.name', compoundNoName), null, 'unrecoverable compound is refused');
eq(err('homeowner.name', compoundNoName), 'compound_message', 'and reported as compound');
ok(foreignSlotHits(T, 'homeowner.name', compoundNoName).length >= 2,
   'the guard saw the foreign slots that justify refusing');
// A plain name has no foreign content at all.
eq(foreignSlotHits(T, 'homeowner.name', 'Jane Smith').length, 0, 'a plain name trips nothing');
eq(foreignSlotHits(T, 'homeowner.name', 'John and Jane Smith').length, 0, 'joint owners trip nothing');

// ── 5. the address slot still works, and is not collateral damage ────────────────
console.log('5. address slot');
eq(val('homeowner.address', '36 Bushnell Rd, Edison, NJ 08820'), '36 Bushnell Rd', 'street extracted');
eq(val('homeowner.address', '88 Raritan Avenue, Highland Park, NJ'), '88 Raritan Avenue', 'avenue extracted');
eq(val('homeowner.address', '1247 W 5th Avenue'), '1247 W 5th Avenue', 'directional + ordinal street');
ok(val('homeowner.address', 'Highland Park, NJ 08904') != null, 'a town-only answer is still accepted');
// The liberal name reader must NOT be reachable from the address slot.
eq(absorbPendingSlot(T, 'homeowner.address', 'Highland Park, NJ 08904')?.key, 'homeowner.address',
   'absorbing an address never writes to another key');

// ── 6. the liberal reader is confined to the slot that was asked ─────────────────
console.log('6. answerExtract is not used for context-free scanning');
// autoFillSlots scans EVERY user message in the thread; if the liberal anchored-name pattern
// leaked into it, an address answer like "Highland Park, NJ 08904" would silently become the
// homeowner's name on a later turn.
const nameDef = slotDefsFor(T).find((d) => d.key === 'homeowner.name');
ok(typeof nameDef.answerExtract === 'function', 'homeowner.name declares an answerExtract');
ok(nameDef.extract !== nameDef.answerExtract, 'the context-free extractor is a different function');
eq(nameDef.extract('Highland Park, NJ 08904'), null,
   'the conservative extractor does not read a town as a name');
eq(nameDef.extract('Jane Smith, full gut renovation'), null,
   'the conservative extractor stays conservative (recovery happens only when asked)');

// ── 7. money and date slots are unaffected ───────────────────────────────────────
console.log('7. other slot types');
eq(val('payment.total_cents', '$65,000'), 6500000, 'money answer in cents');
eq(val('payment.total_cents', '65k'), 6500000, 'shorthand money');
eq(val('timeline.start_date', 'September 1, 2026'), '2026-09-01', 'named date');
eq(val('timeline.start_date', '2026-09-01'), '2026-09-01', 'iso date');
ok(Array.isArray(val('scope_categories', 'kitchen and bathroom')), 'scope answer is a list');

// ── 8. surnames that the old name pattern silently truncated ─────────────────────
// [A-Z][a-z'’]+ cannot represent a capital after an apostrophe or inside a word, so these were
// being cut short on contracts: "O’Brien" → "O’", "McDonald" → "Mc", "Smith-Lee" → "Smith".
// Found because a plain-answer assertion failed, not because anyone went looking.
console.log('8. surnames with internal capitals');
for (const [msg, want] of [
  ['Robert O\u2019Brien', 'Robert O\u2019Brien'],
  ["Sean O'Brien", "Sean O'Brien"],
  ['Angela McDonald', 'Angela McDonald'],
  ['Fiona MacLeod', 'Fiona MacLeod'],
  ['Priya Smith-Hendrickson', 'Priya Smith-Hendrickson'],
  ['Luca D\u2019Angelo', 'Luca D\u2019Angelo'],
  ['John and Jane O\u2019Brien', 'John and Jane O\u2019Brien'],
]) {
  eq(val('homeowner.name', msg), want, `whole surname survives: ${msg}`);
  // And the same name must survive when other facts ride along in the message.
  eq(val('homeowner.name', `${msg}, $42,000, starting in 3 weeks`), want,
     `whole surname survives inside a compound message: ${msg}`);
}

console.log(`\nPASS ${pass}  FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
