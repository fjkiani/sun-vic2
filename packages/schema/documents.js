// Sunvic Documents — canonical schemas (Zod).
// Shared by frontend, backend, and agent. Aligned with the 10-page NJ Home Improvement Contract sample.

import { z } from 'zod';

// ────────────────────────────────────────────────────────────────
// Shared building blocks
// ────────────────────────────────────────────────────────────────

export const LineItem = z.object({
  desc: z.string().default(''),
  qty: z.number().nonnegative().default(1),
  rate: z.number().nonnegative().default(0), // dollars
  details: z.string().default(''),
});

export const ScopeTask = z.object({
  task: z.string().default(''),
  description: z.array(z.string()).default([]),
  qty: z.string().default('Lump Sump'),
  unit_price_cents: z.number().nonnegative().default(0),
  amount_cents: z.number().nonnegative().default(0),
});

export const ScopeGroup = z.object({
  category: z.string().default(''),
  tasks: z.array(ScopeTask).default([]),
});

export const ContractorInfo = z.object({
  legal_name: z.string().default('SUNVIC CONTRACTORS LLC'),
  address: z.string().default('6 Stone Ridge Rd.- Old Bridge - NJ - 08857'),
  phone: z.string().default('+1 (732) 824-9203'),
  email: z.string().default('Contact@sunvicnj.com'),
  license_number: z.string().default('13VH12429600'),
  website: z.string().default('www.sunvicnj.com'),
});

export const HomeownerInfo = z.object({
  name: z.string().default(''),
  address: z.string().default(''),
  phone: z.string().default(''),
  email: z.string().default(''),
});

export const PaymentMilestone = z.object({
  milestone: z.string(),
  percent: z.number().min(0).max(100),
  condition: z.string().default(''),
});

// ────────────────────────────────────────────────────────────────
// Contract payload — mirrors sample sections A–J
// ────────────────────────────────────────────────────────────────

export const ContractPayload = z.object({
  // Cover-page metadata
  job_no: z.string().default(''),
  for_label: z.string().default(''),
  prepared_on: z.string().default(''),

  // A - Agreement Background
  contractor: ContractorInfo.default({}),
  homeowner: HomeownerInfo.default({}),
  contract_type: z.string().default('Lump Sum Contract'),
  agreement_summary: z.object({
    text: z.string().default(''),           // canonical body incl. bulleted obligations (server-provided)
    scope_recap: z.string().default(''),    // LLM-provided one-paragraph scope recap
    weeks_to_start: z.number().default(2),
    months_to_complete: z.number().default(6),
  }).default({}),

  // B - Scope of Work
  scope_of_work: z.object({
    intro: z.string().default(
      'Construction of a new addition according to the approved drawings issued for the permit, including demo, foundation, framing, roofing, siding, interior finishes, electrical, and HVAC.'
    ),
    groups: z.array(ScopeGroup).default([]),
    total_cents: z.number().nonnegative().default(0),
  }).default({}),

  // C - Payment Terms
  payment: z.object({
    labor_cost_cents: z.number().nonnegative().default(0),
    materials_cost_cents: z.number().nonnegative().default(0),
    total_cents: z.number().nonnegative().default(0),
    schedule: z.array(PaymentMilestone).default([]),
    method: z.enum(['check', 'ach', 'card']).default('check'),
    notes: z.string().default(''),
  }).default({}),
  material_selection: z.object({ text: z.string().default('') }).default({}),
  change_orders: z.object({ text: z.string().default('') }).default({}),
  unforeseen: z.object({
    text: z.string().default(''),
    option_1: z.string().default(''),
    option_2: z.string().default(''),
  }).default({}),
  invoice_terms: z.object({ text: z.string().default('') }).default({}),

  // D - Timeline
  timeline: z.object({
    start_date: z.string().nullable().default(null),
    substantial_completion_date: z.string().nullable().default(null),
    final_completion_date: z.string().nullable().default(null),
    weeks_to_start: z.number().default(2),
    months_to_complete: z.number().default(6),
    disclaimer: z.string().default(''),
  }).default({}),

  // E - Warranties
  warranties: z.object({
    text: z.string().default(''),
    start_text: z.string().default(''),
    materials_text: z.string().default(''),
    one_year_workmanship: z.boolean().default(true),
  }).default({}),

  // F - Permits
  permits: z.object({
    intro: z.string().default(''),
    contractor_responsible: z.boolean().default(true),
    homeowner_responsible: z.boolean().default(false),
  }).default({}),

  // G - Insurance
  insurance: z.object({
    text: z.string().default(''),
    coverage_certificate_available: z.boolean().default(true),
  }).default({}),

  // H - Dispute Resolution
  dispute_resolution: z.object({
    intro: z.string().default(''),
    steps: z.array(z.object({ name: z.string(), text: z.string() })).default([]),
    footer: z.string().default(''),
  }).default({}),

  // I - Right to Cancel
  right_to_cancel: z.object({
    text: z.string().default(''),
    cancellation_deadline_days: z.number().default(3),
  }).default({}),

  // J - Signature
  signature: z.object({
    intro: z.string().default(''),
    contractor: z.object({
      printed_name: z.string().default(''),
      signed_at: z.string().nullable().default(null),
    }).default({}),
    homeowner: z.object({
      printed_name: z.string().default(''),
      signed_at: z.string().nullable().default(null),
      dated: z.string().default(''),
    }).default({}),
  }).default({}),
});

