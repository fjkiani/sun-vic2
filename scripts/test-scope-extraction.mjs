// test-scope-extraction.mjs
//
// A production thread absorbed this message:
//
//   "Jane Smith, full gut renovation at 36 Bushnell Rd, $65,000, starting Sept 1"
//
// and persisted scope_categories = ["Demolition & Foundation"] — nothing else.
// Every other slot came out correct. That single wrong value is the difference
// between a whole-house renovation contract and a legal document whose scope of
// work says the contractor is demolishing the house and doing no rebuild.
//
// "Gut" is an umbrella. It says how much is coming out, not what is going back
// in. This module's stated rule is that false negatives are cheap (the agent
// asks one more question) and false positives are damaging (wrong data on a
// signed contract), so a bare umbrella term must decline to guess.
//
// Pure functions over the real slot definitions. No LLM, no network.

import {
  slotByKey,
  slotDefsFor,
  autoFillSlots,
  missingRequiredSlots,
} from '../packages/agent/thread-slots.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL', msg); } };
const section = (s) => console.log(`\n${s}`);

const def = slotByKey('contract', 'scope_categories');
const extract = def.extract;
const OPTIONS = def.options;
const sorted = (a) => (a === null ? null : [...a].sort());
const eq = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

// ─── 1. The slot contract itself ──────────────────────────────────────────
section('1. slot definition');
ok(!!def, 'contract has a scope_categories slot');
ok(def.required === true, 'scope_categories is required (so a null extract means the agent asks)');
ok(def.type === 'multi-enum', 'scope_categories is multi-enum');
ok(eq(OPTIONS, ['Demolition & Foundation', 'Exteriors', 'Interiors', 'MEP']),
  `options are the four canonical categories (got ${JSON.stringify(OPTIONS)})`);
ok(typeof extract === 'function', 'the slot is wired to an extractor');

// ─── 2. THE regression: a bare umbrella must not fill the slot ────────────
section('2. umbrella terms decline to guess');
const UMBRELLA_ONLY = [
  'full gut renovation',
  'complete gut',
  'we want to gut the place',
  'gut reno',
  'gutting the whole house',
  'they gutted it last year and want to start over',
  'Jane Smith, full gut renovation at 36 Bushnell Rd, $65,000, starting Sept 1',
];
for (const msg of UMBRELLA_ONLY) {
  const got = extract(msg);
  ok(got === null, `"${msg}" → null, not a scope (got ${JSON.stringify(got)})`);
}

// Positive control. This is what the code did before the fix, and it is the
// value observed on the live thread. If the assertion below ever passes again,
// the bug is back.
const oldRule = (m) => {
  const lower = (m || '').toLowerCase();
  const cats = new Set();
  if (/\b(kitchen|bath(?:room)?|bedroom|living\s+room|floor(?:ing)?|cabinet|counter|paint|drywall|tile|interior|finish)\b/.test(lower)) cats.add('Interiors');
  if (/\b(roof|siding|window|door|deck|patio|driveway|landscape|gutter|facade|exterior|paint\s+outside)\b/.test(lower)) cats.add('Exteriors');
  if (/\b(plumb(?:ing)?|electric(?:al)?|hvac|heating|cooling|ac|air\s+conditioning|water\s+heater|panel|circuit|breaker|duct|vent|boiler|furnace)\b/.test(lower)) cats.add('MEP');
  if (/\b(demo(?:lition)?|foundation|excavat(?:e|ion)|basement\s+dig|underpin|slab|footing|gut)\b/.test(lower)) cats.add('Demolition & Foundation');
  return cats.size > 0 ? [...cats] : null;
};
const PROD_MSG = 'Jane Smith, full gut renovation at 36 Bushnell Rd, $65,000, starting Sept 1';
ok(eq(oldRule(PROD_MSG), ['Demolition & Foundation']),
  'positive control: the old rule really did scope a whole-house gut as demolition only');
ok(extract(PROD_MSG) === null, 'the new rule refuses that same message');

