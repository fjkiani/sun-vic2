// Default document payloads applied on creation.
// Contract: pre-populates every canonical block (contractor info, legal text, payment schedule).
// Invoice: pre-populates the same header + Sunvic's default note.

import {
  SUNVIC_CONTRACTOR,
  WARRANTIES_TEXT,
  PERMITS_TEXT,
  INSURANCE_TEXT,
  DISPUTE_RESOLUTION_TEXT,
  RIGHT_TO_CANCEL_TEXT,
  AGREEMENT_SUMMARY_HEADER,
  DEFAULT_PAYMENT_SCHEDULE,
  DEFAULT_CONTRACT_LOCKS,
  DEFAULT_INVOICE_LOCKS,
} from './legal.js';

export function defaultContractPayload() {
  return {
    contractor: { ...SUNVIC_CONTRACTOR },
    homeowner: { name: '', address: '', phone: '', email: '' },
    contract_type: 'home_improvement',
    agreement_summary: AGREEMENT_SUMMARY_HEADER,
    scope_of_work: {
      phases: [
        {
          id: 'phase-1',
          title: 'Site preparation & demolition',
          description: 'Protection, demolition, and disposal.',
          sqft: 0,
          items: [{ desc: 'Selective demolition', qty: 1, rate: 0, details: '' }],
          excluded: false,
          manual_phase_cost: null,
          manual_cost_per_sqft: null,
        },
      ],
    },
    payment: {
      total_cents: 0,
      schedule: DEFAULT_PAYMENT_SCHEDULE.map((m) => ({ ...m })),
      method: 'check',
      notes: '',
    },
    timeline: {
      start_date: null,
      substantial_completion_date: null,
      final_completion_date: null,
    },
    warranties: { text: WARRANTIES_TEXT, one_year_workmanship: true },
    permits: { text: PERMITS_TEXT, responsible_party: 'contractor' },
    insurance: { text: INSURANCE_TEXT, coverage_certificate_available: true },
    dispute_resolution: { text: DISPUTE_RESOLUTION_TEXT, venue: 'New Jersey' },
    right_to_cancel: { text: RIGHT_TO_CANCEL_TEXT, cancellation_deadline_days: 3 },
    signatures: {
      contractor: { signed_at: null, signer_name: '' },
      homeowner: { signed_at: null, signer_name: '' },
    },
  };
}

export function defaultContractLocks() {
  return { ...DEFAULT_CONTRACT_LOCKS };
}

export function defaultInvoicePayload() {
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date();
  due.setDate(due.getDate() + 30);
  return {
    invoice_number: '',
    invoice_date: today,
    due_date: due.toISOString().slice(0, 10),
    project_ref: '',
    status: 'draft',
    bill_to: { client_name: '', client_address: '', recipient_name: '', recipient_email: '' },
    contractor: { ...SUNVIC_CONTRACTOR },
    phases: [
      {
        id: 'phase-1',
        title: 'Project phase',
        description: 'Description of work included in this phase.',
        sqft: 0,
        items: [{ desc: '', qty: 1, rate: 0, details: '' }],
        excluded: false,
        manual_phase_cost: null,
        manual_cost_per_sqft: null,
      },
    ],
    tax_rate_percent: 0,
    notes:
      'Payment is due within 30 days. Please make checks payable to Sunvic Construction. Thank you for your business!',
    include_cost_analysis: true,
  };
}

export function defaultInvoiceLocks() {
  return { ...DEFAULT_INVOICE_LOCKS };
}

export function defaultPayloadFor(template) {
  return template === 'contract' ? defaultContractPayload() : defaultInvoicePayload();
}

export function defaultLocksFor(template) {
  return template === 'contract' ? defaultContractLocks() : defaultInvoiceLocks();
}
