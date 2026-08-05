// Guardrail behaviour, including the cases the plan named explicitly:
//   schedule summing to 99.9% or 100.1% rejected, 100% accepted;
//   labor + materials != total flagged;
//   required-field preflight blocks with a NAMED missing field;
//   writes to signed/sent/paid return confirmation-required, not a silent write.
//
// Also cross-asserts the client-side copy of the arithmetic in formMath.js against the
// canonical server implementation over randomized inputs, so the two cannot drift apart
// without a test failing.

import {
  GUARDED_WRITE_STATUSES, SCHEDULE_TOLERANCE, MONEY_TOLERANCE_CENTS, SEVERITY,
  scheduleSum, scheduleBalanced, laborMaterialsDrift,
  scheduleIssues, moneyIssues, requiredFieldIssues,
  validatePayload, preflight, introducedIssues, writeGuard, statusTransitionGuard,
} from '../packages/validation/guardrails.js';

import {
  scheduleSum as fmSum,
  scheduleBalanced as fmBalanced,
  laborMaterialsDrift as fmDrift,
} from '../src/components/editors/formMath.js';

import { GUARDED_DOC_STATUSES } from '../src/components/work/deletePolicy.js';
import { ContractPayload, InvoicePayload } from '../packages/schema/documents.js';

let pass = 0;
const failures = [];
function ok(cond, label, detail = '') {
  if (cond) { pass += 1; return; }
  failures.push(detail ? `${label} — ${detail}` : label);
}
function eq(a, b, label) { ok(a === b, label, `got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`); }
function has(issues, code, label) {
  ok(issues.some((i) => i.code === code), label, `codes present: [${issues.map((i) => i.code).join(', ') || 'none'}]`);
}
function lacks(issues, code, label) {
  ok(!issues.some((i) => i.code === code), label, `unexpectedly present among [${issues.map((i) => i.code).join(', ')}]`);
}

const sched = (...pcts) => pcts.map((p, i) => ({ milestone: `M${i + 1}`, percent: p, condition: '' }));
const CANONICAL = sched(15, 20, 30, 15, 15, 5); // the real Sunvic six-milestone ladder

function contract(over = {}) {
  return ContractPayload.parse({
    homeowner: { name: 'Jane Smith', address: '12 Elm St, Newark NJ', email: 'jane@example.com', phone: '' },
    payment: { total_cents: 6500000, labor_cost_cents: 4550000, materials_cost_cents: 1950000, schedule: CANONICAL, method: 'check' },
    timeline: { start_date: '2026-09-01' },
    ...over,
  });
}
function invoice(over = {}) {
  return InvoicePayload.parse({
    bill_to: { client_name: 'Jane Smith', property_address: '12 Elm St', recipient_email: 'jane@example.com', recipient_phone: '' },
    milestone_label: 'Deposit',
    totals: { subtotal_cents: 975000, tax_cents: 0, total_due_cents: 975000, remaining_after_cents: 5525000 },
    ...over,
  });
}

// ── the canonical document is clean ──────────────────────────
{
  const v = validatePayload(contract(), 'contract');
  ok(v.ok, 'The real six-milestone Sunvic schedule validates clean',
    v.issues.map((i) => i.code).join(', '));
  eq(scheduleSum(CANONICAL), 100, 'Sunvic ladder sums to exactly 100');
  ok(preflight({ template: 'contract', payload: contract() }, 'email', { recipient: 'jane@example.com' }).ok,
    'A complete contract passes email preflight');
}

// ── schedule: the numbers named in the plan ──────────────────
for (const [pcts, expectOk, label] of [
  [[100], true, '100 accepted'],
  [[15, 20, 30, 15, 15, 5], true, 'six-row 100 accepted'],
  [[99.9], false, '99.9 rejected'],
  [[100.1], false, '100.1 rejected'],
  [[50, 50], true, '50+50 accepted'],
  [[50, 49.99], false, '99.99 rejected (just outside tolerance)'],
  [[33.33, 33.33, 33.34], true, 'thirds accepted'],
]) {
  const issues = scheduleIssues({ payment: { schedule: sched(...pcts) } }, 'contract');
  const balanced = !issues.some((i) => i.code === 'schedule_unbalanced');
  eq(balanced, expectOk, `Schedule ${label}`);
}
// Tolerance is a boundary, so probe both sides of it rather than trusting the constant.
ok(scheduleBalanced(sched(100 - SCHEDULE_TOLERANCE / 2)), 'Just inside tolerance accepted');
ok(!scheduleBalanced(sched(100 - SCHEDULE_TOLERANCE * 2)), 'Just outside tolerance rejected');