// ─── 3. Umbrella + a real trade still fills ───────────────────────────────
// "Gut the kitchen" names a room, so there is something to demolish AND
// something to rebuild. Declining here would be over-correction.
section('3. umbrella plus a named trade still fills');
const COMBOS = [
  ['gut the kitchen', ['Interiors', 'Demolition & Foundation']],
  ['gut the kitchen and both bathrooms', ['Interiors', 'Demolition & Foundation']],
  ['gutting the roof and siding', ['Exteriors', 'Demolition & Foundation']],
  ['full gut plus new electrical and HVAC', ['MEP', 'Demolition & Foundation']],
  ['gut the interior, new plumbing, new windows', ['Interiors', 'MEP', 'Exteriors', 'Demolition & Foundation']],
];
for (const [msg, want] of COMBOS) {
  const got = extract(msg);
  ok(eq(got, want), `"${msg}" → ${JSON.stringify(want)} (got ${JSON.stringify(got)})`);
}

// ─── 4. Specific demolition words are not umbrellas ───────────────────────
section('4. specific demolition words still fill');
const SPECIFIC = [
  'demolition',
  'demo the garage',
  'new foundation',
  'excavation and footings',
  'underpin the basement',
  'pour a new slab',
];
for (const msg of SPECIFIC) {
  const got = extract(msg);
  ok(got !== null && got.includes('Demolition & Foundation'),
    `"${msg}" → includes Demolition & Foundation (got ${JSON.stringify(got)})`);
}

// ─── 5. The other three categories, unchanged ─────────────────────────────
section('5. Interiors / Exteriors / MEP regression guards');
const SINGLES = [
  ['new kitchen cabinets and countertops', ['Interiors']],
  ['refinish the hardwood floors', ['Interiors']],
  ['tear off and replace the roof', ['Exteriors']],
  ['new deck and driveway', ['Exteriors']],
  ['replace the water heater and the electrical panel', ['MEP']],
  ['ductwork and a new furnace', ['MEP']],
];
for (const [msg, want] of SINGLES) {
  const got = extract(msg);
  ok(eq(got, want), `"${msg}" → ${JSON.stringify(want)} (got ${JSON.stringify(got)})`);
}

// ─── 6. False-positive guards ─────────────────────────────────────────────
section('6. must not invent a scope');
ok(extract('') === null, 'empty message → null');
ok(extract(null) === null, 'null message → null');
ok(extract('Her name is Jane Smith') === null, 'a name is not a scope');
ok(extract('the budget is $65,000') === null, 'a number is not a scope');
ok(extract('start September 1st') === null, 'a date is not a scope');
// "gutter" is an Exteriors word. \b must keep it out of the umbrella match.
const gutterOnly = extract('clean and replace the gutters');
ok(eq(gutterOnly, ['Exteriors']), `"gutters" → Exteriors only, not Demolition (got ${JSON.stringify(gutterOnly)})`);

// Nothing may escape the enum — a value outside options cannot be rendered.
const PROBES = [...UMBRELLA_ONLY, ...COMBOS.map((c) => c[0]), ...SPECIFIC, ...SINGLES.map((s) => s[0])];
for (const msg of PROBES) {
  const got = extract(msg) || [];
  for (const c of got) ok(OPTIONS.includes(c), `"${msg}" produced "${c}", which is a real option`);
  ok(new Set(got).size === got.length, `"${msg}" produced no duplicate categories`);
}

