// BusinessDashboard — the 360 view of the whole business, not one project.
//
// The copilot home was a prompt box, four suggestion cards and a flat list of recent
// documents. That answers "what did I touch last", never "how is the business doing".
// This panel answers the second question from the documents and projects the user
// already has: nothing here is synthesised, and when there is no data it says so once
// instead of rendering an empty tile per metric.
//
// Charts are hand-rolled SVG on a viewBox so they scale to a 390px phone. The repo has
// no charting dependency and this is not worth adding one for.

import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';

function fmtUSD(cents, compact = false) {
  const n = (Number(cents) || 0) / 100;
  if (compact && Math.abs(n) >= 1000) {
    return '$' + (n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'k';
  }
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function monthKey(iso) {
  return String(iso || '').slice(0, 7);
}
function monthLabel(key) {
  const [y, m] = key.split('-');
  if (!y || !m) return key;
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'short' });
}

function Kpi({ label, value, sub, tone = 'neutral' }) {
  const toneCls = {
    neutral: 'text-neutral-900',
    green: 'text-emerald-700',
    amber: 'text-amber-700',
    blue: 'text-blue-700',
  }[tone];
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`font-mono font-bold text-lg leading-tight ${toneCls}`}>{value}</div>
      {sub && <div className="text-[11px] text-neutral-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// Grouped bar chart: contracted vs collected by month.
function MonthlyBars({ rows }) {
  const W = 320, H = 132;
  const pad = { t: 8, r: 4, b: 18, l: 4 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.contracted, r.collected)));
  const band = innerW / Math.max(1, rows.length);
  const bw = Math.min(14, band * 0.32);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
      aria-label={`Contracted versus collected across ${rows.length} months`}>
      {[0.5, 1].map((f) => (
        <line key={f} x1={pad.l} x2={W - pad.r} y1={pad.t + innerH * (1 - f)} y2={pad.t + innerH * (1 - f)}
          stroke="#e5e5e5" strokeWidth="1" />
      ))}
      {rows.map((r, i) => {
        const cx = pad.l + i * band + band / 2;
        const ch = (r.contracted / max) * innerH;
        const ph = (r.collected / max) * innerH;
        return (
          <g key={r.month}>
            <rect x={cx - bw - 1} y={pad.t + innerH - ch} width={bw} height={ch} rx="2" fill="#0279EE" />
            <rect x={cx + 1} y={pad.t + innerH - ph} width={bw} height={ph} rx="2" fill="#75A025" />
            <text x={cx} y={H - 5} textAnchor="middle" fontSize="9" fill="#737373">{monthLabel(r.month)}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Horizontal funnel: how contracts move draft -> sent -> signed.
function Funnel({ stages }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <div className="space-y-1.5">
      {stages.map((s) => (
        <div key={s.label} className="flex items-center gap-2">
          <div className="w-16 flex-shrink-0 text-[11px] text-neutral-600 capitalize">{s.label}</div>
          <div className="flex-1 h-5 bg-neutral-100 rounded overflow-hidden">
            <div className={`h-full ${s.color} flex items-center justify-end pr-1.5`}
              style={{ width: `${Math.max(s.count > 0 ? 12 : 0, (s.count / max) * 100)}%` }}>
              {s.count > 0 && <span className="text-[10px] font-semibold text-white">{s.count}</span>}
            </div>
          </div>
          <div className="w-14 flex-shrink-0 text-right font-mono text-[11px] text-neutral-700">
            {fmtUSD(s.cents, true)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function BusinessDashboard() {
  const { data: docData, isLoading: docLoading } = useQuery({
    queryKey: ['documents', 'dashboard'],
    queryFn: () => api.listDocuments({}),
  });
  const { data: projData } = useQuery({
    queryKey: ['projects', 'dashboard'],
    queryFn: () => api.listProjects({}),
  });

  const docs = docData?.documents || [];
  const projects = projData?.projects || [];

  const stats = useMemo(() => {
    const contracts = docs.filter((d) => d.template === 'contract');
    const invoices = docs.filter((d) => d.template === 'invoice');
    const live = contracts.filter((c) => c.status !== 'void');

    const contracted = live.reduce((a, c) => a + (Number(c.total_cents) || 0), 0);
    const collected = invoices.filter((i) => i.status === 'paid')
      .reduce((a, i) => a + (Number(i.total_cents) || 0), 0);
    const billed = invoices.filter((i) => ['sent', 'signed', 'overdue', 'paid'].includes(i.status))
      .reduce((a, i) => a + (Number(i.total_cents) || 0), 0);
    const outstanding = Math.max(0, billed - collected);
    const needsReview = docs.filter((d) => d.status === 'draft');

    const byMonth = {};
    for (const c of live) {
      const k = monthKey(c.created_at);
      if (!k) continue;
      byMonth[k] = byMonth[k] || { month: k, contracted: 0, collected: 0 };
      byMonth[k].contracted += Number(c.total_cents) || 0;
    }
    for (const i of invoices.filter((x) => x.status === 'paid')) {
      const k = monthKey(i.updated_at || i.created_at);
      if (!k) continue;
      byMonth[k] = byMonth[k] || { month: k, contracted: 0, collected: 0 };
      byMonth[k].collected += Number(i.total_cents) || 0;
    }
    const rows = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);

    const bucket = (st) => {
      const set = contracts.filter((c) => c.status === st);
      return { count: set.length, cents: set.reduce((a, c) => a + (Number(c.total_cents) || 0), 0) };
    };
    const stages = [
      { label: 'draft', color: 'bg-neutral-400', ...bucket('draft') },
      { label: 'sent', color: 'bg-blue-500', ...bucket('sent') },
      { label: 'signed', color: 'bg-emerald-500', ...bucket('signed') },
    ];

    return {
      contracted, collected, outstanding, needsReview, rows, stages,
      activeProjects: projects.length,
      hasAnyMoney: contracted > 0 || billed > 0,
    };
  }, [docs, projects]);

  if (docLoading) {
    return <div className="text-sm text-neutral-400 py-6 text-center">Loading your numbers…</div>;
  }

  if (docs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center">
        <div className="text-sm font-medium text-neutral-700">No documents yet</div>
        <div className="text-xs text-neutral-500 mt-1">
          Ask the copilot for your first contract and this fills in with real numbers.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Kpi label="Contracted" value={fmtUSD(stats.contracted)} sub={`${stats.activeProjects} project${stats.activeProjects === 1 ? '' : 's'}`} />
        <Kpi label="Collected" value={fmtUSD(stats.collected)} tone="green" />
        <Kpi label="Outstanding" value={fmtUSD(stats.outstanding)} tone={stats.outstanding > 0 ? 'amber' : 'neutral'} />
        <Kpi label="Needs review" value={String(stats.needsReview.length)} tone={stats.needsReview.length > 0 ? 'blue' : 'neutral'} sub="drafts open" />
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-3">
        <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Contract pipeline</div>
        <Funnel stages={stats.stages} />
      </div>

      {stats.rows.length > 0 && stats.hasAnyMoney && (
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Contracted vs collected</div>
            <div className="flex gap-3 text-[10px] text-neutral-500">
              <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm inline-block" style={{ background: '#0279EE' }} />contracted</span>
              <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm inline-block" style={{ background: '#75A025' }} />collected</span>
            </div>
          </div>
          <MonthlyBars rows={stats.rows} />
        </div>
      )}

      {stats.needsReview.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
            Waiting on you
          </div>
          <div className="space-y-1.5">
            {stats.needsReview.slice(0, 4).map((d) => (
              <Link key={d.id} to={`/documents/${d.id}`}
                className="flex items-center gap-2 rounded-lg border border-neutral-200 px-2.5 min-h-[44px] hover:border-sunvic-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                <span className="flex-1 min-w-0 truncate text-sm text-neutral-800">
                  {d.doc_number} <span className="text-neutral-400">· {d.client_name || '—'}</span>
                </span>
                <span className="font-mono text-xs text-neutral-600 flex-shrink-0">{fmtUSD(d.total_cents, true)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default BusinessDashboard;