// The gap is reported in the message, because "invalid" without a number is useless.
{
  const [i] = scheduleIssues({ payment: { schedule: sched(15, 20, 30, 15, 15) } }, 'contract');
  eq(i.code, 'schedule_unbalanced', 'A 95% ladder is unbalanced');
  eq(i.severity, SEVERITY.ERROR, '...at error severity');
  ok(/95%/.test(i.message), 'Message states the actual sum', i.message);
  ok(/5%/.test(i.message) && /never be billed/.test(i.message),
    'Message states the consequence in money terms', i.message);
  eq(Math.round(i.gap * 100) / 100, 5, 'Gap is reported numerically');
}
{
  const [i] = scheduleIssues({ payment: { schedule: sched(60, 60) } }, 'contract');
  ok(/over-billed/.test(i.message), 'Over-100 schedules say over-billed, not under', i.message);
}

// An empty schedule is a warning while drafting but still blocks delivery — otherwise
// every brand-new document would open with an error on screen.
{
  const empty = scheduleIssues({ payment: { schedule: [] } }, 'contract');
  has(empty, 'schedule_empty', 'Empty schedule reported');
  eq(empty[0].severity, SEVERITY.WARNING, 'Empty schedule is a warning, not an error');
  ok(empty[0].deliveryBlocking, 'Empty schedule still blocks delivery');
  ok(validatePayload({ payment: { schedule: [] } }, 'contract').ok,
    'A fresh draft with no schedule is not "invalid"');
  ok(!preflight({ template: 'contract', payload: contract({ payment: { total_cents: 6500000, schedule: [] } }) }, 'send', { strict: true }).ok,
    'A contract with no schedule cannot be sent');
}
// Row-level validity
{
  const bad = scheduleIssues({ payment: { schedule: [{ milestone: 'Deposit', percent: 150 }, { milestone: '', percent: -50 }] } }, 'contract');
  has(bad, 'schedule_row_invalid', 'Out-of-range row percent flagged');
  has(bad, 'schedule_row_unnamed', 'Unnamed milestone flagged');
  ok(bad.filter((i) => i.code === 'schedule_row_invalid').length === 2, 'Both invalid rows flagged');
}
eq(scheduleIssues({ payment: { schedule: CANONICAL } }, 'invoice').length, 0,
  'Schedule rules do not apply to invoices');

// ── labor + materials reconciliation ─────────────────────────
{
  eq(laborMaterialsDrift({ labor_cost_cents: 4550000, materials_cost_cents: 1950000, total_cents: 6500000 }), 0,
    'Exact split has zero drift');
  eq(laborMaterialsDrift({ labor_cost_cents: 0, materials_cost_cents: 0, total_cents: 6500000 }), 0,
    'Unsplit total is not treated as drift');
  eq(laborMaterialsDrift({ labor_cost_cents: 1, materials_cost_cents: 1, total_cents: 0 }), 0,
    'Zero total is not treated as drift');

  const clean = moneyIssues({ payment: { labor_cost_cents: 4550000, materials_cost_cents: 1949950, total_cents: 6500000 } }, 'contract');
  lacks(clean, 'labor_materials_mismatch', 'Sub-dollar rounding is tolerated');

  const drifted = moneyIssues({ payment: { labor_cost_cents: 4550000, materials_cost_cents: 1000000, total_cents: 6500000 } }, 'contract');
  has(drifted, 'labor_materials_mismatch', 'Labor + materials != total is flagged');
  ok(/\$9,500/.test(drifted[0]?.message), 'Mismatch message names the dollar gap', drifted[0]?.message);
  ok(!!drifted[0]?.deliveryBlocking, 'Mismatch blocks delivery even though it is a warning while editing');

  ok(Math.abs(MONEY_TOLERANCE_CENTS) === 100, 'Money tolerance is one dollar');
  lacks(moneyIssues({ payment: { labor_cost_cents: 100, materials_cost_cents: 0, total_cents: 200 } }, 'contract'),
    'labor_materials_mismatch', 'Exactly at tolerance is accepted');

  has(moneyIssues({ payment: { total_cents: -1 } }, 'contract'), 'total_negative', 'Negative contract total rejected');
  has(moneyIssues({ totals: { subtotal_cents: 1000, tax_cents: 100, total_due_cents: 5000 } }, 'invoice'),
    'invoice_total_mismatch', 'Invoice subtotal + tax must equal amount due');
  lacks(moneyIssues({ totals: { subtotal_cents: 1000, tax_cents: 100, total_due_cents: 1100 } }, 'invoice'),
    'invoice_total_mismatch', 'Correct invoice arithmetic accepted');
}

