// Arithmetic used by the document forms, kept free of React so it can be executed
// directly by node in a test rather than only exercised through a browser.

// Mirrors packages/validation/guardrails.js so the form can show live feedback without
// pulling server code into the bundle. test-guardrails.mjs cross-asserts the two agree
// over randomized inputs, so this copy cannot drift from the rule the server enforces.
//
// Compared in integer hundredths of a percent, not with a float epsilon: under
// `Math.abs(sum - 100) < 0.01` a single 99.99 row is rejected while 50 + 49.99 — the same
// schedule, the same missing $6.50 — is accepted, because the second spelling lands on
// 99.99000000000001. The verdict must not depend on how the rows are split.
const SCALE = 100;

export function scheduleSumHundredths(schedule) {
  // Round the total, not each row. Row-by-row rounding rejects [33.333, 33.333, 33.334],
  // which is exactly 100. See packages/validation/guardrails.js for the full note.
  const raw = (schedule || []).reduce((a, r) => a + (Number(r?.percent) || 0), 0);
  return Math.round(raw * SCALE);
}

export function scheduleSum(schedule) {
  return scheduleSumHundredths(schedule) / SCALE;
}

export function scheduleBalanced(schedule) {
  return scheduleSumHundredths(schedule) === 100 * SCALE;
}

// Contract: labor + materials should reconcile to the total. Tolerance is one dollar,
// because the composer allocates by weight and rounds each bucket to whole cents.
export function laborMaterialsDrift(payment) {
  const p = payment || {};
  const labor = Number(p.labor_cost_cents) || 0;
  const materials = Number(p.materials_cost_cents) || 0;
  const total = Number(p.total_cents) || 0;
  if (total === 0 || (labor === 0 && materials === 0)) return 0;
  return labor + materials - total;
}

// Invoice money, derived from the pieces the user actually edits. Returns a patch keyed
// by payload path so it can be handed straight to onSave().
export function deriveInvoiceTotals(payload) {
  const p = payload || {};
  const items = p.line_items || [];
  const itemSum = items.reduce((a, li) => a + (Number(li.amount_cents) || 0), 0);
  const subtotal = itemSum > 0 ? itemSum : Number(p.milestone?.subtotal_cents) || 0;

  const appliesTo = p.tax?.applies_to || 'materials_only';
  const rate = Number(p.tax?.rate_percent) || 0;
  const taxable =
    appliesTo === 'total' ? subtotal
    : appliesTo === 'materials_only' ? (Number(p.milestone?.materials_portion_cents) || 0)
    : 0;
  const taxCents = Math.round((taxable * rate) / 100);

  const totalDue = subtotal + taxCents;
  const priorSum = (p.prior_payments || []).reduce((a, r) => a + (Number(r.amount_cents) || 0), 0);
  const contractTotal = Number(p.contract?.total_cents) || 0;
  const remainingAfter = Math.max(0, contractTotal - priorSum - totalDue);

  return {
    'milestone.subtotal_cents': subtotal,
    'tax.amount_cents': taxCents,
    'totals.subtotal_cents': subtotal,
    'totals.tax_cents': taxCents,
    'totals.total_due_cents': totalDue,
    'totals.remaining_after_cents': remainingAfter,
  };
}

// A line item's amount is always qty × rate; the form never lets the two disagree.
export function lineItemAmount(item) {
  return Math.round((Number(item?.qty) || 0) * (Number(item?.rate_cents) || 0));
}
