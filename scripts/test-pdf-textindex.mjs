// test-pdf-textindex — the click-to-edit resolver, held to the standard the Live mirror failed.
//
// The mirror shipped 20 hardcoded paths, 9 of which could not write correctly to a real
// payload. These tests assert the two properties that makes that class of defect impossible:
//   (1) a path is only ever produced by reading the live payload, so it cannot drift;
//   (2) an ambiguous or unknown click produces NO path, so it can never write to the wrong field.
//
// Section 6 replays the mirror's actual 20 bindings against a real production contract.

import {
  buildLeafIndex, resolveTextToPath, isWritableLeaf, isPathLocked, getPath, labelForPath, norm,
  formatVariants, parseInput, kindForPath, lockReason, findEmbeddedLeaf, explainComputed,
} from '../src/lib/pdfTextIndex.js';
import { DEFAULT_CONTRACT_LOCKS, DEFAULT_INVOICE_LOCKS } from '../packages/templates/legal.js';
import { milestoneAmountCents } from '../packages/templates/format.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL:', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// A payload shaped exactly like production: nested legal objects with text leaves and siblings.
const PAYLOAD = {
  contract_type: 'Home Improvement Contract',
  job_no: 'CTR-2026-0019',
  prepared_on: '2026-08-05',
  contractor: {
    legal_name: 'Sunvic Home Remodeling LLC',
    address: '12 Industrial Way, Edison, NJ 08817',
    phone: '7325550142',
    email: 'office@sunvicnj.com',
    license_number: '13VH11111100',
    website: 'sunvicnj.com',
  },
  homeowner: {
    name: 'Maria Delgado',
    email: '',
    phone: '',
    address: '88 Raritan Avenue, Highland Park, NJ',
  },
  payment: { total_cents: 4850000, schedule: [{ milestone: 'Deposit', percent: 30, condition: 'On signing' }] },
  scope_of_work: {
    tasks: [
      { description: 'Demolition of existing kitchen', amount_cents: 800000 },
      { description: 'Cabinetry and countertops', amount_cents: 2100000 },
    ],
  },
  warranties: {
    text: 'Contractor warrants all labor for one year from substantial completion.',
    start_text: 'The warranty period begins on the date of substantial completion.',
    materials_text: 'Manufacturer warranties on materials pass through to the Owner.',
    one_year_workmanship: 'yes',
  },
  unforeseen: {
    text: 'Concealed conditions discovered during the work are handled as follows.',
    option_1: 'Contractor stops work and issues a written change order.',
    option_2: 'Owner may elect to terminate and pay for work completed.',
  },
  // Shaped to match the real CTR-2026-0019 payload, verified against production: the legal
  // block is objects-with-text-leaves, which is precisely what the mirror wrote strings over.
  permits: { intro: 'Contractor shall obtain all permits required by the municipality.', homeowner_responsible: 'none', contractor_responsible: 'all' },
  insurance: { text: 'Contractor carries general liability insurance.', coverage_certificate_available: 'yes' },
  right_to_cancel: { text: 'You may cancel this transaction within three business days.', cancellation_deadline_days: '3' },
  material_selection: { text: 'Owner selects materials from the allowance schedule.' },
  change_orders: { text: 'No change is binding unless in a signed written change order.' },
  timeline: { start_date: '', disclaimer: 'Dates are estimates and may shift with weather.' },
};

const IDX = buildLeafIndex(PAYLOAD);

console.log('1. index is built from the payload, so drift is not expressible');
{
  const paths = new Set(IDX.map((l) => l.path));
  ok(paths.has('contractor.address'), 'real key contractor.address is indexed');
  ok(paths.has('contractor.license_number'), 'real key contractor.license_number is indexed');
  ok(!paths.has('contractor.address_line_1'), "the mirror's misspelling is absent");
  ok(!paths.has('contractor.address_line_2'), "the mirror's misspelling is absent");
  ok(!paths.has('contractor.license_no'), "the mirror's misspelling is absent");
  ok(!paths.has('signature_intro'), 'a path that never existed is absent');
  ok(paths.has('warranties.text'), 'the text leaf is indexed');
  ok(!paths.has('warranties'), 'the parent OBJECT is not an addressable target');
  ok(!paths.has('unforeseen'), 'the parent OBJECT is not an addressable target');
  ok(!paths.has('homeowner.email'), 'an empty leaf renders nothing, so it is not clickable');
  ok(!paths.has('timeline.start_date'), 'an empty leaf renders nothing, so it is not clickable');
}

