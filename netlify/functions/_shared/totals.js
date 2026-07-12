// Compute totals from a document payload.
// Used server-side so the denormalized `documents.total_cents` stays consistent.

function phaseCost(phase) {
  if (phase.manual_phase_cost != null) return Number(phase.manual_phase_cost) || 0;
  return (phase.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
}

export function totalDollarsForInvoice(payload) {
  const phases = (payload?.phases || []).filter((p) => !p.excluded);
  const subtotal = phases.reduce((s, p) => s + phaseCost(p), 0);
  const tax = subtotal * ((Number(payload?.tax_rate_percent) || 0) / 100);
  return { subtotal, tax, total: subtotal + tax };
}

export function totalDollarsForContract(payload) {
  const phases = payload?.scope_of_work?.phases || [];
  const subtotal = phases.filter((p) => !p.excluded).reduce((s, p) => s + phaseCost(p), 0);
  return { subtotal, tax: 0, total: subtotal };
}

export function totalCentsFor(template, payload) {
  const t = template === 'invoice' ? totalDollarsForInvoice(payload) : totalDollarsForContract(payload);
  return Math.round((t.total || 0) * 100);
}