// ── required-field preflight names the field ─────────────────
{
  const cases = [
    ['homeowner.name', "the homeowner's name", { homeowner: { name: '', address: 'x' } }],
    ['homeowner.address', 'the property address', { homeowner: { name: 'x', address: '  ' } }],
    ['payment.total_cents', 'the contract total', { payment: { total_cents: 0, schedule: CANONICAL } }],
    ['timeline.start_date', 'a start date', { timeline: { start_date: '' } }],
  ];
  for (const [field, label, over] of cases) {
    const p = contract(over);
    const issues = requiredFieldIssues(p, 'contract');
    const hit = issues.find((i) => i.field === field);
    ok(!!hit, `Missing ${field} is detected`);
    ok(hit && hit.message.includes(label), `Message names "${label}" in plain English`, hit?.message);
    const pre = preflight({ template: 'contract', payload: p }, 'email', { recipient: 'a@b.com' });
    ok(pre.blocked, `Email is blocked when ${field} is missing`);
    ok(pre.summary && pre.summary.includes(label), `Block summary names "${label}"`, pre.summary);
  }
  eq(requiredFieldIssues(contract(), 'contract').length, 0, 'Complete contract has no missing fields');

  for (const [field, over] of [
    ['bill_to.client_name', { bill_to: { client_name: '', property_address: 'x' } }],
    ['bill_to.property_address', { bill_to: { client_name: 'x', property_address: '' } }],
    ['totals.total_due_cents', { totals: { subtotal_cents: 0, tax_cents: 0, total_due_cents: 0 } }],
    ['milestone_label', { milestone_label: '' }],
  ]) {
    const issues = requiredFieldIssues(invoice(over), 'invoice');
    ok(issues.some((i) => i.field === field), `Invoice missing ${field} is detected`,
      `got [${issues.map((i) => i.field).join(', ')}]`);
  }
  eq(requiredFieldIssues(invoice(), 'invoice').length, 0, 'Complete invoice has no missing fields');
}

// A total of zero must count as missing, not as "present and equal to zero".
ok(requiredFieldIssues(contract({ payment: { total_cents: 0, schedule: CANONICAL } }), 'contract')
  .some((i) => i.field === 'payment.total_cents'), 'A $0 total counts as missing');

// ── email needs somewhere to send ────────────────────────────
{
  const p = contract({ homeowner: { name: 'Jane', address: '12 Elm St', email: '', phone: '' } });
  const noRecipient = preflight({ template: 'contract', payload: p }, 'email');
  has(noRecipient.blocking, 'missing_recipient', 'Email with no recipient is blocked');
  const override = preflight({ template: 'contract', payload: p }, 'email', { recipient: 'someone@else.com' });
  lacks(override.blocking, 'missing_recipient', 'An explicit recipient satisfies the check');
  const fromDoc = preflight({ template: 'contract', payload: p, client_email: 'row@doc.com' }, 'email');
  lacks(fromDoc.blocking, 'missing_recipient', 'The document row email satisfies the check');
}