console.log('2. exact matches resolve to the right leaf');
{
  const r = resolveTextToPath(IDX, 'Maria Delgado');
  ok(r.ok, 'homeowner name resolves'); eq(r.path, 'homeowner.name', 'homeowner name path');
  const a = resolveTextToPath(IDX, '88 Raritan Avenue, Highland Park, NJ');
  ok(a.ok, 'address resolves'); eq(a.path, 'homeowner.address', 'address path');
  const c = resolveTextToPath(IDX, '13VH11111100');
  ok(c.ok, 'license resolves'); eq(c.path, 'contractor.license_number', 'license path');
  const w = resolveTextToPath(IDX, 'sunvic home remodeling llc');
  ok(w.ok, 'match is case-insensitive'); eq(w.path, 'contractor.legal_name', 'legal name path');
}

console.log('3. whitespace from PDF line-breaking does not defeat matching');
{
  const r = resolveTextToPath(IDX, '  Contractor warrants all labor\n  for one year from substantial   completion. ');
  ok(r.ok, 'a re-wrapped paragraph still resolves');
  eq(r.path, 'warranties.text', 'resolves to the TEXT LEAF, never the parent object');
}

console.log('4. a fragment resolves to the tightest enclosing field, not the document');
{
  const r = resolveTextToPath(IDX, 'Cabinetry and count');
  ok(r.ok, 'a partial run resolves'); eq(r.path, 'scope_of_work.tasks.1.description', 'indexed array row is addressable');
  const s = resolveTextToPath(IDX, 'substantial completion');
  ok(s.ok, 'a fragment shared by two leaves picks the shortest container');
  eq(s.path, 'warranties.start_text', 'shortest containing leaf wins');
}

console.log('5. ambiguity and template chrome produce NO path');
{
  const dup = buildLeafIndex({ a: { total: '$65,000' }, b: { total: '$65,000' } });
  const r = resolveTextToPath(dup, '$65,000');
  ok(!r.ok, 'an identical string in two fields does not silently pick one');
  eq(r.reason, 'ambiguous', 'reported as ambiguous');
  eq(r.candidates.length, 2, 'both candidates offered to the caller');

  const line = resolveTextToPath(dup, '$65,000', 'A TOTAL: $65,000');
  ok(!line.ok || line.path === 'a.total', 'line context may disambiguate, but never guesses wrong');

  const chrome = resolveTextToPath(IDX, 'SCOPE OF WORK');
  ok(!chrome.ok, 'a static template heading is not editable');
  eq(chrome.reason, 'not_in_payload', 'reported honestly');
  ok(!resolveTextToPath(IDX, '').ok, 'empty click is a no-op');
  ok(!resolveTextToPath(IDX, 'a').ok, 'a single character is a no-op');
}

console.log("6. replay: the mirror's 20 bindings against this payload");
{
  const MIRROR_PATHS = [
    'contract_type', 'job_no', 'prepared_on',
    'contractor.address_line_1', 'contractor.address_line_2', 'contractor.license_no',
    'contractor.phone', 'contractor.email',
    'homeowner.name', 'homeowner.address', 'homeowner.email', 'homeowner.phone',
    'warranties', 'insurance', 'permits', 'unforeseen', 'right_to_cancel',
    'material_selection', 'change_orders', 'signature_intro',
  ];
  const writable = MIRROR_PATHS.filter((p) => isWritableLeaf(PAYLOAD, p));
  const destructive = MIRROR_PATHS.filter((p) => {
    const v = getPath(PAYLOAD, p);
    return v !== undefined && v !== null && typeof v === 'object';
  });
  const clobbered = destructive.reduce((n, p) => n + Object.keys(getPath(PAYLOAD, p)).length, 0);
  console.log(`   of ${MIRROR_PATHS.length} mirror bindings: ${writable.length} writable, ` +
              `${destructive.length} would DESTROY an object, ${MIRROR_PATHS.length - writable.length - destructive.length} dead`);
  console.log(`   those ${destructive.length} destructive writes would clobber ${clobbered} sibling keys`);
  // These three numbers were measured against the live CTR-2026-0019 payload on production.
  // If the fixture ever drifts from that shape, this test says so instead of quietly passing.
  eq(writable.length, 9, 'matches production: 9 of 20 bindings resolved');
  eq(destructive.length, 7, 'matches production: 7 bindings would clobber an object');
  eq(clobbered, 16, 'matches production: 16 sibling keys destroyable');
  ok(!isWritableLeaf(PAYLOAD, 'warranties'), 'guard refuses to write over an object');
  ok(!isWritableLeaf(PAYLOAD, 'unforeseen'), 'guard refuses to write over an object');
  ok(!isWritableLeaf(PAYLOAD, 'contractor.address_line_1'), 'guard refuses a path that is not in the schema');
  ok(!isWritableLeaf(PAYLOAD, 'signature_intro'), 'guard refuses a path that never existed');
  ok(isWritableLeaf(PAYLOAD, 'warranties.text'), 'the real text leaf IS writable');
  ok(isWritableLeaf(PAYLOAD, 'homeowner.email'), 'a present-but-empty leaf is writable');
  ok(isWritableLeaf(PAYLOAD, 'payment.total_cents'), 'a numeric leaf is writable');

  // The property that matters: everything the resolver can EVER return is writable.
  let checked = 0;
  for (const leaf of IDX) {
    const r = resolveTextToPath(IDX, leaf.value);
    if (r.ok) { checked++; ok(isWritableLeaf(PAYLOAD, r.path), `resolver output ${r.path} is a writable leaf`); }
  }
  ok(checked > 10, `exercised ${checked} round-trips`);
}

