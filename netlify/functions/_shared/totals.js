// Compute totals from a document payload.
// Used server-side so the denormalized `documents.total_cents` stays consistent.
//
// IMPORTANT (Bugs K + L): this module was previously written against a
// non-existent `phases[]/items[]/rate` data model and RETURNED OBJECTS
// ({subtotal,tax,total}); callers then did `Math.round(obj * 100)` → NaN, and
// contract subtotals were always 0 because `scope_of_work.phases` never exists.
//
// The canonical schema (packages/schema/documents.js) is:
//   Contract: scope_of_work.groups[].tasks[].amount_cents,
//             scope_of_work.total_cents,
//             payment.{labor_cost_cents, materials_cost_cents, total_cents}
//   Invoice:  milestone.subtotal_cents, tax.amount_cents,
//             totals.{subtotal_cents, tax_cents, total_due_cents}
//
// All money is INTEGER CENTS. These helpers now return integer cents directly.

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Sum every task amount across all scope groups (integer cents).
 */
export function sumScopeTaskCents(payload) {
  const groups = payload?.scope_of_work?.groups || [];
  let sum = 0;
  for (const g of groups) {
    for (const t of (g?.tasks || [])) {
      // Prefer explicit amount_cents; fall back to qty*unit_price if amount missing.
      const amt = t?.amount_cents != null
        ? num(t.amount_cents)
        : num(t?.qty) * num(t?.unit_price_cents);
      sum += amt;
    }
  }
  return Math.round(sum);
}

/**
 * Total contract value in integer cents.
 * Authority order: payment.total_cents → scope_of_work.total_cents → sum of tasks.
 */
export function totalCentsForContract(payload) {
  const paymentTotal = num(payload?.payment?.total_cents);
  if (paymentTotal > 0) return Math.round(paymentTotal);
  const scopeTotal = num(payload?.scope_of_work?.total_cents);
  if (scopeTotal > 0) return Math.round(scopeTotal);
  return sumScopeTaskCents(payload);
}

/**
 * Total amount DUE on an invoice in integer cents.
 * Authority order: totals.total_due_cents → recompute (subtotal + tax).
 */
export function totalCentsForInvoice(payload) {
  const due = num(payload?.totals?.total_due_cents);
  if (due > 0) return Math.round(due);
  // Recompute from milestone subtotal + tax amount.
  const subtotal = num(payload?.totals?.subtotal_cents) || num(payload?.milestone?.subtotal_cents);
  const tax = num(payload?.totals?.tax_cents) || num(payload?.tax?.amount_cents);
  return Math.round(subtotal + tax);
}

/**
 * Unified entry point — returns INTEGER CENTS for either template.
 * (Replaces the old object-returning version. Callers must NOT multiply by 100.)
 */
export function totalCentsFor(template, payload) {
  return template === 'invoice'
    ? totalCentsForInvoice(payload)
    : totalCentsForContract(payload);
}

// ────────────────────────────────────────────────────────────
// Back-compat DOLLAR helpers.
// Some legacy call sites may still import the *Dollars names. They now return a
// SCALAR number of dollars (not an object), so any lingering `x * 100` produces
// the correct cents rather than NaN. Prefer the *Cents helpers above.
// ────────────────────────────────────────────────────────────
export function totalDollarsForInvoice(payload) {
  return totalCentsForInvoice(payload) / 100;
}
export function totalDollarsForContract(payload) {
  return totalCentsForContract(payload) / 100;
}
