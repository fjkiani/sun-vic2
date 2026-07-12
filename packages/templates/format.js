// Formatting helpers used by both PDF renderers and browser preview.

export function fmtUSD(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function phaseCost(phase) {
  if (phase?.manual_phase_cost != null) return Number(phase.manual_phase_cost) || 0;
  return (phase?.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
}

export function phaseCostPerSqft(phase) {
  if (phase?.manual_cost_per_sqft != null) return Number(phase.manual_cost_per_sqft) || 0;
  const c = phaseCost(phase);
  return phase?.sqft > 0 ? c / phase.sqft : 0;
}

export function invoiceTotals(inv) {
  const phases = (inv?.phases || []).filter((p) => !p.excluded);
  const subtotal = phases.reduce((s, p) => s + phaseCost(p), 0);
  const tax = subtotal * ((Number(inv?.tax_rate_percent) || 0) / 100);
  return { subtotal, tax, total: subtotal + tax };
}

export function contractTotals(contract) {
  const phases = contract?.scope_of_work?.phases || [];
  const subtotal = phases.filter((p) => !p.excluded).reduce((s, p) => s + phaseCost(p), 0);
  return { subtotal, total: subtotal };
}
