import React from 'react';

// A second-level tab strip that sits under the primary AI/Form/Legal/Preview/PDF tabs.
//
// Deliberately NOT equal-width segments like SegmentedTabs: four labels of uneven length
// ("Homeowner", "Scope", "Payment", "Timeline") squeezed into equal thirds of 390px
// truncate. This is a scrollable chip row with real 40px targets that keeps full labels.
// `count`/`warn` let a tab advertise unfinished business so the user knows where to go.

export function DocSubTabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={`flex gap-1.5 overflow-x-auto no-scrollbar px-1 ${className}`} role="tablist">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`flex-shrink-0 inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-full text-sm font-medium border transition-colors ${
              active
                ? 'bg-sunvic-500 text-white border-sunvic-500'
                : 'bg-white text-neutral-600 border-neutral-300 hover:border-neutral-400'
            }`}
          >
            {t.label}
            {t.warn && !active && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-label="needs attention" />
            )}
            {typeof t.count === 'number' && t.count > 0 && (
              <span className={`text-[10px] rounded-full px-1.5 ${active ? 'bg-white/25' : 'bg-neutral-100 text-neutral-600'}`}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