console.log('7. locks are honoured, including via ancestors');
{
  const locks = { 'warranties.text': true, unforeseen: true, 'contractor.legal_name': true };
  ok(isPathLocked(locks, 'warranties.text'), 'direct lock');
  ok(isPathLocked(locks, 'unforeseen.option_1'), 'ancestor lock covers the child');
  ok(isPathLocked(locks, 'contractor.legal_name'), 'direct lock');
  ok(!isPathLocked(locks, 'homeowner.name'), 'unlocked field stays editable');
  ok(!isPathLocked(null, 'homeowner.name'), 'absent lock map does not throw');

  // The mirror's real defect: undefined lock read as editable on legal text. Assert that the
  // canonical contract locks actually cover the legal block by path, not by lookalike name.
  const CANON = ['warranties.text', 'warranties.start_text', 'warranties.materials_text',
    'permits.intro', 'unforeseen.text', 'unforeseen.option_1', 'unforeseen.option_2'];
  const all = Object.fromEntries(CANON.map((p) => [p, true]));
  for (const p of CANON) ok(isPathLocked(all, p), `canonical legal path ${p} is lockable by its real name`);
}

console.log('9. money and dates: clickable as rendered, written back as stored');
{
  // The leaf holds 4850000. The page shows "$48,500.00". Without variant matching, the single
  // most important number on the contract would be unclickable.
  const m = resolveTextToPath(IDX, '$48,500.00');
  ok(m.ok, 'a formatted total resolves'); eq(m.path, 'payment.total_cents', 'to the cents leaf');
  eq(m.kind, 'money', 'reported as money so the editor parses it correctly');
  ok(resolveTextToPath(IDX, '$48,500').ok, 'without decimals too');
  ok(resolveTextToPath(IDX, '48,500.00').ok, 'without the currency symbol too');

  // Round trip: what the user types must reproduce the stored integer exactly.
  eq(parseInput('money', '$48,500.00').value, 4850000, 'formatted input round-trips to cents');
  eq(parseInput('money', '48500').value, 4850000, 'bare dollars round-trip to cents');
  eq(parseInput('money', '$1,234.56').value, 123456, 'cents preserved');
  eq(parseInput('money', '0').value, 0, 'zero is a legal total');
  ok(!parseInput('money', '').ok, 'empty is rejected, not written as 0');
  ok(!parseInput('money', 'twelve thousand').ok, 'prose is rejected');
  ok(!parseInput('money', '1.2.3').ok, 'malformed is rejected');
  ok(!parseInput('money', '$48,500.001').ok, 'sub-cent precision is rejected rather than rounded silently');

  // A wrong parse here would silently alter a legal contract total, so prove no input
  // that survives parsing can change the value it was rendered from.
  // INVARIANT: every string in the index must parse back to exactly the value it was built
  // from. A lossy key is a silent-corruption vector — see the rounded-dollars case below.
  let rt = 0;
  for (let cents = 0; cents <= 2600; cents += 7) {           // dense sweep across the cents boundary
    for (const v of formatVariants('payment.total_cents', cents)) {
      const back = parseInput('money', v);
      ok(back.ok && back.value === cents, `variant "${v}" must round-trip to ${cents}, got ${back.ok ? back.value : back.reason}`);
      rt++;
    }
  }
  for (const cents of [4850000, 6500000, 123456789, 999999999, 100000000]) {
    for (const v of formatVariants('payment.total_cents', cents)) {
      const back = parseInput('money', v);
      ok(back.ok && back.value === cents, `variant "${v}" must round-trip to ${cents}, got ${back.ok ? back.value : back.reason}`);
      rt++;
    }
  }
  console.log(`   ${rt} money renderings checked for lossless round-trip`);
  // And specifically: a rounded-dollars string is NOT offered as a match for a value with cents.
  ok(!formatVariants('payment.total_cents', 123456789).includes('$1,234,568'),
     'a rounded rendering is never a match key for an amount with cents');
  ok(formatVariants('payment.total_cents', 4850000).includes('$48,500'),
     'but it IS a match key when the amount is whole dollars');

  const dIdx = buildLeafIndex({ timeline: { start_date: '2026-09-01' } });
  const d = resolveTextToPath(dIdx, 'September 1, 2026');
  ok(d.ok, 'a long-form date resolves'); eq(d.path, 'timeline.start_date', 'to the date leaf');
  ok(resolveTextToPath(dIdx, 'Sep 1, 2026').ok, 'short month form resolves');
  ok(resolveTextToPath(dIdx, '9/1/2026').ok, 'slash form resolves');
  eq(parseInput('date', 'September 1, 2026').value, '2026-09-01', 'date round-trips to ISO');
  eq(parseInput('date', '9/1/2026').value, '2026-09-01', 'slash form round-trips to ISO');
  eq(parseInput('date', '2026-09-01').value, '2026-09-01', 'ISO passes through');
  ok(!parseInput('date', 'next Tuesday').ok, 'prose date is rejected');

  eq(parseInput('percent', '30%').value, 30, 'percent parses');
  ok(!parseInput('percent', 'thirty').ok, 'prose percent is rejected');
}

