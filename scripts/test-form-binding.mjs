// Regression tests for the document forms.
//
// The point of this file is the binding check: it reads the editor source, extracts every
// payload path the editor writes, and proves each one exists in the Zod schema. That is
// the test that would have caught `contractor.name`, `contractor.license_no`,
// `bill_to.client_address`, `project_ref`, `tax_rate_percent` and `notes` — six fields the
// UI happily accepted and then threw away.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { ContractPayload, InvoicePayload } from '../packages/schema/documents.js';
import { schemaHasPath, listSchemaPaths, extractWrittenPaths, suggestClosest } from '../packages/schema/paths.js';
import { CONTRACT_FORM_TABS, INVOICE_FORM_TABS, LEGAL_TABS, formTabsFor, blocksFor } from '../src/components/doc/docSections.js';
import { scheduleSum, scheduleBalanced, laborMaterialsDrift, deriveInvoiceTotals, lineItemAmount } from '../src/components/editors/formMath.js';
import { DEFAULT_SCOPE_QTY } from '../packages/templates/defaults.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}
function eq(name, actual, expected) {
  ok(name, Object.is(actual, expected), `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}
function section(t) { console.log(`\n${t}`); }

// ── 1. the typo must be gone everywhere ──────────────────────

section('no misspelled quantity anywhere in the tree');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'dist') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (['.js', '.jsx', '.mjs', '.ts', '.tsx'].includes(extname(name))) out.push(full);
  }
  return out;
}

const SELF = resolve(ROOT, 'scripts/test-form-binding.mjs');
const BAD = ['Lump', 'Sump'].join(' ');
const offenders = walk(join(ROOT, 'src'))
  .concat(walk(join(ROOT, 'packages')))
  .concat(walk(join(ROOT, 'netlify')))
  .filter((f) => f !== SELF)
  .filter((f) => readFileSync(f, 'utf8').includes(BAD))
  .map((f) => f.slice(ROOT.length + 1));

ok(`"${BAD}" appears in zero source files`, offenders.length === 0, offenders.join(', '));
eq('canonical quantity label', DEFAULT_SCOPE_QTY, 'Lump Sum');

// ── 2. every path the forms write must exist in the schema ───

section('form editors write only paths that exist in the schema');

const contractSrc = readFileSync(join(ROOT, 'src/components/editors/ContractFormEditor.jsx'), 'utf8');
const invoiceSrc  = readFileSync(join(ROOT, 'src/components/editors/InvoiceFormEditor.jsx'), 'utf8');

const contractPaths = extractWrittenPaths(contractSrc);
const invoicePaths  = extractWrittenPaths(invoiceSrc);

ok('contract editor writes a non-trivial number of paths', contractPaths.length >= 20, `found ${contractPaths.length}`);
ok('invoice editor writes a non-trivial number of paths', invoicePaths.length >= 12, `found ${invoicePaths.length}`);

const contractSchemaPaths = listSchemaPaths(ContractPayload);
for (const p of contractPaths) {
  ok(`contract path exists: ${p}`, schemaHasPath(ContractPayload, p),
     `did you mean ${suggestClosest(p, contractSchemaPaths).join(' / ') || '(no near match)'}?`);
}

const invoiceSchemaPaths = listSchemaPaths(InvoicePayload);
for (const p of invoicePaths) {
  ok(`invoice path exists: ${p}`, schemaHasPath(InvoicePayload, p),
     `did you mean ${suggestClosest(p, invoiceSchemaPaths).join(' / ') || '(no near match)'}?`);
}

// The specific dead paths that shipped. Asserted by name so a revert is caught loudly.
section('previously dead paths stay dead');
for (const dead of ['contractor.name', 'contractor.license_no']) {
  ok(`contract editor no longer writes ${dead}`, !contractPaths.includes(dead));
  ok(`${dead} is genuinely absent from the schema`, !schemaHasPath(ContractPayload, dead));
}
for (const dead of ['bill_to.client_address', 'project_ref', 'tax_rate_percent', 'notes']) {
  ok(`invoice editor no longer writes ${dead}`, !invoicePaths.includes(dead));
}
ok('contract editor writes contractor.legal_name', contractPaths.includes('contractor.legal_name'));
ok('contract editor writes contractor.license_number', contractPaths.includes('contractor.license_number'));
ok('invoice editor writes bill_to.property_address', invoicePaths.includes('bill_to.property_address'));

// ── 3. the PDF must actually read what the editors write ─────

section('contract PDF reads the fields the form edits');
const pdfSrc = readFileSync(join(ROOT, 'packages/templates/pdf/ContractPDF.jsx'), 'utf8');
for (const leaf of ['legal_name', 'license_number', 'contract_type', 'start_date', 'total_cents']) {
  ok(`ContractPDF references ${leaf}`, pdfSrc.includes(leaf));
}
ok('ContractPDF prints permits.intro', /perm\.intro/.test(pdfSrc));
ok('signature heading is spelled correctly', pdfSrc.includes('title="SIGNATURE"') && !pdfSrc.includes('SINGNATURE'));

const invPdfSrc = readFileSync(join(ROOT, 'packages/templates/pdf/InvoicePDF.jsx'), 'utf8');
for (const leaf of ['property_address', 'contract_ref', 'rate_cents', 'total_due_cents']) {
  ok(`InvoicePDF references ${leaf}`, invPdfSrc.includes(leaf));
}

// ── 4. sub-tab slicing ───────────────────────────────────────

section('sub-tab slicing');
eq('contract template picks contract tabs', formTabsFor('contract'), CONTRACT_FORM_TABS);
eq('invoice template picks invoice tabs', formTabsFor('invoice'), INVOICE_FORM_TABS);
eq('desktop (no section) renders everything', blocksFor(CONTRACT_FORM_TABS, null), null);
eq('unknown section falls back to everything', blocksFor(CONTRACT_FORM_TABS, 'nope'), null);
ok('scope tab yields scope blocks',
   JSON.stringify(blocksFor(CONTRACT_FORM_TABS, 'scope')) === JSON.stringify(['agreement_summary', 'scope_of_work']));
ok('payment tab yields exactly payment', JSON.stringify(blocksFor(CONTRACT_FORM_TABS, 'payment')) === JSON.stringify(['payment']));

const contractBlocks = CONTRACT_FORM_TABS.flatMap((t) => t.blocks);
ok('no contract block appears in two sub-tabs', new Set(contractBlocks).size === contractBlocks.length);
const legalBlocks = LEGAL_TABS.flatMap((t) => t.blocks);
ok('no legal block appears in two sub-tabs', new Set(legalBlocks).size === legalBlocks.length);

// Every block the contract editor knows how to render must be claimed by some sub-tab,
// otherwise a phone user can never reach it.
const rendered = ['cover', 'homeowner', 'contractor', 'agreement_summary', 'scope_of_work', 'payment', 'timeline'];
for (const b of rendered) ok(`block "${b}" is reachable from a sub-tab`, contractBlocks.includes(b));

// ── 5. arithmetic ────────────────────────────────────────────

section('payment schedule arithmetic');
const sunvic = [
  { milestone: 'Deposit', percent: 15 }, { milestone: 'Progress (1)', percent: 20 },
  { milestone: 'Progress (2)', percent: 30 }, { milestone: 'Progress (3)', percent: 15 },
  { milestone: 'Progress (4)', percent: 15 }, { milestone: 'Final', percent: 5 },
];
eq('standard Sunvic schedule sums to 100', scheduleSum(sunvic), 100);
ok('standard schedule is balanced', scheduleBalanced(sunvic));
ok('99.9% is not balanced', !scheduleBalanced([{ percent: 99.9 }]));
ok('100.1% is not balanced', !scheduleBalanced([{ percent: 100.1 }]));
ok('100.005% is within tolerance', scheduleBalanced([{ percent: 100.005 }]));
eq('empty schedule sums to 0', scheduleSum([]), 0);
eq('null schedule sums to 0', scheduleSum(null), 0);
eq('non-numeric percents are ignored', scheduleSum([{ percent: 'x' }, { percent: 50 }]), 50);

section('labor + materials reconciliation');
eq('exact split has no drift', laborMaterialsDrift({ labor_cost_cents: 4550000, materials_cost_cents: 1950000, total_cents: 6500000 }), 0);
eq('over-allocation reports positive drift', laborMaterialsDrift({ labor_cost_cents: 5000000, materials_cost_cents: 2000000, total_cents: 6500000 }), 500000);
eq('under-allocation reports negative drift', laborMaterialsDrift({ labor_cost_cents: 4000000, materials_cost_cents: 2000000, total_cents: 6500000 }), -500000);
eq('unsplit contract is not flagged', laborMaterialsDrift({ total_cents: 6500000 }), 0);
eq('missing payment object is safe', laborMaterialsDrift(undefined), 0);

section('invoice totals');
const inv = {
  contract: { total_cents: 6500000 },
  milestone: { percent: 20, materials_portion_cents: 390000 },
  tax: { rate_percent: 6.625, applies_to: 'materials_only' },
  line_items: [
    { desc: 'Framing', qty: 1, rate_cents: 900000, amount_cents: 900000 },
    { desc: 'Rough electrical', qty: 1, rate_cents: 400000, amount_cents: 400000 },
  ],
  prior_payments: [{ label: 'Deposit', amount_cents: 975000 }],
};
const d = deriveInvoiceTotals(inv);
eq('subtotal is the sum of the lines', d['totals.subtotal_cents'], 1300000);
eq('NJ tax applies to materials only', d['tax.amount_cents'], Math.round(390000 * 6.625 / 100));
eq('total due is subtotal plus tax', d['totals.total_due_cents'], 1300000 + Math.round(390000 * 6.625 / 100));
eq('remaining nets out prior payments', d['totals.remaining_after_cents'], 6500000 - 975000 - d['totals.total_due_cents']);

const noTax = deriveInvoiceTotals({ ...inv, tax: { rate_percent: 6.625, applies_to: 'none' } });
eq('applies_to none charges no tax', noTax['tax.amount_cents'], 0);
const wholeTax = deriveInvoiceTotals({ ...inv, tax: { rate_percent: 10, applies_to: 'total' } });
eq('applies_to total taxes the subtotal', wholeTax['tax.amount_cents'], 130000);
const noLines = deriveInvoiceTotals({ milestone: { subtotal_cents: 500000 }, tax: { rate_percent: 0, applies_to: 'none' } });
eq('falls back to the milestone subtotal when there are no lines', noLines['totals.subtotal_cents'], 500000);
eq('remaining never goes negative', deriveInvoiceTotals({ contract: { total_cents: 100 }, milestone: { subtotal_cents: 900000 } })['totals.remaining_after_cents'], 0);
eq('empty payload is safe', deriveInvoiceTotals({})['totals.total_due_cents'], 0);
eq('undefined payload is safe', deriveInvoiceTotals(undefined)['totals.total_due_cents'], 0);

eq('line amount is qty times rate', lineItemAmount({ qty: 3, rate_cents: 12500 }), 37500);
eq('fractional qty rounds to whole cents', lineItemAmount({ qty: 2.5, rate_cents: 3333 }), 8333);
eq('missing qty is zero', lineItemAmount({ rate_cents: 5000 }), 0);

// ── 6. schema path walker sanity ─────────────────────────────

section('schema path walker');
ok('finds a nested leaf', schemaHasPath(ContractPayload, 'homeowner.name'));
ok('finds a top-level leaf', schemaHasPath(ContractPayload, 'job_no'));
ok('finds an object node', schemaHasPath(ContractPayload, 'payment'));
ok('walks into an array element', schemaHasPath(ContractPayload, 'payment.schedule.percent'));
ok('walks an array by index', schemaHasPath(ContractPayload, 'payment.schedule.0.milestone'));
ok('rejects a nonexistent leaf', !schemaHasPath(ContractPayload, 'homeowner.middle_name'));
ok('rejects a nonexistent branch', !schemaHasPath(ContractPayload, 'nope.nope'));
ok('rejects the permits.text bug', !schemaHasPath(ContractPayload, 'permits.text'));
ok('rejects the dispute_resolution.text bug', !schemaHasPath(ContractPayload, 'dispute_resolution.text'));
ok('warranties.text is real', schemaHasPath(ContractPayload, 'warranties.text'));

section('path extractor');
const sample = `
  set('a.b', v);
  onSave('c_d', v);
  onSave({ 'e.f_g': 1, 'h': 2 });
  set(\`skip.\${x}\`, v);
`;
const got = extractWrittenPaths(sample);
ok('extracts set() paths', got.includes('a.b'));
ok('extracts onSave() positional paths', got.includes('c_d'));
ok('extracts patch-object keys', got.includes('e.f_g'));
ok('ignores template-literal paths', !got.some((p) => p.startsWith('skip')));

console.log(`\nPASS ${pass} FAIL ${fail}`);
process.exit(fail === 0 ? 1 && 0 : 1);