// ── PDF preview stays usable; strict PDF does not ────────────
// Blocking PDF generation on an incomplete draft would break the Preview and PDF tabs for
// exactly the documents still being written.
{
  const halfDone = contract({ homeowner: { name: '', address: '', email: '', phone: '' }, timeline: { start_date: '' } });
  const preview = preflight({ template: 'contract', payload: halfDone }, 'pdf');
  ok(preview.ok, 'A draft PDF preview is not blocked');
  ok(preview.issues.length > 0, '...but the problems are still reported to the caller');
  eq(preview.strict, false, 'Preview is non-strict');

  const strict = preflight({ template: 'contract', payload: halfDone }, 'pdf', { strict: true });
  ok(strict.blocked, 'A strict PDF request IS blocked');
  ok(strict.summary.includes("the homeowner's name"), 'Strict block names the missing field', strict.summary);
}

// ── guarded statuses need confirmation ───────────────────────
{
  eq(GUARDED_WRITE_STATUSES.join(','), [...GUARDED_DOC_STATUSES].sort((a, b) => GUARDED_WRITE_STATUSES.indexOf(a) - GUARDED_WRITE_STATUSES.indexOf(b)).join(','),
    'Write-guarded statuses match the delete-guarded set');
  ok(GUARDED_WRITE_STATUSES.length === GUARDED_DOC_STATUSES.length &&
     GUARDED_WRITE_STATUSES.every((s) => GUARDED_DOC_STATUSES.includes(s)),
    'Guarded status sets are identical, so "which documents are protected" has one answer');

  for (const status of GUARDED_WRITE_STATUSES) {
    const g = writeGuard({ status, confirmed: false });
    ok(!!g, `Writing to a ${status} document requires confirmation`);
    eq(g?.code, 'confirmation_required', `...with code confirmation_required (${status})`);
    ok(!!g?.message?.includes(status), `...and the message names the status (${status})`);
    ok(!writeGuard({ status, confirmed: true }), `Confirmed write to ${status} proceeds`);
    ok(!writeGuard({ status, confirmed: false, hasPayloadChange: false }),
      `A no-op write to ${status} needs no confirmation`);
  }
  for (const status of ['draft', 'void']) {
    ok(!writeGuard({ status, confirmed: false }), `Writing to a ${status} document is unguarded`);
  }
  // The guard applies to the agent identically — the plan's "agent cannot silently edit a
  // signed document" is the same rule, not a second one.
  eq(writeGuard({ status: 'signed', source: 'agent' })?.source, 'agent',
    'The guard records who attempted the write');
}

// ── the "introduced" rule ────────────────────────────────────
// An already-broken document must stay editable, including to fix what is broken.
{
  const good = contract();
  const broken = contract({ payment: { total_cents: 6500000, labor_cost_cents: 4550000, materials_cost_cents: 1950000, schedule: sched(15, 20, 30, 15, 15) } });

  has(introducedIssues(good, broken, 'contract'), 'schedule_unbalanced',
    'Breaking a good schedule is an introduced issue');
  eq(introducedIssues(broken, broken, 'contract').length, 0,
    'Leaving an existing problem alone introduces nothing');
  eq(introducedIssues(broken, good, 'contract').length, 0,
    'Fixing a problem introduces nothing');

  // Editing an unrelated clause on an already-broken document must stay allowed.
  const brokenEdited = JSON.parse(JSON.stringify(broken));
  brokenEdited.warranties.text = 'Revised warranty language.';
  eq(introducedIssues(broken, brokenEdited, 'contract').length, 0,
    'Editing an unrelated clause on a broken document is not blocked');

  // ...but making it worse is caught even though it was already broken.
  const worse = JSON.parse(JSON.stringify(broken));
  worse.payment.materials_cost_cents = 10;
  has(introducedIssues(broken, worse, 'contract'), 'labor_materials_mismatch',
    'A second, different problem is still caught on an already-broken document');
}

// ── status transitions ───────────────────────────────────────
{
  ok(!statusTransitionGuard({ from: 'draft', to: 'sent', payload: contract(), template: 'contract' }),
    'A complete contract can be marked sent');
  const g = statusTransitionGuard({
    from: 'draft', to: 'sent', template: 'contract',
    payload: contract({ payment: { total_cents: 6500000, labor_cost_cents: 4550000, materials_cost_cents: 1950000, schedule: sched(15, 20, 30, 15, 15) } }),
  });
  ok(!!g, 'A 95% schedule blocks the transition to sent');
  eq(g?.code, 'validation_failed', '...with code validation_failed');
  ok(!!g?.message?.includes('95%'), '...naming the actual sum', g?.message);
  ok(!statusTransitionGuard({ from: 'draft', to: 'void', payload: contract({ payment: { total_cents: 0, schedule: [] } }), template: 'contract' }),
    'Voiding an incomplete document is always allowed');
  ok(!statusTransitionGuard({ from: 'sent', to: 'sent', payload: contract(), template: 'contract' }),
    'A no-op transition is not guarded');
  ok(!statusTransitionGuard({ from: 'draft', to: 'draft', payload: contract(), template: 'contract' }),
    'Staying a draft is not guarded');
}

