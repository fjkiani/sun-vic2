// Formatting helpers used by both PDF renderers and browser preview.

export function fmtUSD(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function fmtUSDFromCents(cents) {
  return fmtUSD((Number(cents) || 0) / 100);
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function fmtDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Contract totals (new schema) ───────────────────────────────
export function contractTotals(contract) {
  const labor  = Number(contract?.payment?.labor_cost_cents) || 0;
  const mats   = Number(contract?.payment?.materials_cost_cents) || 0;
  const total  = Number(contract?.payment?.total_cents) || labor + mats;
  return {
    labor_cents: labor,
    materials_cents: mats,
    total_cents: total || labor + mats,
  };
}

export function milestoneAmountCents(totalCents, percent) {
  return Math.round((Number(totalCents) || 0) * (Number(percent) || 0) / 100);
}

// ── Invoice totals ─────────────────────────────────────────────
export function invoiceTotals(inv) {
  const subtotalCents =
    Number(inv?.milestone?.subtotal_cents) ||
    (inv?.line_items || []).reduce((s, li) => s + (Number(li.amount_cents) || 0), 0);

  const rate = Number(inv?.tax?.rate_percent) || 0;
  const applies = inv?.tax?.applies_to || 'none';
  let taxBase = 0;
  if (applies === 'total') taxBase = subtotalCents;
  else if (applies === 'materials_only') taxBase = Number(inv?.milestone?.materials_portion_cents) || 0;

  const taxCents = Math.round(taxBase * rate / 100);
  const totalDueCents = subtotalCents + taxCents;

  const priorCents = (inv?.prior_payments || []).reduce((s, p) => s + (Number(p.amount_cents) || 0), 0);
  const contractTotal = Number(inv?.contract?.total_cents) || 0;
  const remainingCents = Math.max(0, contractTotal - priorCents - subtotalCents);

  return {
    subtotal_cents: subtotalCents,
    tax_cents: taxCents,
    total_due_cents: totalDueCents,
    prior_cents: priorCents,
    remaining_after_cents: remainingCents,
  };
}