console.log('8. labels are readable');
{
  eq(labelForPath('homeowner.name'), 'homeowner › name', 'dotted path reads as words');
  eq(labelForPath('scope_of_work.tasks.1.description'), 'scope of work › tasks › #2 › description', 'array index is 1-based for humans');
  eq(norm('  a   b \n c '), 'a b c', 'norm collapses whitespace');
}

console.log('9. a hyphen at a line break is not a different word');
{
  // @react-pdf hyphenates at the wrap point, so the tail run of a wrapped word arrives as
  // "Demolition & Founda-". That is not a substring of "Demolition & Foundation" — they diverge
  // at the hyphen — so every wrapped word on the page refused a click on a field that exists.
  const idx = buildLeafIndex({
    scope_of_work: { groups: [{ area: 'Basement', tasks: [
      { description: 'Demolition & Foundation' },
      { description: 'Framing and drywall' },
    ] }] },
  });
  const wrapped = resolveTextToPath(idx, 'Demolition & Founda-');
  ok(wrapped.ok, 'the tail run of a hyphenated wrapped word resolves');
  eq(wrapped.path, 'scope_of_work.groups.0.tasks.0.description', 'to the task it was wrapped from');
  eq(wrapped.confidence, 'substring', 'as a substring match');

  // Negative controls — the hyphen rule must not become a wildcard.
  const absent = resolveTextToPath(idx, 'Excavation & Founda-');
  ok(!absent.ok, 'a hyphenated fragment of text that is NOT in the payload still refuses');
  eq(absent.reason, 'not_in_payload', 'and says which of the four refusals it is');
  ok(!resolveTextToPath(idx, 'Demoli-tion & Foundation').ok, 'only a trailing hyphen is dropped, never an interior one');
  ok(!resolveTextToPath(idx, 'xy-').ok, 'a 3-character fragment is still too short to match anything');
  const plain = resolveTextToPath(idx, 'Framing and drywall');
  ok(plain.ok && plain.confidence === 'exact', 'text that already matched still matches exactly');
}

