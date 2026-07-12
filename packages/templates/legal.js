// Canonical Sunvic legal text — the source of truth referenced by locked contract fields.
// Cloned from the 10-page Sunvic NJ Home Improvement Contract PDF.
// Edits require a code change (rare) — this is deliberate so no runtime path can mutate legal text.

export const SUNVIC_CONTRACTOR = {
  legal_name: 'Sunvic, LLC Contractors',
  address: '6 Stone Ridge Rd, Old Bridge, NJ 08857',
  phone: '+1 (732) 824-9203',
  email: 'sunvicnj@gmail.com',
  license_number: '13VH12429600',
  website: 'www.sunvicnj.com',
};

export const WARRANTIES_TEXT =
`Sunvic Construction warrants that all labor and workmanship provided under this Agreement will be free from defects for a period of one (1) year from the date of substantial completion.

Should any defects in our workmanship arise during this period, we will provide the labor and materials to correct the issue at no cost to the Homeowner. This warranty does not cover defects or damage caused by abuse, normal wear and tear, lack of maintenance, or issues arising from manufacturer's defects in materials (which are covered by their respective warranties).

Sunvic will use only high-quality, durable materials from reputable suppliers that meet or exceed the specifications outlined in the architectural plans. All construction will adhere strictly to the New Jersey Residential Site Improvement Standards and applicable local building codes.`;

export const PERMITS_TEXT =
`Sunvic Construction, as the licensed Home Improvement Contractor, will be responsible for obtaining all permits required by the municipality and the State of New Jersey for the scope of work described in this Agreement, unless otherwise noted in writing.

The Homeowner agrees to provide reasonable access to the property for permit inspections and to cooperate with any documentation required by the permitting authority. Permit fees are included in the project cost unless stated otherwise in the Payment Terms.`;

export const INSURANCE_TEXT =
`Sunvic Construction is fully licensed, insured, and bonded. Sunvic maintains comprehensive general liability insurance and workers' compensation coverage as required by the State of New Jersey.

A Certificate of Insurance naming the Homeowner as a certificate holder is available upon written request. Any subcontractors engaged by Sunvic will carry equivalent coverage or work under Sunvic's coverage as permitted by law.`;

export const DISPUTE_RESOLUTION_TEXT =
`Any dispute arising under this Agreement shall first be addressed by good-faith negotiation between the parties for a period of no less than thirty (30) days.

If the dispute cannot be resolved through negotiation, the parties agree to submit the matter to non-binding mediation with a mediator mutually agreed upon by both parties. Should mediation fail, any remaining dispute shall be resolved through binding arbitration under the rules of the American Arbitration Association, seated in New Jersey.

The prevailing party in any arbitration shall be entitled to recover reasonable attorneys' fees and costs. This Agreement shall be governed by and construed in accordance with the laws of the State of New Jersey.`;

export const RIGHT_TO_CANCEL_TEXT =
`THREE-DAY RIGHT TO CANCEL (New Jersey Home Improvement Contract Act).

You, the Homeowner, may cancel this Agreement at any time before midnight of the third (3rd) business day after the date on which you signed the Agreement. To cancel, you must provide written notice of cancellation to Sunvic, LLC Contractors at the address listed in this Agreement, either by mail, hand delivery, or email to sunvicnj@gmail.com, before midnight of the third business day.

If you cancel within this period, any payments made under the Agreement will be refunded within ten (10) business days, and any security interest arising out of the Agreement will be canceled. If you cancel, you must make available to Sunvic any goods delivered to you at your residence in substantially as good condition as when received.`;

export const AGREEMENT_SUMMARY_HEADER =
`This Home Improvement Contract (the "Agreement") is entered into between Sunvic, LLC Contractors ("Contractor") and the Homeowner identified in Section B, in accordance with the New Jersey Home Improvement Contract Act (N.J.S.A. 56:8-136 et seq.). The Contractor is a licensed Home Improvement Contractor in the State of New Jersey (License #13VH12429600) and agrees to perform the work described in the Scope of Work section under the terms and conditions set forth in this Agreement.`;

// Default lock state applied on Contract creation — legal blocks locked, scope + client fields unlocked.
export const DEFAULT_CONTRACT_LOCKS = {
  'contractor.legal_name': true,
  'contractor.address': true,
  'contractor.phone': true,
  'contractor.email': true,
  'contractor.license_number': true,
  'contractor.website': true,
  'warranties.text': true,
  'permits.text': true,
  'insurance.text': true,
  'dispute_resolution.text': true,
  'right_to_cancel.text': true,
};

// Invoice lock state — contact block locked, everything else open.
export const DEFAULT_INVOICE_LOCKS = {
  'contractor.legal_name': true,
  'contractor.license_number': true,
  'contractor.phone': true,
  'contractor.website': true,
};

// Payment schedule defaults matching the reference PDF (10/30/30/25/5).
export const DEFAULT_PAYMENT_SCHEDULE = [
  { milestone: 'Deposit on signing',          percent: 10 },
  { milestone: 'Rough-in complete',           percent: 30 },
  { milestone: 'Drywall + MEP inspections',   percent: 30 },
  { milestone: 'Substantial completion',      percent: 25 },
  { milestone: 'Final punch-list + sign-off', percent: 5 },
];
