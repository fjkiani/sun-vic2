// MoneyStats — the four money tiles, plus a single stacked bar that makes the
// relationship between them legible at a glance.
//
// The old dashboard printed "Contract total / Billed / Paid / Outstanding" as four
// separate numbers with no visual relationship, so on a project with no invoices you
// read "$0.00" four times and learned nothing. The bar answers the only question a
// contractor actually asks here: how much of this job have I collected?

import React from 'react';

function fmtUSD(cents) {
  return ((Number(cents) || 0) / 100).toLocaleString('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  });
}

function Tile({ label, value, tone = 'neutral' }) {
  const toneCls = {
    neutral: 'text-neutral-900',
    green: 'text-emerald-700',
    amber: 'text-amber-700',
    blue: 'text-blue-700',
  }[tone];
  return (
    <div className="rounded-lg bg-white border border-neutral-200 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`font-mono font-bold text-base leading-tight ${toneCls}`}>{value}</div>
    </div>
  );
}

export function MoneyStats({ money, documents = [] }) {
  const m = money || {};
  const total = Number(m.contract_total_cents) || 0;
  const billed = Number(m.billed_cents) || 0;
  const paid = Number(m.paid_cents) || 0;
  const outstanding = Number(m.outstanding_cents) || 0;

  const hasContract = total > 0;
  const paidPct = hasContract ? Math.min(100, (paid / total) * 100) : 0;
  const outPct = hasContract ? Math.min(100 - paidPct, (outstanding / total) * 100) : 0;
  const unbilledPct = Math.max(0, 100 - paidPct - outPct);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Contract" value={fmtUSD(total)} />
        <Tile label="Billed" value={fmtUSD(billed)} tone="blue" />
        <Tile label="Paid" value={fmtUSD(paid)} tone="green" />
        <Tile label="Outstanding" value={fmtUSD(outstanding)} tone={outstanding > 0 ? 'amber' : 'neutral'} />
      </div>

      {hasContract ? (
        <div>
          <div className="flex h-3 rounded-full overflow-hidden bg-neutral-200" role="img"
            aria-label={`${Math.round(paidPct)} percent paid, ${Math.round(outPct)} percent outstanding, ${Math.round(unbilledPct)} percent not yet billed`}>
            {paidPct > 0 && <div className="bg-emerald-500" style={{ width: `${paidPct}%` }} />}
            {outPct > 0 && <div className="bg-amber-400" style={{ width: `${outPct}%` }} />}
            {unbilledPct > 0 && <div className="bg-neutral-300" style={{ width: `${unbilledPct}%` }} />}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[11px] text-neutral-600">
            <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Paid {Math.round(paidPct)}%</span>
            <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Outstanding {Math.round(outPct)}%</span>
            <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-neutral-300 inline-block" />Not yet billed {Math.round(unbilledPct)}%</span>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-neutral-300 px-3 py-3 text-xs text-neutral-500">
          No contract value yet. {documents.length === 0
            ? 'Create a contract for this project and the money view fills in.'
            : 'Set a total on the contract to see collection progress.'}
        </div>
      )}
    </div>
  );
}

export default MoneyStats;
