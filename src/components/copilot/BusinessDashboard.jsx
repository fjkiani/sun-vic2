// BusinessDashboard — the 360 view of the whole business, not one project.
//
// The previous version showed five numbers you could not click. "Needs review 13" told you a
// count and then stranded you: no way to see which thirteen, no way to find out why, no way to
// act. A number you cannot open is decoration.
//
// So every tile here drills through to the actual documents behind it, the open tile lives in
// the URL so the view can be linked and survives a reload, and the headline says the thing
// that actually matters in words rather than making you infer it from tiles.
//
// The number that matters is not "13 drafts". It is "13 of these cannot be sent", which is a
// different and much worse fact. It comes from the same preflight() the send endpoint runs, so
// this count and what happens when you press Send cannot disagree.
//
// Charts are hand-rolled SVG on a viewBox so they scale to a 390px phone. The repo has
// no charting dependency and this is not worth adding one for.

import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { docHref } from '../../lib/slugs.js';

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

const TONE = {
  neutral: 'text-neutral-900',
  green: 'text-emerald-700',
  amber: 'text-amber-700',
  blue: 'text-blue-700',
  red: 'text-red-700',
};

/**
 * A metric tile. Clickable whenever there is something behind it — a tile with an empty set
 * stays inert rather than opening a panel that says "nothing here", which is a worse outcome
 * than the tile simply not reacting.
 */
function Kpi({ id, label, value, sub, tone = 'neutral', count = 0, open, onOpen }) {
  const clickable = count > 0;
  const cls = `rounded-xl border px-3 py-2.5 text-left w-full transition-colors ${
    open ? 'border-sunvic-500 bg-sunvic-50' : 'border-neutral-200 bg-white'
  } ${clickable ? 'hover:border-sunvic-400 cursor-pointer' : 'cursor-default'}`;
  const body = (
    <>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 flex items-center justify-between gap-1">
        <span className="truncate">{label}</span>
        {clickable && <span aria-hidden className="text-neutral-400 flex-shrink-0">{open ? '▴' : '▾'}</span>}
      </div>
      <div className={`font-mono font-bold text-lg leading-tight ${TONE[tone]}`}>{value}</div>
      {sub && <div className="text-[11px] text-neutral-500 mt-0.5">{sub}</div>}
    </>
  );
  if (!clickable) return <div className={cls} data-testid="kpi" data-metric={id} data-count="0">{body}</div>;
  return (
    <button type="button" onClick={() => onOpen(open ? null : id)} className={`${cls} min-h-[44px]`}
      aria-expanded={open} data-testid="kpi" data-metric={id} data-count={String(count)}>
      {body}
    </button>
  );
}

