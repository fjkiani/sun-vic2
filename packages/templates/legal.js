// Canonical Sunvic legal text — verbatim from the 10-page NJ Home Improvement Contract sample.
// Any deviation from the sample is a bug.

export const SUNVIC_CONTRACTOR = {
  legal_name: 'SUNVIC CONTRACTORS LLC',
  address: '6 Stone Ridge Rd.- Old Bridge - NJ - 08857',
  address_footer: '6 Stone Ridge Rd ,Old Bridge, NJ, 08857',
  phone: '+1 (732) 824-9203',
  email: 'Contact@sunvicnj.com',
  license_number: '13VH12429600',
  website: 'www.sunvicnj.com',
};

// A - Section 4 Agreement Summary (verbatim; blanks for homeowner name / weeks / months)
export const AGREEMENT_SUMMARY_BODY =
`This Agreement confirms that the Homeowner, {{HOMEOWNER_NAME}}, has engaged SUNVIC CONTRACTORS LLC to perform the work described in (Section-B) of this Agreement, with work expected to begin within {{WEEKS_TO_START}} weeks of receipt of the initial Deposit Payment, and to reach Substantial Completion within {{MONTHS_TO_COMPLETE}} months of the start date, unless delayed by approved Change Orders, unforeseen conditions, or force majeure events.

SUNVIC CONTRACTORS LLC may engage qualified subcontractors as needed. All subcontractors will be fully supervised by the company and must adhere to company standards for quality and compliance with all applicable codes and regulations. Furthermore, the Homeowner, {{HOMEOWNER_NAME}}, agrees to:
• Provide property access as needed to perform the work.
• Make payments according to the schedule outlined in (Section C).
• Approve all changes to the original scope of work through a written and signed Change Order prior to implementation.`;

// Section C Materials Options / Change Orders / Unforeseen — verbatim from page 7
export const MATERIAL_SELECTION_TEXT =
`⚠ The client may make selections for any materials or products used in the project only from options provided and approved by the contractor. These options will be presented during the construction phase and are determined based on availability, quality, compatibility, and adherence to the project's budget and schedule.

Any request by the client to use materials or brands outside of the approved list must be submitted in writing and may result in changes to the project's cost and/or schedule, subject to contractor approval.`;

export const CHANGES_TO_WORK_TEXT =
`⚠ Any additions, changes, or upgrades to the work to be performed or to the materials and products to be used, as described in Section-B, will require a written change order signed by all parties before proceeding.`;

export const UNFORESEEN_CONDITIONS_TEXT =
`⚠ If unforeseen conditions such as but not limited to hidden plumbing or electrical issues, mold, asbestos, code violations, or structural damage are discovered during the project and affect the contracted work, SUNVIC CONTRACTORS LLC will immediately STOP the contracted work and notify the Homeowner, who will then have TWO options :-`;

export const UNFORESEEN_OPTION_1_TEXT =
`(Option-1)
If the homeowner wishes to leave the issue as is, contracted Work will resume ONLY if the Homeowner signs a "No Objection to Proceed" form, accepting full responsibility for any future corrective actions or consequences and releasing SUNVIC CONTRACTORS LLC from liability related to the issue.`;

export const UNFORESEEN_OPTION_2_TEXT =
`(Option-2)
If the homeowner wishes to fix the issue, contracted work will resume ONLY if the Homeowner signs a Change Order detailing the additional costs or scope adjustments, approved by all parties.`;

// Section C invoice-terms paragraph — verbatim from page 8
export const INVOICE_TERMS_TEXT =
`By signing this agreement, the Homeowner, {{HOMEOWNER_NAME}}, agrees that all invoices must be paid within (1) business day of receipt. Failure to meet this obligation may result in the suspension of work by SUNVIC CONTRACTORS LLC without liability for any resulting delays. If payment is not made within a reasonable period, SUNVIC CONTRACTORS LLC reserves the right to terminate this Agreement and to place a lien on the property until the outstanding balance is paid in full.`;

