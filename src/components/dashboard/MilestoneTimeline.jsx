// MilestoneTimeline — vertical timeline showing each contract milestone
// and the invoice (if any) that fulfilled it. Colors: blue (billed), green (paid),
// gray (pending). Click an invoice tag to jump to its editor.

import React from 'react';
import { Link } from 'react-router-dom';

function fmtUSD(cents) {
  return ((Number(cents) || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function statusTone(inv) {
  if (!inv) return 'gray';
  if (inv.status === 'paid') return 'green';
  if (inv.status === 'overdue') return 'red';
  if (['sent','signed'].includes(inv.status)) return 'blue';
  return 'amber'; // draft
}

const toneRing = {
  gray:  'bg-neutral-200 text-neutral-600',
  blue:  'bg-blue-500 text-white',
  green: 'bg-green-500 text-white',
  amber: 'bg-amber-500 text-white',
  red:   'bg-red-500 text-white',
};

export function MilestoneTimeline({ milestones = [] }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200">
        <div className="text-xs font-semibold text-neutral-500 uppercase">Milestone Timeline</div>
      </div>
      <div className="p-4">
        {milestones.length === 0 ? (
          <div className="border-2 border-dashed border-neutral-300 rounded p-6 text-center text-xs text-neutral-500">
            No milestones yet — set up the contract payment schedule to see the project timeline.
          </div>
        ) : (
          <ol className="relative border-l-2 border-neutral-200 ml-3 space-y-4">
            {milestones.map((m, i) => {
              const tone = statusTone(m.invoice);
              return (
                <li key={i} className="ml-4 relative">
                  <span className={`absolute -left-[1.55rem] top-1 w-4 h-4 rounded-full ${toneRing[tone]} grid place-items-center text-[10px] font-semibold`}>
                    {i + 1}
                  </span>
                  <div className="text-sm font-semibold text-neutral-800">{m.milestone || `Milestone ${i + 1}`}</div>
                  <div className="text-xs text-neutral-600 mt-0.5">
                    {m.percent}% · <span className="font-mono">{fmtUSD(m.amount_cents)}</span>
                    {m.condition && <span className="text-neutral-500"> — {m.condition}</span>}
                  </div>
                  {m.invoice ? (
                    <div className="mt-1">
                      <Link
                        to={`/documents/${m.invoice.id}`}
                        className="inline-block text-[10px] font-mono bg-neutral-100 hover:bg-sunvic-100 border border-neutral-300 rounded px-2 py-0.5"
                      >
                        {m.invoice.doc_number} · {m.invoice.status} · {fmtUSD(m.invoice.total_cents)}
                      </Link>
                    </div>
                  ) : (
                    <div className="mt-1 text-[10px] text-neutral-400">— no invoice yet —</div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

export default MilestoneTimeline;