console.log('10. every locked path gets a reason that is true for THAT path');
{
  const ALL = [
    ...Object.keys(DEFAULT_CONTRACT_LOCKS).filter((k) => DEFAULT_CONTRACT_LOCKS[k]).map((p) => ['contract', p]),
    ...Object.keys(DEFAULT_INVOICE_LOCKS).filter((k) => DEFAULT_INVOICE_LOCKS[k]).map((p) => ['invoice', p]),
  ];
  ok(ALL.length >= 28, `every default lock is covered (${ALL.length} locks)`);

  const KLASSES = new Set(['statutory', 'identity', 'standard_terms']);
  let statutory = 0;
  const statutoryPaths = new Set();
  for (const [, p] of ALL) {
    const r = lockReason(p);
    ok(KLASSES.has(r.klass), `${p}: klass is one of the three we can explain — got ${r.klass}`);
    ok(!!r.headline && !!r.detail, `${p}: has both a headline and a detail`);
    ok(typeof r.inlineUnlock === 'boolean', `${p}: says whether it can be unlocked in place`);
    // The single sentence this replaces claimed NJ mandates the wording of all 30.
    ok(!/required NJ contract language/i.test(`${r.headline} ${r.detail}`),
       `${p}: does not repeat the blanket "required NJ contract language" claim`);
    if (r.klass === 'statutory') { statutory++; statutoryPaths.add(p); }
    if (r.klass === 'standard_terms') {
      ok(!/N\.J\.S\.A|N\.J\.A\.C/.test(`${r.headline} ${r.detail}`),
         `${p}: company wording does not cite a statute it is not in`);
    }
    if (/^contractor\./.test(p)) {
      eq(r.klass, 'identity', `${p}: your own company details are identity, not statute`);
      ok(r.inlineUnlock, `${p}: can be unlocked from the document`);
    }
  }
  // Contract locks 23 paths, invoice 7; the two statutory ones both live on the contract.
  eq(statutory, 2, 'exactly two locked paths are actually fixed by New Jersey');
  ok(statutoryPaths.has('right_to_cancel.text'), 'the cancellation notice is one of them (N.J.S.A. 56:8-151)');
  ok(statutoryPaths.has('insurance.text'), 'the insurance statement is the other');
  ok(!lockReason('right_to_cancel.text').inlineUnlock, 'verbatim statutory text is never offered a one-tap unlock');
  ok(!lockReason('insurance.text').inlineUnlock, 'nor is the coverage statement');
  eq(lockReason('warranties.text').klass, 'standard_terms', 'a warranty is company wording');
  eq(lockReason('some.path.nobody.locked').klass, 'standard_terms', 'an unknown path fails safe, not statutory');
  eq(lockReason('contractor').klass, 'standard_terms', 'the contractor OBJECT is not a contractor field');
}

console.log('11. a fixed sentence with your own data inside it is not "just template"');
{
  const idx = buildLeafIndex({
    contractor: { legal_name: 'SUNVIC CONTRACTORS LLC', phone: '7325550142' },
    homeowner: { name: 'Maria Delgado' },
  });
  const e = findEmbeddedLeaf(idx, 'SUNVIC CONTRACTORS LLC is responsible for obtaining all required permits.');
  ok(!!e, 'the company name inside an authored sentence is found');
  eq(e?.path, 'contractor.legal_name', 'and named as the field it is');

  // Longest embedded value wins, so a short alias never beats the full name.
  const idx2 = buildLeafIndex({ contractor: { legal_name: 'SUNVIC CONTRACTORS LLC' }, for_label: 'SUNVIC' });
  eq(findEmbeddedLeaf(idx2, 'Prepared by SUNVIC CONTRACTORS LLC for the homeowner')?.path,
     'contractor.legal_name', 'the longest embedded leaf wins');

  // Negative controls.
  ok(!findEmbeddedLeaf(idx, 'Section D — Permits and Approvals'),
     'a heading containing none of your data returns null, not a guess');
  ok(!findEmbeddedLeaf(idx, 'SUNVIC CONTRACTORS LLC'),
     'an exact match is a hit for the resolver, not an embedding');
  ok(!findEmbeddedLeaf(buildLeafIndex({ homeowner: { state: 'NJ' } }), 'all work performed in NJ by us'),
     'a two-character value is too short to claim a sentence');
  ok(!findEmbeddedLeaf(idx, 'LLC'), 'a click shorter than the minimum is not searched');
}

