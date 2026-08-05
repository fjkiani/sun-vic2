// Canonical description of every legal block the editor can reach.
//
// `paths` is the contract this module makes with the rest of the app: these are the exact
// payload paths the legal editor writes. A test cross-checks the list three ways — every
// path must (a) match what the JSX actually writes, (b) resolve in the Zod schema, and
// (c) be read by the contract PDF renderer.
//
// That third check is the important one. The previous editor rendered one textarea per
// section at `<key>.text` for warranties, permits, insurance, dispute_resolution and
// right_to_cancel. Two of those five paths do not exist: `permits` is
// {intro, contractor_responsible, homeowner_responsible} and `dispute_resolution` is
// {intro, steps, footer}. Those two boxes rendered empty and wrote junk keys the PDF
// never read. Meanwhile five sections that *do* print — change_orders, unforeseen,
// material_selection, invoice_terms, signature — had no editor at all.
//
// Deliberately NOT editable, because the value is stored but the PDF prints fixed
// canonical language that the field does not drive. Exposing them would be a trap: the
// user changes the number, nothing changes on the contract.
//   warranties.one_year_workmanship
//   insurance.coverage_certificate_available
//   right_to_cancel.cancellation_deadline_days
//   signature.contractor.signed_at / signature.homeowner.signed_at
// `signature.homeowner.dated` is printed, but it is signing metadata captured at
// execution time rather than something the author fills in beforehand.

export const LEGAL_BLOCK_META = {
  permits: {
    title: 'Permits',
    plain: 'Who pulls the permits',
    help: 'New Jersey requires the contract to say who is responsible for permits. Tick one.',
    paths: ['permits.intro', 'permits.contractor_responsible', 'permits.homeowner_responsible'],
  },
  change_orders: {
    title: 'Changes to the work',
    plain: 'What happens if the job changes',
    help: 'How additions or substitutions are priced and approved once work has started.',
    paths: ['change_orders.text'],
  },
  material_selection: {
    title: 'Materials and brands',
    plain: 'How materials get chosen',
    help: 'Covers brand substitution and who decides when a specified product is unavailable.',
    paths: ['material_selection.text'],
  },
  invoice_terms: {
    title: 'Invoicing and late payment',
    plain: 'When invoices are due',
    help: 'Payment window, late fees and what happens if a payment is missed.',
    paths: ['invoice_terms.text'],
  },
  warranties: {
    title: 'Warranties',
    plain: 'What is guaranteed, and for how long',
    help: 'Sunvic warrants workmanship for one year. Manufacturer warranties pass through to the homeowner.',
    paths: ['warranties.text', 'warranties.start_text', 'warranties.materials_text'],
  },
  insurance: {
    title: 'Insurance',
    plain: 'Coverage carried on this job',
    help: 'General liability and workers compensation. A certificate is available on request.',
    paths: ['insurance.text'],
  },
  unforeseen: {
    title: 'Unforeseen conditions',
    plain: 'Hidden damage found after demolition',
    help: 'Two options are printed on the contract; the homeowner picks one when the situation arises.',
    paths: ['unforeseen.text', 'unforeseen.option_1', 'unforeseen.option_2'],
  },
  right_to_cancel: {
    title: 'Right to cancel',
    plain: 'The three-day cancellation notice',
    help: 'Required by the New Jersey Home Improvement Contract Act. Changing this wording carries legal risk.',
    paths: ['right_to_cancel.text'],
  },
  dispute_resolution: {
    title: 'Dispute resolution',
    plain: 'How disagreements are settled',
    help: 'The escalation ladder — direct discussion, then mediation, then arbitration.',
    paths: ['dispute_resolution.intro', 'dispute_resolution.steps', 'dispute_resolution.footer'],
  },
  signature: {
    title: 'Signature page',
    plain: 'Who signs',
    help: 'Printed names as they should appear. Dates are captured when the document is actually signed.',
    paths: ['signature.intro', 'signature.contractor.printed_name', 'signature.homeowner.printed_name'],
  },
};

// Invoices carry only the invoicing terms; the rest of the contract legal apparatus does
// not apply. Previously the whole legal tab was hidden for invoices, so invoice_terms was
// unreachable even though it prints on the invoice.
export const INVOICE_LEGAL_BLOCKS = ['invoice_terms'];

export function legalBlocksFor(template, allowedBlocks) {
  const universe = template === 'invoice' ? INVOICE_LEGAL_BLOCKS : Object.keys(LEGAL_BLOCK_META);
  if (!allowedBlocks) return universe;
  return universe.filter((id) => allowedBlocks.includes(id));
}

/** Every path the legal editor is allowed to write, flattened. */
export const ALL_LEGAL_PATHS = Object.values(LEGAL_BLOCK_META).flatMap((m) => m.paths);
