// Default document payloads applied on creation.
// Mirrors sample structure: Contract = A–J with cover, Invoice = milestone-linked.

import {
  SUNVIC_CONTRACTOR,
  AGREEMENT_SUMMARY_BODY,
  MATERIAL_SELECTION_TEXT,
  CHANGES_TO_WORK_TEXT,
  UNFORESEEN_CONDITIONS_TEXT,
  UNFORESEEN_OPTION_1_TEXT,
  UNFORESEEN_OPTION_2_TEXT,
  INVOICE_TERMS_TEXT,
  PAYMENT_METHODS_LINES,
  TIMELINE_DISCLAIMER_TEXT,
  WARRANTIES_TEXT,
  WARRANTIES_START_TEXT,
  WARRANTIES_MATERIALS_TEXT,
  PERMITS_TEXT,
  INSURANCE_TEXT,
  DISPUTE_RESOLUTION_INTRO,
  DISPUTE_RESOLUTION_STEPS,
  DISPUTE_RESOLUTION_FOOTER,
  RIGHT_TO_CANCEL_TEXT,
  SIGNATURE_INTRO,
  DEFAULT_PAYMENT_SCHEDULE,
  DEFAULT_SCOPE_GROUPS,
  DEFAULT_CONTRACT_LOCKS,
  DEFAULT_INVOICE_LOCKS,
} from './legal.js';

// Sub all placeholders in legal-template strings
function subPlaceholders(text, { homeownerName, weeks, months } = {}) {
  const name = homeownerName?.trim() || '_______________________';
  return text
    .replaceAll('{{HOMEOWNER_NAME}}', name)
    .replaceAll('{{WEEKS_TO_START}}', weeks != null ? String(weeks) : '2')
    .replaceAll('{{MONTHS_TO_COMPLETE}}', months != null ? String(months) : '6');
}

function subHomeowner(text, name) {
  return subPlaceholders(text, { homeownerName: name });
}

export function defaultContractPayload({ homeownerName = '', jobNo = '', forLabel = '' } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    job_no: jobNo,
    for_label: forLabel,
    prepared_on: today,

    contractor: { ...SUNVIC_CONTRACTOR },
    homeowner: { name: homeownerName, address: '', phone: '', email: '' },
    contract_type: 'Lump Sum Contract',
    agreement_summary: {
      text: subPlaceholders(AGREEMENT_SUMMARY_BODY, { homeownerName, weeks: 2, months: 6 }),
      weeks_to_start: 2,
      months_to_complete: 6,
    },

    scope_of_work: {
      intro:
        'Construction of a new addition according to the approved drawings issued for the permit, including demo, foundation, framing, roofing, siding, interior finishes, electrical, and HVAC.',
      groups: DEFAULT_SCOPE_GROUPS.map((g) => ({
        ...g,
        tasks: g.tasks.map((t) => ({
          task: t.task,
          description: [...(t.description || [])],
          qty: t.qty || 'Lump Sump',
          unit_price_cents: 0,
          amount_cents: 0,
        })),
      })),
      total_cents: 0,
    },

    payment: {
      labor_cost_cents: 0,
      materials_cost_cents: 0,
      total_cents: 0,
      schedule: DEFAULT_PAYMENT_SCHEDULE.map((m) => ({ ...m })),
      method: 'check',
      notes: '',
    },
    material_selection: { text: MATERIAL_SELECTION_TEXT },
    change_orders: { text: CHANGES_TO_WORK_TEXT },
    unforeseen: {
      text: UNFORESEEN_CONDITIONS_TEXT,
      option_1: UNFORESEEN_OPTION_1_TEXT,
      option_2: UNFORESEEN_OPTION_2_TEXT,
    },
    invoice_terms: { text: subHomeowner(INVOICE_TERMS_TEXT, homeownerName) },

    timeline: {
      start_date: null,
      substantial_completion_date: null,
      final_completion_date: null,
      weeks_to_start: 2,
      months_to_complete: 6,
      disclaimer: TIMELINE_DISCLAIMER_TEXT,
    },

    warranties: {
      text: subHomeowner(WARRANTIES_TEXT, homeownerName),
      start_text: WARRANTIES_START_TEXT,
      materials_text: WARRANTIES_MATERIALS_TEXT,
      one_year_workmanship: true,
    },

    permits: {
      intro: PERMITS_TEXT,
      contractor_responsible: true,
      homeowner_responsible: false,
    },

    insurance: { text: INSURANCE_TEXT, coverage_certificate_available: true },

    dispute_resolution: {
      intro: subHomeowner(DISPUTE_RESOLUTION_INTRO, homeownerName),
      steps: DISPUTE_RESOLUTION_STEPS.map((s) => ({ ...s })),
      footer: DISPUTE_RESOLUTION_FOOTER,
    },

    right_to_cancel: { text: RIGHT_TO_CANCEL_TEXT, cancellation_deadline_days: 3 },

    signature: {
      intro: SIGNATURE_INTRO,
      contractor: { printed_name: '', signed_at: null },
      homeowner:  { printed_name: '', signed_at: null, dated: '' },
    },
  };
}

export function defaultContractLocks() {
  return { ...DEFAULT_CONTRACT_LOCKS };
}

export function defaultInvoicePayload({ homeownerName } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date();
  due.setDate(due.getDate() + 1);
  return {
    invoice_number: '',
    invoice_date: today,
    due_date: due.toISOString().slice(0, 10),
    contract_ref: '',
    milestone_label: '',
    milestone_condition: '',
    status: 'draft',

    bill_to: {
      client_name: '',
      property_address: '',
      recipient_email: '',
      recipient_phone: '',
    },

    contractor: { ...SUNVIC_CONTRACTOR },

    contract: {
      total_cents: 0,
      labor_cost_cents: 0,
      materials_cost_cents: 0,
    },

    milestone: {
      percent: 0,
      subtotal_cents: 0,
      labor_portion_cents: 0,
      materials_portion_cents: 0,
    },

    line_items: [],
    prior_payments: [],

    tax: {
      rate_percent: 6.625,
      applies_to: 'materials_only',
      amount_cents: 0,
    },

    totals: {
      subtotal_cents: 0,
      tax_cents: 0,
      total_due_cents: 0,
      remaining_after_cents: 0,
    },

    invoice_terms: { text: subPlaceholders(INVOICE_TERMS_TEXT, { homeownerName }) },
    payment_methods: [...PAYMENT_METHODS_LINES],
    include_cost_analysis: false,
  };
}

export function defaultInvoiceLocks() {
  return { ...DEFAULT_INVOICE_LOCKS };
}

export function defaultPayloadFor(template, opts) {
  return template === 'contract'
    ? defaultContractPayload(opts)
    : defaultInvoicePayload(opts);
}

export function defaultLocksFor(template) {
  return template === 'contract' ? defaultContractLocks() : defaultInvoiceLocks();
}