console.log('12. a calculated dollar figure is explained, not disowned');
{
  const payload = { payment: { total_cents: 6500000, schedule: [
    { milestone: 'Deposit', percent: 15 },
    { milestone: 'Rough-in complete', percent: 35 },
    { milestone: 'Substantial completion', percent: 40 },
    { milestone: 'Final payment', percent: 10 },
  ] } };
  const money = (c) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  payload.payment.schedule.forEach((m, i) => {
    const cents = milestoneAmountCents(payload.payment.total_cents, m.percent);
    const r = explainComputed(payload, money(cents));
    ok(!!r, `${money(cents)} is recognised as a computed milestone amount`);
    eq(r?.index, i, `${m.milestone}: the right milestone`);
    eq(r?.percent, m.percent, `${m.milestone}: with its own percentage`);
    eq(r?.percentPath, `payment.schedule.${i}.percent`, `${m.milestone}: and the path that changes it`);
    ok(r && !r.ambiguous, `${m.milestone}: a unique percentage needs no disambiguation`);
  });

  // The module reimplements the renderer's arithmetic on purpose (it must stay import-free for
  // the browser bundle), so the two have to agree on the half-cent. The first version of this
  // check used 33.33% of $10,000.01 — 333300.3333 cents, where round and floor give the same
  // answer, so scripts/negcheck-locks.sh swapped round for floor and the test still passed.
  // A control that cannot fail is not a control. 15% of $3,333.33 is 49999.95 cents, which is
  // the smallest honest version of this: round says $500.00, floor says $499.99.
  const HALF = { total: 333333, pct: 15 };
  ok(Math.floor(HALF.total * HALF.pct / 100) !== Math.round(HALF.total * HALF.pct / 100),
     'the rounding case chosen actually distinguishes round from floor');
  const halfCents = milestoneAmountCents(HALF.total, HALF.pct);
  eq(halfCents, Math.round(HALF.total * HALF.pct / 100), 'the renderer rounds rather than truncates');
  eq(halfCents, 50000, 'and 15% of $3,333.33 prints as $500.00');
  const halfPayload = { payment: { total_cents: HALF.total, schedule: [{ milestone: 'Deposit', percent: HALF.pct }] } };
  const halfHit = explainComputed(halfPayload, money(halfCents));
  ok(!!halfHit, 'the explainer recognises the amount the renderer actually printed');
  eq(halfHit?.percent, HALF.pct, 'as that milestone percentage');
  ok(!explainComputed(halfPayload, money(Math.floor(HALF.total * HALF.pct / 100))),
     'and does NOT recognise the truncated amount, which nothing prints');
  // A percentage that does not divide evenly but rounds down, for coverage of the other side.
  const downCents = milestoneAmountCents(1000001, 33.33);
  eq(downCents, 333300, '33.33% of $10,000.01 rounds down to $3,333.00');
  ok(!!explainComputed({ payment: { total_cents: 1000001, schedule: [{ milestone: 'Deposit', percent: 33.33 }] } }, money(downCents)),
     'and is still explained');

  // Two milestones at the same percentage print the same figure; the line names which one.
  const dup = { payment: { total_cents: 4000000, schedule: [
    { milestone: 'Deposit', percent: 25 },
    { milestone: 'Rough-in complete', percent: 25 },
    { milestone: 'Final payment', percent: 50 },
  ] } };
  const dupAmt = money(milestoneAmountCents(4000000, 25));
  const guessed = explainComputed(dup, dupAmt);
  ok(guessed?.ambiguous, 'with no line context it admits the figure could be either milestone');
  eq(guessed?.matches, 2, 'and says how many print it');
  const fromLine = explainComputed(dup, dupAmt, `Rough-in complete 25% ${dupAmt} On completion of framing`);
  eq(fromLine?.index, 1, 'the milestone name on the line settles it');
  ok(fromLine && !fromLine.ambiguous, 'and it stops hedging once it knows');
  const wrongLine = explainComputed(dup, dupAmt, 'Payment Schedule');
  ok(wrongLine?.ambiguous, 'a line that names no milestone does not settle it');

  // Negative controls — this must not become a story told about every number on the page.
  ok(!explainComputed(payload, '$1,234.56'), 'an amount that is no milestone is not explained away');
  ok(!explainComputed(payload, 'Payment Schedule'), 'text that is not money is not explained');
  ok(!explainComputed(payload, '$0.00'), 'zero is not a milestone amount');
  ok(!explainComputed(payload, money(6500000)), 'the contract total is a stored field, not a computed one');
  ok(!explainComputed({ payment: { total_cents: 0, schedule: [{ milestone: 'x', percent: 15 }] } }, '$0.00'),
     'no total means no arithmetic to explain');
  ok(!explainComputed({ payment: { total_cents: 6500000 } }, money(975000)), 'no schedule means no milestone');
}

console.log(`\ntest-pdf-textindex: PASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