// ── client copy of the arithmetic must not drift ─────────────
// formMath.js exists so the form can show live feedback without importing server code.
// Two implementations of the same arithmetic is exactly how a UI ends up saying "balanced"
// while the server says otherwise, so prove they agree over random inputs.
{
  let seed = 20260804;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let agree = 0;
  for (let n = 0; n < 2000; n += 1) {
    const rows = Array.from({ length: 1 + Math.floor(rnd() * 6) },
      () => ({ milestone: 'M', percent: Math.round(rnd() * 12000) / 100 }));
    if (scheduleSum(rows) !== fmSum(rows)) { failures.push(`formMath.scheduleSum disagrees on ${JSON.stringify(rows)}`); break; }
    if (scheduleBalanced(rows) !== fmBalanced(rows)) { failures.push(`formMath.scheduleBalanced disagrees on ${JSON.stringify(rows)}`); break; }
    const pay = {
      labor_cost_cents: Math.floor(rnd() * 8000000),
      materials_cost_cents: Math.floor(rnd() * 4000000),
      total_cents: rnd() < 0.15 ? 0 : Math.floor(rnd() * 12000000),
    };
    if (laborMaterialsDrift(pay) !== fmDrift(pay)) { failures.push(`formMath.laborMaterialsDrift disagrees on ${JSON.stringify(pay)}`); break; }
    agree += 1;
  }
  ok(agree === 2000, 'Client and server arithmetic agree across 2000 randomized payloads', `agreed on ${agree}`);
  // Any exact 2dp partition of 100 must be called balanced, however it is split. Built in
  // integer hundredths so the partition is exact by construction and the test is checking
  // the implementation rather than its own rounding.
  let partitionsOk = 0;
  for (let n = 0; n < 500; n += 1) {
    const k = 2 + Math.floor(rnd() * 5);
    const cuts = Array.from({ length: k - 1 }, () => Math.floor(rnd() * 10001)).sort((a, b) => a - b);
    const parts = [];
    let prev = 0;
    for (const c of [...cuts, 10000]) { parts.push((c - prev) / 100); prev = c; }
    const rows = parts.map((p, i) => ({ milestone: `M${i}`, percent: p }));
    if (!scheduleBalanced(rows) || !fmBalanced(rows)) {
      failures.push(`A partition of 100 was called unbalanced: ${parts.join('+')} = ${scheduleSum(rows)}`);
      break;
    }
    partitionsOk += 1;
  }
  ok(partitionsOk === 500, 'Every one of 500 random 2dp partitions of 100 is balanced, client and server',
    `passed ${partitionsOk}`);

  // The row-splitting inconsistency that motivated integer arithmetic, asserted directly.
  for (const [a, b] of [[[99.99], [50, 49.99]], [[100.01], [50, 50.01]], [[100], [50, 50]]]) {
    eq(scheduleBalanced(sched(...a)), scheduleBalanced(sched(...b)),
      `Verdict is independent of row layout: ${a.join('+')} vs ${b.join('+')}`);
    eq(scheduleSum(sched(...a)), scheduleSum(sched(...b)),
      `Reported sum is independent of row layout: ${a.join('+')} vs ${b.join('+')}`);
  }
  eq(scheduleSum(sched(50, 49.99)), 99.99, 'Split rows report an exact sum, not 99.99000000000001');
}

// ── report ───────────────────────────────────────────────────
for (const f of failures) console.error(`FAIL  ${f}`);
console.log(`\ntest-guardrails: PASS ${pass} FAIL ${failures.length}`);
process.exit(failures.length === 0 ? 0 : 1);