/** The documents behind whichever number was clicked. */
function DrillDown({ title, note, rows, blockersByField }) {
  return (
    <div className="rounded-xl border border-sunvic-300 bg-sunvic-50/40 p-3" data-testid="kpi-drilldown">
      <div className="text-xs font-semibold text-neutral-700 mb-0.5">{title}</div>
      {note && <div className="text-[11px] text-neutral-600 mb-2">{note}</div>}

      {blockersByField && blockersByField.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-1" data-testid="blocker-tally">
          {blockersByField.map(([field, n, label]) => (
            <span key={field} data-testid="blocker-chip" data-field={field}
              className="inline-flex items-center gap-1 rounded-full bg-white border border-neutral-300 px-2 py-0.5 text-[11px] text-neutral-700">
              {label}<span className="font-mono text-neutral-500">×{n}</span>
            </span>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        {rows.map((d) => (
          <Link key={d.id} to={docHref(d)} data-testid="drilldown-row" data-doc={d.doc_number}
            className="flex items-start gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 min-h-[44px] hover:border-sunvic-400">
            <span className="flex-1 min-w-0">
              <span className="block truncate text-sm text-neutral-800">
                <span className="font-mono text-[12px] text-sunvic-700">{d.doc_number}</span>
                <span className="text-neutral-400"> · </span>
                {d.client_name || 'No client name'}
              </span>
              {d.why && <span className="block truncate text-[11px] text-amber-700 mt-0.5">{d.why}</span>}
            </span>
            <span className="font-mono text-xs text-neutral-600 flex-shrink-0 pt-0.5">{fmtUSD(d.total_cents, true)}</span>
          </Link>
        ))}
      </div>
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
  const [params, setParams] = useSearchParams();
  const openMetric = params.get('metric');
  const setOpenMetric = (m) => setParams((p) => {
    const n = new URLSearchParams(p);
    if (m) n.set('metric', m); else n.delete('metric');
    return n;
  }, { replace: true });

  const { data: docData, isLoading: docLoading } = useQuery({
    queryKey: ['documents', 'dashboard'],
    // readiness=1 makes the server run the real send preflight per document. Without it the
    // "can't send" number would have to be guessed from the list columns, and a guessed
    // number on a dashboard is worse than no number.
    queryFn: () => api.listDocuments({ readiness: 1 }),
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
    const paid = invoices.filter((i) => i.status === 'paid');
    const collected = paid.reduce((a, i) => a + (Number(i.total_cents) || 0), 0);
    const billedSet = invoices.filter((i) => ['sent', 'signed', 'overdue', 'paid'].includes(i.status));
    const billed = billedSet.reduce((a, i) => a + (Number(i.total_cents) || 0), 0);
    const unpaid = billedSet.filter((i) => i.status !== 'paid');
    const outstanding = Math.max(0, billed - collected);
    const needsReview = docs.filter((d) => d.status === 'draft');

    // Readiness is absent on older cached responses; treat unknown as "not counted" rather
    // than as ready, so the tile can never under-report a problem.
    const rated = docs.filter((d) => d.readiness);
    const blocked = rated.filter((d) => !d.readiness.ok).map((d) => ({
      ...d,
      why: d.readiness.summary || (d.readiness.blockers || []).map((b) => b.label).join(', '),
    }));

    // Keyed by code AND field, because neither alone is unique. `required_field_missing` is
    // shared by every mandatory field, so keying by code alone labels forty-odd different
    // problems with whichever message arrived first. And an empty schedule and a schedule
    // summing to 80% are both `payment.schedule` but need opposite fixes, so keying by field
    // alone hides the only part that says what to do.
    const tally = {};
    for (const d of blocked) {
      for (const b of d.readiness.blockers || []) {
        const k = `${b.code || ''}::${b.field || ''}`;
        tally[k] = tally[k] || { n: 0, label: b.label || b.field || b.code };
        tally[k].n++;
      }
    }
    // Contracts store the property address at homeowner.address and invoices at
    // bill_to.property_address, so the tally legitimately produces two chips reading exactly
    // "the property address". Two identical chips with different numbers looks like a bug and
    // reads as one. They say the same thing, so they count as one thing.
    const merged = {};
    for (const [k, v] of Object.entries(tally)) {
      const m = merged[v.label] || (merged[v.label] = { n: 0, field: k.split('::')[1] || k });
      m.n += v.n;
    }
    const blockersByField = Object.entries(merged)
      .map(([label, v]) => [v.field, v.n, label])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const byMonth = {};
    for (const c of live) {
      const k = monthKey(c.created_at);
      if (!k) continue;
      byMonth[k] = byMonth[k] || { month: k, contracted: 0, collected: 0 };
      byMonth[k].contracted += Number(c.total_cents) || 0;
    }
    for (const i of paid) {
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
      live, paid, unpaid, rated, blocked, blockersByField,
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

  const PANELS = {
    contracted: {
      title: 'Every live contract',
      note: `${stats.live.length} contract${stats.live.length === 1 ? '' : 's'} totalling ${fmtUSD(stats.contracted)}.`,
      rows: stats.live,
    },
    collected: {
      title: 'Invoices marked paid',
      note: stats.paid.length ? null : 'Nothing has been marked paid yet.',
      rows: stats.paid,
    },
    outstanding: {
      title: 'Billed but not paid',
      note: `${fmtUSD(stats.outstanding)} across ${stats.unpaid.length} invoice${stats.unpaid.length === 1 ? '' : 's'}.`,
      rows: stats.unpaid,
    },
    review: {
      title: 'Still in draft',
      note: 'Nobody has seen these yet.',
      rows: stats.needsReview,
    },
    blocked: {
      title: 'Cannot be sent yet',
      note: 'Each of these would be refused by the send check. The tags below are what is missing, most common first.',
      rows: stats.blocked,
      blockersByField: stats.blockersByField,
    },
  };
  const panel = openMetric && PANELS[openMetric];

  return (
    <div className="space-y-4">
      {/* The headline in words. A number nobody can parse at a glance is not information. */}
      {stats.rated.length > 0 && (
        <div className="text-sm text-neutral-700" data-testid="dashboard-headline"
          data-blocked={String(stats.blocked.length)} data-rated={String(stats.rated.length)}>
          {stats.blocked.length === 0 ? (
            <>All <strong>{stats.rated.length}</strong> of your documents are ready to send.</>
          ) : (
            <>
              <strong>{stats.blocked.length}</strong> of your <strong>{stats.rated.length}</strong> documents
              {' '}can’t be sent yet.{' '}
              <button type="button" onClick={() => setOpenMetric('blocked')}
                className="text-sunvic-700 underline underline-offset-2" data-testid="headline-drill">
                See what’s missing
              </button>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Kpi id="contracted" label="Contracted" value={fmtUSD(stats.contracted)}
          sub={`${stats.activeProjects} project${stats.activeProjects === 1 ? '' : 's'}`}
          count={stats.live.length} open={openMetric === 'contracted'} onOpen={setOpenMetric} />
        <Kpi id="collected" label="Collected" value={fmtUSD(stats.collected)} tone="green"
          count={stats.paid.length} open={openMetric === 'collected'} onOpen={setOpenMetric} />
        <Kpi id="outstanding" label="Outstanding" value={fmtUSD(stats.outstanding)}
          tone={stats.outstanding > 0 ? 'amber' : 'neutral'}
          count={stats.unpaid.length} open={openMetric === 'outstanding'} onOpen={setOpenMetric} />
        <Kpi id="review" label="Needs review" value={String(stats.needsReview.length)}
          tone={stats.needsReview.length > 0 ? 'blue' : 'neutral'} sub="drafts open"
          count={stats.needsReview.length} open={openMetric === 'review'} onOpen={setOpenMetric} />
        {stats.rated.length > 0 && (
          <div className="col-span-2">
            <Kpi id="blocked" label="Can’t send" value={`${stats.blocked.length} of ${stats.rated.length}`}
              tone={stats.blocked.length > 0 ? 'red' : 'green'}
              sub={stats.blocked.length ? 'missing required details' : 'everything is ready'}
              count={stats.blocked.length} open={openMetric === 'blocked'} onOpen={setOpenMetric} />
          </div>
        )}
      </div>

      {panel && <DrillDown {...panel} />}

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
    </div>
  );
}

export default BusinessDashboard;
