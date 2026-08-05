// Turns "where the user is standing in the UI" into an instruction prefix, so a prompt
// typed in the Legal tab is interpreted against legal blocks instead of the whole
// document. Keeps the agent's edits surgical and makes short prompts ("make this
// stricter") unambiguous.
//
// Scope arrives as { tab, section?, blocks? }:
//   tab      one of ai | form | legal | preview | pdf
//   section  the sub-tab the user is on ('homeowner', 'terms', 'warranty', …)
//   blocks   the payload blocks that sub-tab actually contains
//
// `blocks` is the precise one and is preferred when present. Sub-tab ids are a UI grouping
// and do not map one-to-one onto payload keys — the Legal tab's "Terms" holds four
// unrelated blocks, and the Form tab's "Homeowner" also carries the contractor card.
// Scoping on the sub-tab name alone silently under-describes both.

const SCOPE_LABELS = {
  ai: null, // the AI tab is the general surface — no narrowing
  form: 'the job details (homeowner, scope of work, payment, timeline)',
  legal: 'the legal blocks (warranties, permits, insurance, dispute resolution, right to cancel, change orders, unforeseen conditions, material selection)',
  preview: 'the document content as shown in the preview',
  pdf: 'the document content as it appears in the rendered PDF',
};

// Payload-block level. These are the keys the agent can actually write to.
const BLOCK_LABELS = {
  cover: 'the cover page details',
  homeowner: 'the homeowner contact details',
  contractor: 'the contractor company details',
  agreement_summary: 'the agreement summary',
  scope_of_work: 'the scope of work',
  payment: 'the payment terms and milestone schedule',
  timeline: 'the project timeline dates',
  warranties: 'the warranties block',
  permits: 'the permits block',
  insurance: 'the insurance block',
  dispute_resolution: 'the dispute resolution block',
  right_to_cancel: 'the right-to-cancel block',
  change_orders: 'the change orders block',
  unforeseen: 'the unforeseen conditions block',
  material_selection: 'the material selection block',
  invoice_terms: 'the invoice terms block',
  signature: 'the signature block',
};

// Sub-tab level, used when no block list was supplied.
const SECTION_LABELS = {
  ...BLOCK_LABELS,
  scope: 'the scope of work',
  terms: 'the contract terms blocks (permits, change orders, material selection, invoicing)',
  warranty: 'the warranty, insurance and unforeseen-conditions blocks',
  cancellation: 'the right-to-cancel and dispute resolution blocks',
};

function joinLabels(list) {
  const named = list.map((b) => BLOCK_LABELS[b]).filter(Boolean);
  if (named.length === 0) return null;
  if (named.length === 1) return named[0];
  return `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
}

/** The most specific description available for where the user is. */
export function scopeTarget(scope = {}) {
  const { tab, section, blocks } = scope || {};
  if (Array.isArray(blocks) && blocks.length > 0) {
    const label = joinLabels(blocks);
    if (label) return label;
  }
  if (section && SECTION_LABELS[section]) return SECTION_LABELS[section];
  return SCOPE_LABELS[tab] || null;
}

// Builds the message actually sent to the agent. The user's words are preserved verbatim
// at the end so the model never loses the literal request.
export function buildScopedMessage(message, scope = {}) {
  const target = scopeTarget(scope);
  if (!target) return message;
  return `[The user is editing ${target}. Prefer changes there unless they clearly ask for something else.]\n\n${message}`;
}

export function scopePlaceholder(scope = {}) {
  const { tab, section, blocks } = scope || {};
  if (Array.isArray(blocks) && blocks.length === 1 && BLOCK_LABELS[blocks[0]]) {
    return `Ask about ${shortLabel(blocks[0])}…`;
  }
  if (section && SECTION_LABELS[section]) return `Ask about ${shortLabel(section)}…`;
  switch (tab) {
    case 'form': return 'Ask the copilot to fill or fix job details…';
    case 'legal': return 'Ask the copilot to adjust legal terms…';
    case 'preview': return 'Ask the copilot to change the wording…';
    case 'pdf': return 'Ask the copilot to change anything before you send…';
    default: return 'Ask the copilot…';
  }
}

function shortLabel(key) {
  return String(key).replace(/_/g, ' ');
}

// Ready-made prompts surfaced per surface, so the user never faces an empty box.
export function scopeSuggestions(scope = {}, doc = null) {
  const { tab, section, blocks } = scope || {};
  const isInvoice = doc?.template === 'invoice';

  const one = Array.isArray(blocks) && blocks.length === 1 ? blocks[0] : null;
  if (one === 'payment') {
    return ['Check the payment schedule adds to 100%', 'Split labor and materials to match the total'];
  }
  if (one === 'scope_of_work') {
    return ['Break the scope into phases', 'Price anything still missing'];
  }
  if (one || section) {
    const what = shortLabel(one || section);
    return [`Rewrite ${what} in plainer language`, `Is anything missing from ${what}?`];
  }
  switch (tab) {
    case 'form':
      return isInvoice
        ? ['Fill in the missing invoice details', 'Check the amounts add up']
        : ['Fill in anything still missing', 'Break the scope into phases', 'Check the payment schedule adds to 100%'];
    case 'legal':
      return ['Are all NJ required clauses present?', 'Explain the right-to-cancel terms'];
    case 'preview':
      return ['Tighten the wording', 'Fix any typos'];
    case 'pdf':
      return ['Is this ready to send?', 'Email this to the homeowner'];
    default:
      return ['What still needs my attention?', 'Generate the PDF'];
  }
}