export const PAYMENT_METHODS_LINES = [
  'Personal or Business Check (made payable to SUNVIC CONTRACTORS LLC)',
  'Credit or Debit Card (subject to a 4% processing fee)',
  'Bank Transfer (ACH or Wire Transfer)',
  'Cash (ONLY accepted with a signed receipt)',
];

// Section D — verbatim from page 9
export const TIMELINE_DISCLAIMER_TEXT =
`⚠ All timeline dates are estimates and may change due to unforeseen circumstances such as approved Change Orders, weather conditions, material availability, permit approvals, labor strikes, natural disasters, or other delays beyond the SUNVIC CONTRACTORS LLC's control. The Homeowner will be notified of any significant schedule changes, and any timeline modifications will be communicated and documented in writing if needed. The Homeowner agrees to provide SUNVIC CONTRACTORS LLC and its subcontractors access to the property from 8:00 AM to 5:00 PM, Monday through Friday, unless otherwise agreed. Delays due to restricted access or untimely approvals may lead to schedule changes and additional costs.`;

// Section E — verbatim from page 9
export const WARRANTIES_TEXT =
`By signing this agreement, the Homeowner, {{HOMEOWNER_NAME}}, agrees to a (1) one-year ( Workmanship Warranty ) from SUNVIC CONTRACTORS LLC, covering defects caused by faulty installation. This warranty is NOT a Material Warranty and does NOT cover damage from normal wear and tear, accidents, negligence, improper maintenance, unauthorized repairs, natural disasters, external factors, or pre-existing structural conditions beyond the scope of the work performed.`;

export const WARRANTIES_START_TEXT =
`⚠ The ( Workmanship Warranty ) starts on the date the Final Sign-Off form is signed. However, SUNVIC CONTRACTORS LLC will ONLY address warranty claims after the Final Payment has been fully received.`;

export const WARRANTIES_MATERIALS_TEXT =
`⚠ All available ( Manufacturer Warranty ) documentation will be provided to the Homeowner upon project completion. SUNVIC CONTRACTORS LLC does NOT offer additional warranties on materials beyond those provided by the manufacturers.`;

// Section F — verbatim from page 9
export const PERMITS_TEXT =
`(Check the appropriate box to indicate responsibility.)`;

export const PERMITS_OPTIONS = [
  'SUNVIC CONTRACTORS LLC is responsible for obtaining all required permits necessary for the work.',
  'The Homeowner is responsible for obtaining all required permits',
];

// Section G — verbatim from page 9
export const INSURANCE_TEXT =
`SUNVIC CONTRACTORS LLC maintains commercial general liability insurance of at least $500,000 per occurrence, as required by New Jersey law. A copy of the insurance certificate is attached to this agreement.`;

// Section H — verbatim from page 10
export const DISPUTE_RESOLUTION_INTRO =
`By signing this agreement, the Homeowner, {{HOMEOWNER_NAME}}, agrees that any dispute arising from or related to this Agreement shall be resolved as follows:`;

export const DISPUTE_RESOLUTION_STEPS = [
  { name: 'Mediation', text: 'All disputes under this contract will first be submitted to mediation in an effort to reach a mutual resolution.' },
  { name: 'Arbitration', text: 'If mediation fails, the dispute will proceed to binding arbitration in the State of New Jersey. The arbitrator\'s decision will be final and enforceable.' },
  { name: 'Litigation', text: 'If either party refuses arbitration or if arbitration is not feasible, the matter may be resolved through litigation in the courts of New Jersey.' },
];

export const DISPUTE_RESOLUTION_FOOTER =
`⚠ This Agreement shall be governed by and construed in accordance with the laws of the State of New Jersey. Any disputes shall be resolved in accordance with the Dispute Resolution Process described in this Agreement.`;

