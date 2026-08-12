import React, { createContext, useContext, useRef, useState } from 'react';

// Single-open accordion. The old form stacked seven expanded sections in one scroll, so
// on a phone every section was a squeezed strip and the page was a mile long. Collapsing
// to one open section at a time gives the open one the full remaining height — this is
// the fix for "improve height of sections like interior".

const AccordionCtx = createContext(null);

export function Accordion({ children, defaultOpen = null, allowAllClosed = true }) {
  const [openId, setOpenId] = useState(defaultOpen);

  // Sub-tabs swap this accordion's *contents* without remounting it, so openId kept
  // pointing at a block from the previous sub-tab, nothing matched, and the user landed
  // on a wall of collapsed headers. Measured on production at 390px: 6 of the 8 document
  // sub-tabs opened with zero sections expanded — including single-block tabs like
  // Payment and Signature, which rendered one grey bar and empty space. defaultOpen
  // tracks the first visible block, so re-seed from it whenever the visible set changes.
  // Adjusting state during render (rather than in an effect) is the documented React
  // pattern here and avoids painting one frame of the all-collapsed wall.
  const seededFrom = useRef(defaultOpen);
  if (seededFrom.current !== defaultOpen) {
    seededFrom.current = defaultOpen;
    if (openId !== defaultOpen) setOpenId(defaultOpen);
  }

  const toggle = (id) => setOpenId((cur) => (cur === id ? (allowAllClosed ? null : cur) : id));
  return (
    <AccordionCtx.Provider value={{ openId, toggle }}>
      <div className="divide-y divide-neutral-200 border border-neutral-200 rounded-xl overflow-hidden bg-white">
        {children}
      </div>
    </AccordionCtx.Provider>
  );
}

export function AccordionItem({ id, title, subtitle, badge, warn = false, action, children }) {
  const ctx = useContext(AccordionCtx);
  if (!ctx) throw new Error('AccordionItem must be used inside <Accordion>');
  const open = ctx.openId === id;

  return (
    <div className={open ? 'bg-white' : 'bg-white'}>
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => ctx.toggle(id)}
          aria-expanded={open}
          // Named so "take me to this field" can open the section holding it. Only the first
          // block of a sub-tab is open by default, so every other block's rows are absent from
          // the DOM, not merely scrolled away.
          data-accordion-item={id}
          className="flex-1 flex items-center gap-3 px-3 py-3 min-h-[56px] text-left active:bg-neutral-50"
        >
          <svg
            className={`w-4 h-4 flex-shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-neutral-900 truncate">{title}</div>
            {subtitle && <div className="text-xs text-neutral-500 truncate mt-0.5">{subtitle}</div>}
          </div>
          {badge != null && (
            <span
              className={`flex-shrink-0 text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                warn ? 'bg-amber-100 text-amber-800' : 'bg-neutral-100 text-neutral-600'
              }`}
            >
              {badge}
            </span>
          )}
        </button>
        {action && <div className="flex items-center pr-2">{action}</div>}
      </div>
      {open && <div className="px-3 pb-4 pt-1">{children}</div>}
    </div>
  );
}
