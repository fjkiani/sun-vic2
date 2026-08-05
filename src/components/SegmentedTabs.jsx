import React from 'react';

// A flat, mobile-friendly segmented control. Replaces nested tabs-inside-panes.
// `tabs` = [{ id, label }]. Renders a single horizontal row of equal-width segments.
export function SegmentedTabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={`flex bg-neutral-100 rounded-lg p-1 gap-1 ${className}`} role="tablist">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button" // bare <button> defaults to submit; see DocSubTabs
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`flex-1 min-h-[44px] px-2 rounded-md text-sm font-medium transition-colors ${
              active ? 'bg-white text-sunvic-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
