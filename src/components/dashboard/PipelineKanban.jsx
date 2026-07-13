// PipelineKanban — 2-row kanban showing document status for a project.
// Row 1: contracts (draft → sent → signed → void)
// Row 2: invoices  (draft → sent → paid, plus overdue)
// Each card links to its editor.

import React from 'react';
import { Link } from 'react-router-dom';

function fmtUSD(cents) {
  return ((Number(cents) || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

const CONTRACT_LANES = ['draft', 'sent', 'signed', 'void'];
const INVOICE_LANES  = ['draft', 'sent', 'paid', 'overdue'];

function DocCard({ doc }) {
  return (
    <Link
      to={`/documents/${doc.id}`}
      className="block bg-white border border-neutral-200 rounded-md p-2 mb-2 hover:border-sunvic-400 hover:shadow-sm transition text-xs"
    >
      <div className="font-mono text-sunvic-600 text-[10px]">{doc.doc_number}</div>
      <div className="font-semibold truncate">{doc.title || '(untitled)'}</div>
      <div className="font-mono text-neutral-700 mt-0.5">{fmtUSD(doc.total_cents)}</div>
    </Link>
  );
}

function Lane({ title, docs = [], tone = 'neutral' }) {
  const toneMap = {
    neutral: 'bg-neutral-50 border-neutral-200',
    green:   'bg-green-50 border-green-200',
    amber:   'bg-amber-50 border-amber-200',
    red:     'bg-red-50 border-red-200',
  };
  return (
    <div className={`flex-1 min-w-[140px] border rounded-lg p-2 ${toneMap[tone] || toneMap.neutral}`}>
      <div className="text-[10px] uppercase font-semibold text-neutral-600 mb-2 flex items-center justify-between">
        <span>{title}</span>
        <span className="bg-white border border-neutral-300 rounded-full px-1.5 min-w-[1.5rem] text-center">{docs.length}</span>
      </div>
      {docs.length === 0 && <div className="text-[10px] text-neutral-400 text-center py-2">empty</div>}
      {docs.map((d) => <DocCard key={d.id} doc={d} />)}
    </div>
  );
}

export function PipelineKanban({ pipeline }) {
  const laneTone = (kind, name) => {
    if (kind === 'contract' && name === 'signed') return 'green';
    if (kind === 'contract' && name === 'void') return 'red';
    if (kind === 'invoice'  && name === 'paid') return 'green';
    if (kind === 'invoice'  && name === 'overdue') return 'red';
    if (kind === 'invoice'  && name === 'sent') return 'amber';
    return 'neutral';
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200">
        <div className="text-xs font-semibold text-neutral-500 uppercase">Document Pipeline</div>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <div className="text-xs font-semibold text-neutral-700 mb-2">Contracts</div>
          <div className="flex gap-2 overflow-x-auto">
            {CONTRACT_LANES.map((lane) => (
              <Lane
                key={lane}
                title={lane}
                docs={pipeline?.contracts?.[lane] || []}
                tone={laneTone('contract', lane)}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-neutral-700 mb-2">Invoices</div>
          <div className="flex gap-2 overflow-x-auto">
            {INVOICE_LANES.map((lane) => (
              <Lane
                key={lane}
                title={lane}
                docs={pipeline?.invoices?.[lane] || []}
                tone={laneTone('invoice', lane)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PipelineKanban;