// ────────────────────────────────────────────────────────────────
// Invoice payload
// ────────────────────────────────────────────────────────────────

export const InvoicePayload = z.object({
  invoice_number: z.string().default(''),
  invoice_date: z.string().default(''),
  due_date: z.string().default(''),
  contract_ref: z.string().default(''),
  milestone_label: z.string().default(''),
  milestone_condition: z.string().default(''),
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'void']).default('draft'),

  bill_to: z.object({
    client_name: z.string().default(''),
    property_address: z.string().default(''),
    recipient_email: z.string().default(''),
    recipient_phone: z.string().default(''),
  }).default({}),

  contractor: ContractorInfo.default({}),

  // Contract totals for reference
  contract: z.object({
    total_cents: z.number().nonnegative().default(0),
    labor_cost_cents: z.number().nonnegative().default(0),
    materials_cost_cents: z.number().nonnegative().default(0),
  }).default({}),

  // This milestone
  milestone: z.object({
    percent: z.number().min(0).max(100).default(0),
    subtotal_cents: z.number().nonnegative().default(0),
    labor_portion_cents: z.number().nonnegative().default(0),
    materials_portion_cents: z.number().nonnegative().default(0),
  }).default({}),

  // Itemised work covered
  line_items: z.array(z.object({
    desc: z.string().default(''),
    qty: z.number().nonnegative().default(1),
    rate_cents: z.number().nonnegative().default(0),
    amount_cents: z.number().nonnegative().default(0),
  })).default([]),

  // Prior payments received before this invoice
  prior_payments: z.array(z.object({
    label: z.string().default(''),
    date: z.string().default(''),
    amount_cents: z.number().nonnegative().default(0),
  })).default([]),

  // Tax settings
  tax: z.object({
    rate_percent: z.number().min(0).max(100).default(6.625),
    applies_to: z.enum(['materials_only', 'total', 'none']).default('materials_only'),
    amount_cents: z.number().nonnegative().default(0),
  }).default({}),

  totals: z.object({
    subtotal_cents: z.number().nonnegative().default(0),
    tax_cents: z.number().nonnegative().default(0),
    total_due_cents: z.number().nonnegative().default(0),
    remaining_after_cents: z.number().nonnegative().default(0),
  }).default({}),

  invoice_terms: z.object({ text: z.string().default('') }).default({}),
  payment_methods: z.array(z.string()).default([]),
  include_cost_analysis: z.boolean().default(false),
});

// ────────────────────────────────────────────────────────────────
// Document envelope
// ────────────────────────────────────────────────────────────────

export const DocumentTemplate = z.enum(['contract', 'invoice']);
export const DocumentStatus   = z.enum(['draft', 'sent', 'signed', 'paid', 'overdue', 'void']);

export const DocumentEnvelope = z.object({
  id: z.string().uuid(),
  doc_number: z.string(),
  template: DocumentTemplate,
  status: DocumentStatus,
  title: z.string().nullable(),
  client_name: z.string().nullable(),
  client_email: z.string().nullable(),
  project_ref: z.string().nullable(),
  total_cents: z.number(),
  payload: z.union([ContractPayload, InvoicePayload]),
  locks: z.record(z.boolean()).default({}),
  created_at: z.string(),
  updated_at: z.string(),
  pdf_object_key: z.string().nullable().optional(),
  pdf_generated_at: z.string().nullable().optional(),
});

export function payloadSchemaFor(template) {
  return template === 'contract' ? ContractPayload : InvoicePayload;
}