// ─── 7. Plurals ───────────────────────────────────────────────────────────
// Every keyword list was authored in the singular and \b made the plural a hard
// non-match. "New windows and doors" — the single most ordinary sentence a
// homeowner can write — extracted nothing at all. Each pair below is
// singular-that-already-worked / plural-that-silently-did-not.
section('7. plural and -ing forms must match');
const PLURALS = [
  ['Interiors', 'new kitchen', 'two kitchens'],
  ['Interiors', 'the bathroom', 'both bathrooms'],
  ['Interiors', 'refinish the floor', 'refinish the hardwood floors'],
  ['Interiors', 'new cabinet', 'new cabinets'],
  ['Interiors', 'a new counter', 'quartz counters'],
  ['Interiors', 'tile the entry', 'new tiles throughout'],
  ['Interiors', 'paint the walls', 'interior painting'],
  ['Exteriors', 'a new window', 'new windows'],
  ['Exteriors', 'the front door', 'new doors'],
  ['Exteriors', 'new roof', 'roofing'],
  ['Exteriors', 'the gutter', 'clean the gutters'],
  ['Exteriors', 'a deck', 'two decks'],
  ['Exteriors', 'the patio', 'patios'],
  ['Exteriors', 'landscape work', 'landscaping'],
  ['MEP', 'the electrical panel', 'two panels'],
  ['MEP', 'a new circuit', 'new circuits'],
  ['MEP', 'the duct', 'new ducts'],
  ['MEP', 'add a vent', 'ventilation'],
  ['MEP', 'the boiler', 'boilers'],
  ['Demolition & Foundation', 'the footing', 'new footings'],
  ['Demolition & Foundation', 'pour a slab', 'two slabs'],
  ['Demolition & Foundation', 'demolition', 'demolishing the garage'],
  ['Demolition & Foundation', 'excavation', 'excavating the lot'],
  ['Demolition & Foundation', 'underpin', 'underpinning'],
];
for (const [cat, singular, plural] of PLURALS) {
  const s = extract(singular) || [];
  const p = extract(plural) || [];
  ok(s.includes(cat), `"${singular}" → includes ${cat} (got ${JSON.stringify(s)})`);
  ok(p.includes(cat), `"${plural}" → includes ${cat} (got ${JSON.stringify(p)})`);
}
// The sentence that started this section.
ok(eq(extract('new windows and doors'), ['Exteriors']), '"new windows and doors" → Exteriors');

// ─── 8. End to end through the path the agent actually uses ───────────────
// autoFillSlots is what runs on every turn. Declining the scope must leave the
// slot missing (so the machine asks) without disturbing the others.
section('8. autoFillSlots on the real production message');
const { patch: filled } = autoFillSlots('contract', {}, [PROD_MSG]);
console.log(`  ${JSON.stringify(filled)}`);
ok(/Bushnell/.test(filled['homeowner.address'] || ''), `homeowner.address kept the street (got ${JSON.stringify(filled['homeowner.address'])})`);
ok(filled['payment.total_cents'] === 6500000, `payment.total_cents is 6500000 (got ${filled['payment.total_cents']})`);
ok(/^\d{4}-09-01$/.test(filled['timeline.start_date'] || ''), `timeline.start_date is a Sept 1 (got ${filled['timeline.start_date']})`);
ok(!('scope_categories' in filled), 'scope_categories was NOT guessed');

// homeowner.name is deliberately absent here: the unprompted extractor only
// fires on an explicit cue ("for Jane Smith", "the homeowner is ..."). On the
// live thread the name arrived through absorbPendingSlot's answer path, because
// "Who is the homeowner?" had just been asked. That path is covered by
// test-slot-absorption.mjs; asserting it here would be testing a different unit.
const missing = missingRequiredSlots('contract', filled).map((d) => d.key);
ok(eq(missing, ['homeowner.name', 'scope_categories']), `left to ask: ${JSON.stringify(missing)}`);

// And the question it will ask has to actually list the choices, or the user
// cannot answer a multi-enum.
const q = def.question || '';
ok(q.length > 0, 'the scope slot has a canonical question');
for (const o of OPTIONS) ok(q.includes(o), `the question names "${o}"`);

// ─── 9. Cost of the fix, stated plainly ───────────────────────────────────
section('9. cost of declining');
const req = slotDefsFor('contract').filter((d) => d.required).length;
console.log(`  contract has ${req} required slots; declining an umbrella costs exactly 1 extra question`);
ok(req === 5, `still 5 required slots (got ${req})`);

console.log(`\nPASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
