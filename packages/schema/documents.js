// Sunvic Documents — canonical schemas (Zod).
// Shared by the frontend, backend, and agent worker so payload shape is enforced everywhere.

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

export const Phase = z.object({
  id: z.string().default(''), // e.g. phase-1
  title: z.string().default(''),
  description: z.string().default(''),
  sqft: z.number().nonnegative().default(0),
  items: z.array(LineItem).default([]),
  excluded: z.boolean().default(false),
  manual_phase_cost: z.number().nullable().default(null),
  manual_cost_per_sqft: z.number().nullable().default(null),
});

export const ContractorInfo = z.object({
  legal_name: z.string().default('Sunvic, LLC Contractors'),
  address: z.string().default('6 Stone Ridge Rd, Old Bridge, NJ 08857'),
  phone: z.string().default('+1 (732) 824-9203'),
  email: z.string().email().default('sunvicnj@gmail.com'),
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
});

// ────────────────────────────────────────────────────────────────
// Contract payload
// ────────────────────────────────────────────────────────────────

export const ContractPayload = z.object({
  contractor: ContractorInfo.default({}),
  homeowner: HomeownerInfo.default({}),
  contract_type: z.enum(['home_improvement', 'new_construction', 'repair']).default('home_improvement'),
  agreement_summary: z.string().default(''),
  scope_of_work: z.object({
    phases: z.array(Phase).default([]),
  }).default({ phases: [] }),
  payment: z.object({
    total_cents: z.number().nonnegative().default(0),
    schedule: z.array(PaymentMilestone).default([
      { milestone: 'Deposit on signing',          percent: 10 },
      { milestone: 'Rough-in complete',           percent: 30 },
      { milestone: 'Drywall + MEP inspections',   percent: 30 },
      { milestone: 'Substantial completion',      percent: 25 },
      { milestone: 'Final punch-list + sign-off', percent: 5 },
    ]),
    method: z.enum(['check', 'ach', 'card']).default('check'),
    notes: z.string().default(''),
  }).default({}),
  timeline: z.object({
    start_date: z.string().nullable().default(null),
    substantial_completion_date: z.string().nullable().default(null),
    final_completion_date: z.string().nullable().default(null),
  }).default({}),
  warranties: z.object({
    text: z.string().default(''),
    one_year_workmanship: z.boolean().default(true),
  }).default({}),
  permits: z.object({
    text: z.string().default(''),
    responsible_party: z.enum(['contractor', 'homeowner']).default('contractor'),
  }).default({}),
  insurance: z.object({
    text: z.string().default(''),
    coverage_certificate_available: z.boolean().default(true),
  }).default({}),
  dispute_resolution: z.object({
    text: z.string().default(''),
    venue: z.string().default('New Jersey'),
  }).default({}),
  right_to_cancel: z.object({
    text: z.string().default(''),
    cancellation_deadline_days: z.number().default(3),
  }).default({}),
  signatures: z.object({
    contractor: z.object({
      signed_at: z.string().nullable().default(null),
      signer_name: z.string().default(''),
    }).default({}),
    homeowner: z.object({
      signed_at: z.string().nullable().default(null),
      signer_name: z.string().default(''),
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
  project_ref: z.string().default(''),
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'void']).default('draft'),
  bill_to: z.object({
    client_name: z.string().default(''),
    client_address: z.string().default(''),
    recipient_name: z.string().default(''),
    recipient_email: z.string().default(''),
  }).default({}),
  contractor: ContractorInfo.default({}),
  phases: z.array(Phase).default([]),
  tax_rate_percent: z.number().min(0).max(100).default(0),
  notes: z.string().default(
    'Payment is due within 30 days. Please make checks payable to Sunvic Construction. Thank you for your business!'
  ),
  include_cost_analysis: z.boolean().default(true),
});

// ────────────────────────────────────────────────────────────────
// Document envelope (what /api/documents returns)
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
