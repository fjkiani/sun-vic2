// Turns "where the user is standing in the UI" into an instruction prefix, so a prompt
// typed in the Legal tab is interpreted against legal blocks instead of the whole
// document. Keeps the agent's edits surgical and makes short prompts ("make this
// stricter") unambiguous.

const SCOPE_LABELS = {
  ai: null, // the AI tab is the general surface — no narrowing
  form: 'the job details (homeowner, scope of work, payment, timeline)',
  legal: 'the legal blocks (warranties, permits, insurance, dispute resolution, right to cancel, change orders, unforeseen conditions, material selection)',
  preview: 'the document content as shown in the preview',
  pdf: 'the document content as it appears in the rendered PDF',
};

const SECTION_LABELS = {
  homeowner: 'the homeowner contact details',
  scope: 'the scope of work',
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

// Builds the message actually sent to the agent. The user's words are preserved verbatim
// at the end so the model never loses the literal request.
export function buildScopedMessage(message, scope = {}) {
  const { tab, section } = scope || {};
  const target = SECTION_LABELS[section] || SCOPE_LABELS[tab] || null;
  if (!target) return message;
  return `[The user is editing ${target}. Prefer changes there unless they clearly ask for something else.]\n\n${message}`;
}

export function scopePlaceholder(scope = {}) {
  const { tab, section } = scope || {};
  if (section && SECTION_LABELS[section]) return `Ask about ${shortLabel(section)}…`;
  switch (tab) {
    case 'form': return 'Ask the copilot to fill or fix job details…';
    case 'legal': return 'Ask the copilot to adjust legal terms…';
    case 'preview': return 'Ask the copilot to change the wording…';
    case 'pdf': return 'Ask the copilot to change anything before you send…';
    default: return 'Ask the copilot…';
  }
}

function shortLabel(section) {
  return String(section).replace(/_/g, ' ');
}

// Ready-made prompts surfaced per surface, so the user never faces an empty box.
export function scopeSuggestions(scope = {}, doc = null) {
  const { tab, section } = scope || {};
  const isInvoice = doc?.template === 'invoice';
  if (section) {
    return [
      `Rewrite ${shortLabel(section)} in plainer language`,
      `Is anything missing from ${shortLabel(section)}?`,
    ];
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