// Section I — verbatim from page 10
export const RIGHT_TO_CANCEL_TEXT =
`YOU MAY CANCEL THIS CONTRACT AT ANY TIME BEFORE MIDNIGHT OF THE THIRD BUSINESS DAY AFTER RECEIVING A COPY OF THIS CONTRACT. IF YOU WISH TO CANCEL THIS CONTRACT, YOU MUST EITHER:

SEND A SIGNED AND DATED WRITTEN NOTICE OF CANCELLATION BY REGISTERED OR CERTIFIED MAIL, RETURN RECEIPT REQUESTED; OR

PERSONALLY DELIVER A SIGNED AND DATED WRITTEN NOTICE OF CANCELLATION TO:
SUNVIC CONTRACTORS LLC
6 Stone Ridge Rd. ,Old Bridge,08857,NJ
+1 (732) 824-9203

If you cancel this contract within the three-day period, you are entitled to a full refund of your money.
Refunds must be made within 30 days of the contractor's receipt of the cancellation notice.`;

// Section J — verbatim from page 10
export const SIGNATURE_INTRO =
`⚠ This Agreement may be signed electronically and in counterparts.
By signing below, both parties acknowledge that they have read, understood, and agreed to the terms and conditions outlined in this Home Improvement Contract. This contract is binding upon execution by both parties.`;

// Payment schedule from sample page 8: Deposit 15 / P1 20 / P2 30 / P3 15 / P4 15 / Final 5
export const DEFAULT_PAYMENT_SCHEDULE = [
  { milestone: 'Deposit Payment',      percent: 15, condition: 'Due at contract signing' },
  { milestone: 'Progress Payment (1)', percent: 20, condition: 'Due upon foundation inspection approval' },
  { milestone: 'Progress Payment (2)', percent: 30, condition: 'Due upon MEP Rough-in inspection approval' },
  { milestone: 'Progress Payment (3)', percent: 15, condition: 'Due upon Insulation inspection approval' },
  { milestone: 'Progress Payment (4)', percent: 15, condition: 'Due at signing the final checklist' },
  { milestone: 'Final Payment',        percent: 5,  condition: 'Due at final Inspection approval' },
];

