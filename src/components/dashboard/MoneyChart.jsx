// MoneyChart — SVG bar chart of billed vs paid by month.
// No chart library — thin SVG bars, minimal axis labels.

import React, { useMemo } from 'react';

function fmtUSD(cents) {
  return ((Number(cents) || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function MoneyChart({ series = [], money = null }) {
  const m = money || {};
  const width = 640;
  const height = 220;
  const margin = { top: 20, right: 20, bottom: 40, left: 60 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const chart = useMemo(() => {
    if (series.length === 0) {
      return { max: 0, months: [], bars: [] };
    }
    const max = Math.max(
      1,
      ...series.map((s) => Math.max(s.billed_cents || 0, s.paid_cents || 0))
    );
    const bandW = innerW / series.length;
    const barW = Math.min(24, bandW * 0.35);
    const gap = 4;
    const bars = series.map((s, i) => {
      const x = margin.left + i * bandW + bandW / 2;
      const billedH = ((s.billed_cents || 0) / max) * innerH;
      const paidH = ((s.paid_cents || 0) / max) * innerH;
      return {
        x, month: s.month,
        billed: {
          x: x - barW - gap / 2,
          y: margin.top + innerH - billedH,
          w: barW,
          h: billedH,
          value: s.billed_cents,
        },
        paid: {
          x: x + gap / 2,
          y: margin.top + innerH - paidH,
          w: barW,
          h: paidH,
          value: s.paid_cents,
        },
      };
    });
    return { max, months: series.map((s) => s.month), bars };
  }, [series, innerW, innerH, margin.left, margin.top]);

  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => (chart.max / yTicks) * i);

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
        <div className="text-xs font-semibold text-neutral-500 uppercase">Money In / Out</div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-blue-500 rounded-sm" /> Billed
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-green-500 rounded-sm" /> Paid
          </span>
        </div>
      </div>
      <div className="p-4">
        {/* Summary row */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <SummaryStat label="Billed" value={fmtUSD(m.billed_cents)} tone="blue" />
          <SummaryStat label="Paid" value={fmtUSD(m.paid_cents)} tone="green" />
          <SummaryStat label="Outstanding" value={fmtUSD(m.outstanding_cents)} tone="amber" />
        </div>
        {series.length === 0 ? (
          <div className="border-2 border-dashed border-neutral-300 rounded p-8 text-center text-xs text-neutral-500">
            No invoice activity yet — send an invoice to see it plotted here.
          </div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Billed vs paid by month">
            {/* Y grid + labels */}
            {yTickValues.map((v, i) => {
              const y = margin.top + innerH - (v / (chart.max || 1)) * innerH;
              return (
                <g key={i}>
                  <line x1={margin.left} x2={width - margin.right} y1={y} y2={y} stroke="#e5e5e5" strokeWidth="1" />
                  <text x={margin.left - 6} y={y + 3} textAnchor="end" className="fill-neutral-500" style={{ fontSize: 10 }}>
                    {fmtUSD(v)}
                  </text>
                </g>
              );
            })}
            {/* Bars */}
            {chart.bars.map((b, i) => (
              <g key={i}>
                {b.billed.h > 0 && (
                  <rect x={b.billed.x} y={b.billed.y} width={b.billed.w} height={b.billed.h} fill="#3b82f6">
                    <title>Billed {b.month}: {fmtUSD(b.billed.value)}</title>
                  </rect>
                )}
                {b.paid.h > 0 && (
                  <rect x={b.paid.x} y={b.paid.y} width={b.paid.w} height={b.paid.h} fill="#22c55e">
                    <title>Paid {b.month}: {fmtUSD(b.paid.value)}</title>
                  </rect>
                )}
                <text x={b.x} y={margin.top + innerH + 14} textAnchor="middle" className="fill-neutral-700" style={{ fontSize: 10 }}>
                  {b.month}
                </text>
              </g>
            ))}
            {/* X axis line */}
            <line x1={margin.left} x2={width - margin.right} y1={margin.top + innerH} y2={margin.top + innerH} stroke="#a3a3a3" strokeWidth="1" />
          </svg>
        )}
      </div>
    </div>
  );
}

function SummaryStat({ label, value, tone }) {
  const toneMap = {
    blue:  'bg-blue-50 text-blue-900',
    green: 'bg-green-50 text-green-900',
    amber: 'bg-amber-50 text-amber-900',
  };
  return (
    <div className={`rounded-lg p-2 ${toneMap[tone] || 'bg-neutral-100'}`}>
      <div className="text-[10px] uppercase opacity-70">{label}</div>
      <div className="font-mono font-bold text-sm mt-0.5">{value}</div>
    </div>
  );
}

export default MoneyChart;
