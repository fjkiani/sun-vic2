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

import { LEGAL_BLOCK_META } from '../editors/legal/legalMeta.js';

// The heading each form block renders above its rows. Kept here rather than inside the two
// editors because the lock message has to name the group the field sits in — "Form › Homeowner"
// is a true answer and still a useless one when the field you want is the company address.
// The editors import these so the words on the screen and the words in the message are the
// same string, not two strings that agree today.
export const FORM_BLOCK_LABELS = {
  contract: {
    cover: 'Document details',
    homeowner: 'Homeowner',
    contractor: 'Your company',
    agreement_summary: 'Agreement summary',
    scope_of_work: 'Scope of work',
    payment: 'Payment',
    timeline: 'Timeline',
  },
  invoice: {
    cover: 'Invoice details',
    homeowner: 'Bill to',
    contractor: 'Your company',
    payment: 'Amount',
    payment_methods: 'How to pay',
    timeline: 'Dates',
  },
};

export const CONTRACT_FORM_TABS = [
  { id: 'homeowner', label: 'Homeowner', blocks: ['cover', 'homeowner', 'contractor'] },
  { id: 'scope',     label: 'Scope',     blocks: ['agreement_summary', 'scope_of_work'] },
  { id: 'payment',   label: 'Payment',   blocks: ['payment'] },
  { id: 'timeline',  label: 'Timeline',  blocks: ['timeline'] },
];

// The invoice used to have no home for `contractor` or `payment_methods`, which meant
// sectionForPath() returned null for six of the seven paths an invoice locks by default —
// measured by scripts/probe-lock-reachability.mjs. The lock message told the user to go and
// unlock the field somewhere, and there was nowhere to go: no tab claimed the block and no
// editor rendered it. Both blocks print on the invoice, so both now have a tab.
export const INVOICE_FORM_TABS = [
  { id: 'homeowner', label: 'Bill to',  blocks: ['cover', 'homeowner', 'contractor'] },
  { id: 'payment',   label: 'Amount',   blocks: ['payment', 'payment_methods'] },
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

// Which payload block owns a given path root. Most roots are their own block; the cover
// fields are loose top-level scalars, and the invoice uses different names for the same
// ideas, so those are aliased rather than special-cased at the call sites.
//
// The invoice aliases are the easy ones to get wrong: invoice_number, contract_ref,
// milestone_label and milestone_condition all *read* like payment fields but are rendered by
// InvoiceFormEditor's CoverBlock, so routing them to 'payment' sends the user to a tab that
// does not contain the field they were told to fix.
const ROOT_TO_BLOCK = {
  job_no: 'cover', prepared_on: 'cover', for_label: 'cover', contract_type: 'cover',
  homeowner: 'homeowner', contractor: 'contractor',
  agreement_summary: 'agreement_summary', scope_of_work: 'scope_of_work',
  payment: 'payment', timeline: 'timeline',
  bill_to: 'homeowner',            // invoice "Bill to" tab
  totals: 'payment', milestone: 'payment', contract: 'payment', tax: 'payment',
  invoice_date: 'timeline', due_date: 'timeline',
  invoice_number: 'cover', contract_ref: 'cover',
  milestone_label: 'cover', milestone_condition: 'cover',
  payment_methods: 'payment_methods',
};

/**
 * Where does the user go to fix this field?
 *
 * Needed because the send-readiness checklist offers "Fix →" on a blocking field, and a field
 * living in an unselected sub-tab is not merely off-screen, it is not mounted at all — so
 * scrolling to it would silently do nothing. Returns the tab AND section to select first.
 *
 * Fails closed: an unknown root returns null so the caller shows no "Fix" affordance rather
 * than offering a button that goes nowhere.
 *
 * @returns {{tab:'form'|'legal', section:string} | null}
 */
export function blockForPath(path) {
  if (!path) return null;
  const root = String(path).split('.')[0];
  return ROOT_TO_BLOCK[root] || root;
}

// The human name of a block, form or legal. Returns null for a block nothing renders, which
// callers must treat as "there is nowhere to send you" rather than inventing a destination.
export function blockLabel(template, block) {
  if (!block) return null;
  const form = FORM_BLOCK_LABELS[template === 'invoice' ? 'invoice' : 'contract'] || {};
  if (form[block]) return form[block];
  return LEGAL_BLOCK_META[block]?.title || null;
}

export function sectionForPath(template, path) {
  if (!path) return null;
  const block = blockForPath(path);

  const formTabs = formTabsFor(template);
  const inForm = formTabs.find((t) => t.blocks.includes(block));
  if (inForm) return { tab: 'form', section: inForm.id };

  const inLegal = LEGAL_TABS.find((t) => t.blocks.includes(block));
  if (inLegal) return { tab: 'legal', section: inLegal.id };

  return null;
}

/**
 * Where does the user go to UNLOCK this field, said in words a human can follow?
 *
 * sectionForPath returns machine ids (`{tab:'form', section:'homeowner'}`). The lock toast was
 * hand-writing "Unlock it in the Legal tab" instead of consulting it, which is how six
 * contractor fields living in Form › Homeowner came to be advertised as living in Legal, with
 * no sub-tab named even when Legal was the right answer — four sub-tabs to hunt through.
 *
 * Returns the human labels the toast should actually print, or null when nothing on the screen
 * owns the path. Null is a real answer and callers must render it as one; the previous code had
 * no way to express "there is nowhere to send you", so it sent people somewhere anyway.
 *
 * @returns {{tab:'form'|'legal', section:string, tabLabel:string, sectionLabel:string,
 *            label:string} | null}
 */
export function whereToUnlock(template, path) {
  const loc = sectionForPath(template, path);
  if (!loc) return null;
  const tabs = loc.tab === 'form' ? formTabsFor(template) : LEGAL_TABS;
  const hit = tabs.find((t) => t.id === loc.section);
  if (!hit) return null;
  const tabLabel = loc.tab === 'form' ? 'Form' : 'Legal';
  const group = blockLabel(template, blockForPath(path));
  // "Form › Homeowner" is where contractor.address lives and it reads like the wrong place,
  // because the tab is named after the first of the three groups it holds. Name the group too,
  // unless that would just repeat the tab name back ("Form › Timeline › Timeline").
  const parts = [tabLabel, hit.label];
  if (group && group !== hit.label) parts.push(group);
  return {
    tab: loc.tab,
    section: loc.section,
    tabLabel,
    sectionLabel: hit.label,
    blockLabel: group,
    label: parts.join(' › '),
  };
}

// Every payload block the document screen can reach, used by the legal-binding test to
// prove nothing that prints is unreachable from the UI.
export const ALL_LEGAL_BLOCKS = LEGAL_TABS.flatMap((t) => t.blocks);
export const ALL_CONTRACT_FORM_BLOCKS = CONTRACT_FORM_TABS.flatMap((t) => t.blocks);