// Scope-of-work template groups (Category → Task → Description bullets)
export const DEFAULT_SCOPE_GROUPS = [
  {
    category: 'Demolition & Foundation',
    tasks: [
      {
        task: 'Demolition',
        description: [
          'Existing all siding',
          'Demo as per plan',
        ],
      },
      {
        task: 'Foundation',
        description: [
          'Excavation And Preparation.',
          'Placing Crushed Stone Drainage Layer Beneath Footings And Around Foundation.',
          'Rebar Installation for Footings and Foundation Walls.',
          'Concrete Pouring for Footings, Foundation Walls',
          'Installing Reinforced CMU Foundation Walls.',
          'Placing Compacted Crushed Stone Base Footings and slab',
          'Applying Waterproofing Membrane on Exterior Foundation Walls.',
          'Installing Vapor Barrier and wire mesh (Under New Basement Slab).',
          'Concrete Pouring and Finishing of Slab on grade.',
          'Inspection and approval.',
        ],
      },
    ],
  },
  {
    category: 'Exteriors',
    tasks: [
      {
        task: 'Framing',
        description: [
          'Layout And Measurement Of Framing Plans',
          'Installation Of Floor Joists And Subflooring',
          'Wall Framing (Studs, Plates, Headers, Sheathing)',
          'Roof Framing (Trusses, Rafters, Sheathing)',
          'Window And Door Rough Openings Framing',
          'Structural Connections And Bracing',
          'Installation Of Beams, Joists, Posts, columns as per plan',
          'Inspection And Approval Of Framing Work',
        ],
      },
      {
        task: 'Windows',
        description: [
          'Flashing And Waterproofing',
          'Window Unit Installation',
          'Insulation And Sealing',
          'Installing Exterior & Interior Trim',
        ],
      },
      {
        task: 'Exterior Doors',
        description: [
          'Flashing And Waterproofing',
          'Door Unit Installation',
          'Weatherproofing And Sealing',
          'Hardware Installation',
          'Installing Exterior Trim',
        ],
      },
      {
        task: 'Roofing System',
        description: [
          'Installing Underlayment',
          'Installing Starter Strip',
          'Installing Asphalt Shingles',
          'Installing Ridge Caps',
          'Installing Ice & Water Shield At Valleys And Eaves',
          'Installing Pipe Flashing (if needed)',
          'Installing Ridge Vent',
        ],
      },
      {
        task: 'Siding System / Gutters / Leaders',
        description: [
          'Installing Weather-Resistant Wrap',
          'Installing Starter Strips',
          'Installing Siding Panels',
          'Installing J-channel trim',
          'Installing outside corner trim',
          'Installing soffit panels',
          'Gutters and Leaders :-',
          'Installing Seamless Gutters',
          'Installing Downspouts (Leaders)',
          'Attach Gutter Hangers And Brackets',
        ],
      },
    ],
  },
  {
    category: 'Interiors',
    tasks: [
      {
        task: 'Drywall / Insulation',
        description: [
          'Installing Insulation In Walls And Ceilings',
          'Hanging Drywall Sheets On Walls And Ceilings',
          'Tape, Mud, And Sand Drywall Joints',
          'Preparing Surfaces For Painting Or Finishing',
        ],
      },
      {
        task: 'Painting',
        description: [
          'Priming New Drywall And Surfaces',
          'Applying finish coats on walls, ceilings, trim, and doors',
          'Painting touch-ups after final inspection',
        ],
      },
      {
        task: 'Flooring',
        description: [
          'Preparing Subfloor',
          'Installing Underlayment Or Moisture Barrier (if required)',
          'Installing Flooring material',
          'Installing Baseboards And Trim',
        ],
      },
      {
        task: 'Interior doors',
        description: [
          'Installing Door Frames And Jambs',
          'Hanging interior doors',
          'Installing Door Hardware',
          'Installing trim',
        ],
      },
      { task: 'Standard Closets', description: ['Installing Shelf And Rod System'] },
      { task: 'Pantry',           description: [] },
      { task: 'Bathroom',         description: [] },
      { task: 'Kitchen',          description: [] },
      { task: 'Countertop',       description: [] },
      { task: 'Island',           description: [] },
      { task: 'Crown molding',    description: [] },
      { task: 'Custom Lighting',  description: [] },
      { task: 'Stairs/Railing',   description: [] },
    ],
  },
  {
    category: 'MEP',
    tasks: [
      { task: 'Mechanical', description: [] },
      { task: 'Electrical', description: ['Electrical Panel/Wiring (Lighting, Switches, Outlets)'], qty: 'Limit Opt.' },
      { task: 'Plumbing',   description: ['Plumbing Pipes'], qty: 'Limit Opt.' },
    ],
  },
];

// Default lock state — everything legal is locked, homeowner + client fields open.
export const DEFAULT_CONTRACT_LOCKS = {
  'contractor.legal_name': true,
  'contractor.address': true,
  'contractor.phone': true,
  'contractor.email': true,
  'contractor.license_number': true,
  'contractor.website': true,
  'warranties.text': true,
  'warranties.start_text': true,
  'warranties.materials_text': true,
  'permits.intro': true,
  'insurance.text': true,
  'dispute_resolution.intro': true,
  'dispute_resolution.steps': true,
  'dispute_resolution.footer': true,
  'right_to_cancel.text': true,
  'signature.intro': true,
  'change_orders.text': true,
  'material_selection.text': true,
  'unforeseen.text': true,
  'unforeseen.option_1': true,
  'unforeseen.option_2': true,
  'timeline.disclaimer': true,
  'invoice_terms.text': true,
};

export const DEFAULT_INVOICE_LOCKS = {
  'contractor.legal_name': true,
  'contractor.license_number': true,
  'contractor.phone': true,
  'contractor.email': true,
  'contractor.website': true,
  'invoice_terms.text': true,
  'payment_methods.text': true,
};
