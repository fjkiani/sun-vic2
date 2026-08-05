// PipelineKanban — document status for a project.
//
// Desktop keeps the lane board. Mobile no longer sideways-scrolls a 4-lane board through
// a 390px window: it collapses to a stage summary strip plus a single flat list, so
// nothing is hidden off-screen and no horizontal scrolling is required.

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatUSD } from '../ui/MoneyInput.jsx';

const CONTRACT_LANES = ['draft', 'sent', 'signed', 'void'];
const INVOICE_LANES  = ['draft', 'sent', 'paid', 'overdue'];

const TONES = {
  neutral: 'bg-neutral-50 border-neutral-200',
  green:   'bg-green-50 border-green-200',
  amber:   'bg-amber-50 border-amber-200',
  red:     'bg-red-50 border-red-200',
};
const CHIP_TONES = {
  neutral: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  green:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber:   'bg-amber-50 text-amber-700 border-amber-200',
  red:     'bg-rose-50 text-rose-700 border-rose-200',
};

function laneTone(kind, name) {
  if (kind === 'contract' && name === 'signed') return 'green';
  if (kind === 'contract' && name === 'void') return 'red';
  if (kind === 'invoice'  && name === 'paid') return 'green';
  if (kind === 'invoice'  && name === 'overdue') return 'red';
  if (kind === 'invoice'  && name === 'sent') return 'amber';
  return 'neutral';
}

function DocCard({ doc, showStage = false }) {
  return (
    <Link
      to={`/documents/${doc.id}`}
      className="block bg-white border border-neutral-200 rounded-lg p-2.5 hover:border-sunvic-400 hover:shadow-sm transition"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sunvic-600 text-[11px]">{doc.doc_number}</span>
        {showStage && (
          <span className="text-[10px] uppercase font-semibold text-neutral-400">{doc.status}</span>
        )}
      </div>
      <div className="font-semibold truncate text-sm">{doc.title || '(untitled)'}</div>
      <div className="font-mono text-neutral-700 text-xs mt-0.5">{formatUSD(doc.total_cents)}</div>
    </Link>
  );
}

function Lane({ title, docs = [], tone = 'neutral' }) {
  return (
    <div className={`flex-1 min-w-[140px] border rounded-lg p-2 ${TONES[tone] || TONES.neutral}`}>
      <div className="text-[10px] uppercase font-semibold text-neutral-600 mb-2 flex items-center justify-between">
        <span>{title}</span>
        <span className="bg-white border border-neutral-300 rounded-full px-1.5 min-w-[1.5rem] text-center">{docs.length}</span>
      </div>
      {docs.length === 0 && <div className="text-[10px] text-neutral-400 text-center py-2">empty</div>}
      <div className="space-y-2">
        {docs.map((d) => <DocCard key={d.id} doc={d} />)}
      </div>
    </div>
  );
}

// Mobile: stage counts as tappable filter chips over one flat list.
function MobileGroup({ kind, lanes, byLane }) {
  const [filter, setFilter] = useState(null);
  const all = useMemo(
    () => lanes.flatMap((l) => (byLane?.[l] || []).map((d) => ({ ...d, _lane: l }))),
    [lanes, byLane],
  );
  const shown = filter ? all.filter((d) => d._lane === filter) : all;

  return (
    <div>
      <div className="text-xs font-semibold text-neutral-700 mb-2 capitalize">{kind}s</div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        <button
          onClick={() => setFilter(null)}
          className={`min-h-[32px] px-2.5 rounded-full text-[11px] font-semibold border ${
            filter === null ? 'bg-sunvic-500 text-white border-sunvic-500' : 'bg-white text-neutral-600 border-neutral-300'
          }`}
        >
          All {all.length}
        </button>
        {lanes.map((l) => {
          const n = (byLane?.[l] || []).length;
          const active = filter === l;
          return (
            <button
              key={l}
              onClick={() => setFilter(active ? null : l)}
              disabled={n === 0}
              className={`min-h-[32px] px-2.5 rounded-full text-[11px] font-semibold border capitalize disabled:opacity-40 ${
                active ? 'bg-sunvic-500 text-white border-sunvic-500' : CHIP_TONES[laneTone(kind, l)]
              }`}
            >
              {l} {n}
            </button>
          );
        })}
      </div>
      {shown.length === 0 ? (
        <div className="text-[11px] text-neutral-400 text-center py-3 border border-dashed border-neutral-200 rounded-lg">
          No {kind}s {filter ? `in ${filter}` : 'yet'}
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((d) => <DocCard key={d.id} doc={d} showStage />)}
        </div>
      )}
    </div>
  );
}

export function PipelineKanban({ pipeline }) {
  const p = pipeline || { contracts: {}, invoices: {} };

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200">
        <div className="text-xs font-semibold text-neutral-500 uppercase">Document Pipeline</div>
      </div>

      {/* Mobile: no horizontal scroll */}
      <div className="md:hidden p-3 space-y-5">
        <MobileGroup kind="contract" lanes={CONTRACT_LANES} byLane={p?.contracts} />
        <MobileGroup kind="invoice"  lanes={INVOICE_LANES}  byLane={p?.invoices} />
      </div>

      {/* Desktop: lane board */}
      <div className="hidden md:block p-4 space-y-4">
        <div>
          <div className="text-xs font-semibold text-neutral-700 mb-2">Contracts</div>
          <div className="flex gap-2">
            {CONTRACT_LANES.map((lane) => (
              <Lane key={lane} title={lane} docs={p?.contracts?.[lane] || []} tone={laneTone('contract', lane)} />
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-neutral-700 mb-2">Invoices</div>
          <div className="flex gap-2">
            {INVOICE_LANES.map((lane) => (
              <Lane key={lane} title={lane} docs={p?.invoices?.[lane] || []} tone={laneTone('invoice', lane)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PipelineKanban;
