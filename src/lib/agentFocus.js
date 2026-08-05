import { create } from 'zustand';

// A one-slot channel between "the agent button on a section header" and "the ask bar
// docked at the bottom of the screen".
//
// The two live in different subtrees — the button is rendered by an AccordionItem deep
// inside the form or legal editor, the bar is a sibling of the whole tab panel — so the
// alternative was threading a callback through Accordion, AccordionItem, every block
// renderer and both editors purely as plumbing. zustand is already a dependency; this
// costs nothing and keeps the components unaware of each other.

export const useAgentFocus = create((set) => ({
  // { tab, section, blocks, label, prefill, nonce } | null
  request: null,

  /** Section header button was tapped: aim the docked bar at that block. */
  focusSection: ({ tab, section, blocks, label, prefill = '' }) =>
    set({ request: { tab, section, blocks, label, prefill, nonce: Date.now() } }),

  /** The bar has taken the request. Cleared so re-tapping the same section fires again. */
  consume: () => set({ request: null }),
}));
