// Arithmetic used by the document forms, kept free of React so it can be executed
// directly by node in a test rather than only exercised through a browser.

export function scheduleSum(schedule) {
  return (schedule || []).reduce((a, r) => a + (Number(r.percent) || 0), 0);
}

export function scheduleBalanced(schedule) {
  return Math.abs(scheduleSum(schedule) - 100) < 0.01;
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
