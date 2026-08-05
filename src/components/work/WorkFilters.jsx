import React from 'react';
import { SegmentedTabs } from '../SegmentedTabs.jsx';

// Filters for the unified Work list: type tabs (All/Projects/Contracts/Invoices/Trash),
// status chips, and a search box. Mobile-first, flat (no nested controls).
const TYPE_TABS = [
  { id: 'all', label: 'All' },
  { id: 'projects', label: 'Projects' },
  { id: 'contract', label: 'Contracts' },
  { id: 'invoice', label: 'Invoices' },
  { id: 'trash', label: 'Trash' },
];

const STATUS_CHIPS = ['draft', 'sent', 'signed', 'paid', 'overdue', 'void'];

export function WorkFilters({ type, onType, status, onStatus, q, onQ }) {
  const isTrash = type === 'trash';
  return (
    <div className="space-y-3">
      <SegmentedTabs tabs={TYPE_TABS} value={type} onChange={onType} />
      {!isTrash && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5 flex-1">
            <button
              onClick={() => onStatus('')}
              className={`min-h-[44px] px-3 rounded-full text-xs font-medium border ${
                status === '' ? 'bg-sunvic-500 text-white border-sunvic-500' : 'bg-white text-neutral-600 border-neutral-300'
              }`}
            >
              Any
            </button>
            {STATUS_CHIPS.map((s) => (
              <button
                key={s}
                onClick={() => onStatus(status === s ? '' : s)}
                className={`min-h-[44px] px-3 rounded-full text-xs font-medium border capitalize ${
                  status === s ? 'bg-sunvic-500 text-white border-sunvic-500' : 'bg-white text-neutral-600 border-neutral-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder="Search…"
            className="w-full sm:w-48 rounded-lg border border-neutral-300 px-3 min-h-[44px] text-sm focus:outline-none focus:ring-2 focus:ring-sunvic-500"
          />
        </div>
      )}
    </div>
  );
}
