// Single source of truth for how the document screen is sliced into sub-tabs.
//
// The problem this solves: the Form tab used to dump seven sections and the Legal tab
// five textareas into one scroll on a 390px screen. Each sub-tab below owns a small set
// of payload blocks, so a phone shows one coherent group at a time.
//
// This file is owned by the document-screen workstream and *consumed* by the editors
// (ContractFormEditor / InvoiceFormEditor / LegalEditor) so the tab strip and the
// editors can never drift out of sync. `blocks` are payload-level section keys and line
// up with SECTION_LABELS in src/lib/agentScope.js so the copilot can be scoped to
// whatever the user is currently looking at.

export const CONTRACT_FORM_TABS = [
  { id: 'homeowner', label: 'Homeowner', blocks: ['cover', 'homeowner', 'contractor'] },
  { id: 'scope',     label: 'Scope',     blocks: ['agreement_summary', 'scope_of_work'] },
  { id: 'payment',   label: 'Payment',   blocks: ['payment'] },
  { id: 'timeline',  label: 'Timeline',  blocks: ['timeline'] },
];

export const INVOICE_FORM_TABS = [
  { id: 'homeowner', label: 'Bill to',  blocks: ['cover', 'homeowner'] },
  { id: 'payment',   label: 'Amount',   blocks: ['payment'] },
  { id: 'timeline',  label: 'Dates',    blocks: ['timeline'] },
];

export const LEGAL_TABS = [
  { id: 'terms',        label: 'Terms',        blocks: ['permits', 'change_orders', 'material_selection', 'invoice_terms'] },
  { id: 'warranty',     label: 'Warranty',     blocks: ['warranties', 'insurance', 'unforeseen'] },
  { id: 'cancellation', label: 'Cancellation', blocks: ['right_to_cancel', 'dispute_resolution'] },
  { id: 'signature',    label: 'Signature',    blocks: ['signature'] },
];

export function formTabsFor(template) {
  return template === 'invoice' ? INVOICE_FORM_TABS : CONTRACT_FORM_TABS;
}

// Which payload blocks a given sub-tab should render. Unknown id => everything, so a
// desktop caller that passes no section still gets the full editor.
export function blocksFor(tabs, sectionId) {
  if (!sectionId) return null; // null = render all blocks
  const hit = tabs.find((t) => t.id === sectionId);
  return hit ? hit.blocks : null;
}

// Every payload block the document screen can reach, used by the legal-binding test to
// prove nothing that prints is unreachable from the UI.
export const ALL_LEGAL_BLOCKS = LEGAL_TABS.flatMap((t) => t.blocks);
export const ALL_CONTRACT_FORM_BLOCKS = CONTRACT_FORM_TABS.flatMap((t) => t.blocks);
