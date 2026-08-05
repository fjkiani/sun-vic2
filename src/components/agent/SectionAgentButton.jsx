import React from 'react';
import { useAgentFocus } from '../../lib/agentFocus.js';

// The per-section half of plan decision 4. Sits in an AccordionItem's `action` slot, so
// every block header carries a way to aim the copilot at that block specifically without
// typing "in the warranties section" first.
//
// It does not open a second chat surface — it focuses the ask bar already docked at the
// bottom of the tab. One conversation, one place the answer appears.

export function SectionAgentButton({ tab, section, blocks, label, prefill = '', className = '' }) {
  const focusSection = useAgentFocus((s) => s.focusSection);

  return (
    <button
      type="button"
      aria-label={`Ask the copilot about ${label || section}`}
      onClick={(e) => {
        // The header is itself the accordion toggle; asking about a section should not
        // also collapse it out from under the user.
        e.stopPropagation();
        focusSection({ tab, section, blocks: blocks || [section], label, prefill });
      }}
      className={`flex-shrink-0 w-9 h-9 rounded-full border border-neutral-200 bg-white text-neutral-500 flex items-center justify-center active:bg-neutral-100 ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l1.9 4.9L19 9.8l-4.1 2.4L15.6 17 12 14.4 8.4 17l.7-4.8L5 9.8l5.1-1.9z" />
      </svg>
    </button>
  );
}
