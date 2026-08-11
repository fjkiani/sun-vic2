// probe-slot-absorption — measure, don't guess.
//
// A real run put this on a real contract:
//   homeowner.name = "Jane Smith, full gut renovation at 36 Bushnell Rd, $65,000, starting
//                     September 1 2026."
//
// Cause: when the agent has a pending slot, absorbPendingSlot() tries the slot's extractor and,
// if that returns null, falls back to coercing the RAW MESSAGE. For type:'string' coercion is an
// unconditional accept, so the entire sentence became the homeowner's legal name.
//
// The fallback is load-bearing — "Jane Smith" also fails the extractor and must still be
// accepted — so it cannot simply be deleted. This probe quantifies where the boundary is by
// running a labelled corpus through the current logic and printing the confusion matrix.

import {
  slotDefsFor, slotByKey, coerceSlotValue, autoFillSlots,
} from '../packages/agent/thread-slots.js';

// Mirror of the CURRENT absorbPendingSlot in packages/agent/thread-agent.js:261.
function absorbCurrent(template, pendingSlotKey, userMessage) {
  if (!pendingSlotKey) return null;
  const def = slotByKey(template, pendingSlotKey);
  if (!def) return null;
  let extracted = null;
  try { extracted = def.extract ? def.extract(userMessage) : null; } catch { extracted = null; }
  if (extracted != null) {
    const c = coerceSlotValue(def, extracted);
    if (c.ok) return { key: def.key, value: c.value, via: 'extract' };
  }
  const raw = String(userMessage || '').trim();
  const direct = coerceSlotValue(def, raw);
  if (direct.ok) return { key: def.key, value: direct.value, via: 'raw' };
  return { key: def.key, error: direct.error || 'coerce_failed' };
}

// Is the message carrying content belonging to slots OTHER than the pending one?
function foreignSlots(template, pendingKey, msg) {
  const hits = [];
  for (const d of slotDefsFor(template)) {
    if (d.key === pendingKey || !d.extract) continue;
    let v = null;
    try { v = d.extract(msg); } catch { v = null; }
    if (v != null && v !== '' && !(Array.isArray(v) && v.length === 0)) hits.push(d.key);
  }
  return hits;
}

// label: 'answer'  → the message is only the answer; absorbing it raw is correct
//        'compound'→ the message answers the slot but also carries other slots' data
//        'noise'   → not an answer at all
const CORPUS = [
  // ── plain answers to "Who is the homeowner?" ───────────────────────────────
  ['homeowner.name', 'Jane Smith', 'answer', 'Jane Smith'],
  ['homeowner.name', 'John and Jane Smith', 'answer', 'John and Jane Smith'],
  ["homeowner.name", "It's Maria Delgado", 'answer', null],
  ['homeowner.name', 'Robert O\u2019Brien', 'answer', 'Robert O\u2019Brien'],
  ['homeowner.name', 'Dr. Ramachandran Venkataraman', 'answer', null],
  ['homeowner.name', 'the Marchetti family', 'answer', null],
  // ── compound: answer + other slots in one breath (the reported failure) ────
  ['homeowner.name', 'Jane Smith, full gut renovation at 36 Bushnell Rd, $65,000, starting September 1 2026.',
    'compound', 'Jane Smith'],
  ['homeowner.name', 'Jane Smith, $65,000 budget', 'compound', 'Jane Smith'],
  ['homeowner.name', 'Maria Delgado at 88 Raritan Avenue', 'compound', 'Maria Delgado'],
  ['homeowner.name', 'Tom Weaver. Kitchen and bathroom remodel.', 'compound', 'Tom Weaver'],
  ['homeowner.name', 'homeowner is Jane Smith, starting next month', 'compound', 'Jane Smith'],
  // ── noise ─────────────────────────────────────────────────────────────────
  ['homeowner.name', 'i dont know yet', 'noise', null],
  ['homeowner.name', 'whoever ends up buying the place, probably a young family moving out from the city',
    'noise', null],
  // ── address slot ──────────────────────────────────────────────────────────
  ['homeowner.address', '36 Bushnell Rd, Edison, NJ 08820', 'answer', null],
  ['homeowner.address', '88 Raritan Avenue, Highland Park, NJ', 'answer', null],
  ['homeowner.address', '1247 W 5th Avenue', 'answer', null],
  ['homeowner.address', 'its 36 Bushnell Rd and the budget is $65,000', 'compound', null],
];

const TEMPLATE = 'contract';

console.log('pending slot            | label    | raw?  | value written');
console.log('------------------------|----------|-------|------------------------------------------');
let corrupt = 0, correct = 0, missed = 0;
const rows = [];
for (const [key, msg, label, want] of CORPUS) {
  const r = absorbCurrent(TEMPLATE, key, msg);
  const val = r?.value ?? null;
  const via = r?.via ?? '-';
  // Corruption = a value was written that is materially longer than the answer, i.e. the
  // message swallowed whole.
  const swallowed = via === 'raw' && val != null && val.trim() === msg.trim() && label !== 'answer';
  if (swallowed) corrupt++;
  else if (label === 'answer' && val != null) correct++;
  else if (label === 'compound' && want && val === want) correct++;
  else missed++;
  rows.push({ key, msg, label, via, val, swallowed, foreign: foreignSlots(TEMPLATE, key, msg) });
  console.log(
    `${key.padEnd(23)} | ${label.padEnd(8)} | ${(via === 'raw' ? 'RAW' : via).padEnd(5)} | ` +
    `${swallowed ? '!! ' : '   '}${String(val).slice(0, 70)}`,
  );
}

console.log('\nforeign-slot signal (what OTHER extractors find in the same message):');
for (const r of rows) {
  console.log(`  ${r.label.padEnd(8)} ${r.foreign.length ? r.foreign.join(', ') : '(none)'}   ← "${r.msg.slice(0, 58)}"`);
}

// Discriminative power of the proposed guard: does "foreign slots present" separate the
// messages that get swallowed from the ones that must be absorbed raw?
const answers = rows.filter((r) => r.label === 'answer');
const compounds = rows.filter((r) => r.label === 'compound');
const fp = answers.filter((r) => r.foreign.length > 0);      // would wrongly block a good answer
const tp = compounds.filter((r) => r.foreign.length > 0);    // would correctly block corruption
console.log(`\nguard "message carries another slot's content":`);
console.log(`  blocks ${tp.length}/${compounds.length} compound messages`);
console.log(`  wrongly blocks ${fp.length}/${answers.length} plain answers${fp.length ? ': ' + fp.map((r) => `"${r.msg}" → ${r.foreign.join(',')}`).join('; ') : ''}`);
console.log(`\ncorrupted ${corrupt}  correct ${correct}  missed ${missed}`);

// Length distribution, to size a secondary bound for plain string slots.
const nameAnswers = rows.filter((r) => r.key === 'homeowner.name' && r.label === 'answer');
const nameCompound = rows.filter((r) => r.key === 'homeowner.name' && r.label !== 'answer');
console.log(`\nhomeowner.name message length — answers: ${nameAnswers.map((r) => r.msg.length).join(', ')}`);
console.log(`homeowner.name message length — not answers: ${nameCompound.map((r) => r.msg.length).join(', ')}`);
