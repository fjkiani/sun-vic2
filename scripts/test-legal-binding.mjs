// Proves the Legal tab is wired to fields that actually exist and actually print.
//
// The bug this exists to prevent: the old editor rendered one textarea per section at
// `<key>.text`. For `permits` and `dispute_resolution` that path does not exist — the real
// shapes are {intro, contractor_responsible, homeowner_responsible} and
// {intro, steps[], footer}. Both boxes rendered empty, every keystroke wrote a junk key,
// the save returned 200, and the printed contract was unchanged. Nothing failed loudly.
//
// Three independent checks close that hole for every path:
//   (a) the path list in legalMeta.js matches what the JSX literally writes,
//   (b) the path resolves in the Zod schema,
//   (c) the path is read by the contract PDF renderer.
// Check (c) also asserts each PDF local alias declaration still exists, so renaming
// `const perm = payload.permits` breaks this test instead of silently breaking Section G.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ContractPayload, InvoicePayload } from '../packages/schema/documents.js';
import { schemaHasPath, extractWrittenPaths, listSchemaPaths } from '../packages/schema/paths.js';
import {
  LEGAL_BLOCK_META,
  ALL_LEGAL_PATHS,
  INVOICE_LEGAL_BLOCKS,
  legalBlocksFor,
} from '../src/components/editors/legal/legalMeta.js';
import { LEGAL_TABS, blocksFor } from '../src/components/doc/docSections.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const editorSrc = readFileSync(join(root, 'src/components/editors/LegalEditor.jsx'), 'utf8');
const contractPdfSrc = readFileSync(join(root, 'packages/templates/pdf/ContractPDF.jsx'), 'utf8');
const invoicePdfSrc = readFileSync(join(root, 'packages/templates/pdf/InvoicePDF.jsx'), 'utf8');

let pass = 0;
const failures = [];
function ok(cond, label, detail = '') {
  if (cond) { pass += 1; return; }
  failures.push(detail ? `${label} — ${detail}` : label);
}

// ── The alias map ContractPDF uses internally ────────────────
// The renderer destructures the big legal blocks into short locals. A path check that
// only looked for `payload.warranties.text` would report a false failure, so the test has
// to know the same aliases the renderer uses — and verify they are still declared.
const PDF_ALIASES = {
  timeline: 't',
  warranties: 'w',
  permits: 'perm',
  insurance: 'ins',
  dispute_resolution: 'd',
  right_to_cancel: 'r',
  signature: 'sig',
};

for (const [block, alias] of Object.entries(PDF_ALIASES)) {
  const decl = new RegExp(`const\\s+${alias}\\s*=\\s*payload\\.${block}\\b`);
  ok(decl.test(contractPdfSrc), `ContractPDF declares "const ${alias} = payload.${block}"`);
}

/** Build a matcher for a payload path as the PDF would spell it (optional chaining allowed). */
function pdfReadsPath(src, path) {
  const [head, ...rest] = path.split('.');
  const alias = PDF_ALIASES[head];
  const lead = alias ? alias : `payload\\??\\.${head}`;
  const tail = rest.map((seg) => `\\??\\.\\s*${seg}`).join('');
  return new RegExp(`\\b${lead}${tail}\\b`).test(src);
}

// ── (a) legalMeta path list === what the JSX writes ──────────
const written = extractWrittenPaths(editorSrc);
const declared = [...new Set(ALL_LEGAL_PATHS)].sort();

for (const p of declared) {
  ok(written.includes(p), `LegalEditor.jsx writes declared path "${p}"`,
    `declared in legalMeta but not found in the JSX`);
}
for (const p of written) {
  ok(declared.includes(p), `Written path "${p}" is declared in legalMeta`,
    `the JSX writes it but legalMeta does not list it, so it escapes schema + PDF checks`);
}

// ── (b) every declared path resolves in the schema ───────────
const allContractPaths = listSchemaPaths(ContractPayload);
for (const p of declared) {
  ok(schemaHasPath(ContractPayload, p), `Schema has "${p}"`,
    `not in ContractPayload; nearest leaves: ${allContractPaths.filter((x) => x.endsWith(`.${p.split('.').pop()}`)).slice(0, 3).join(', ') || 'none'}`);
}

// ── (c) every declared path is read by the PDF ───────────────
for (const p of declared) {
  ok(pdfReadsPath(contractPdfSrc, p), `ContractPDF reads "${p}"`,
    `the editor can change it but the printed contract never shows it`);
}

// ── the two paths that caused the original bug ───────────────
// Belt and braces: assert the dead paths are gone AND that they were genuinely invalid,
// so this test would have failed on the old code rather than passing vacuously.
for (const dead of ['permits.text', 'dispute_resolution.text']) {
  ok(!written.includes(dead), `LegalEditor no longer writes "${dead}"`);
  ok(!schemaHasPath(ContractPayload, dead), `"${dead}" genuinely does not exist in the schema`,
    `if this fails the regression test is not proving what it claims`);
}
// ...and the real shapes it should have been using all along.
for (const real of ['permits.intro', 'permits.contractor_responsible', 'permits.homeowner_responsible',
  'dispute_resolution.intro', 'dispute_resolution.steps', 'dispute_resolution.footer']) {
  ok(schemaHasPath(ContractPayload, real), `Real path "${real}" exists`);
}

// ── deliberate exclusions stay excluded ──────────────────────
// These are stored but the PDF prints fixed canonical language they do not drive. Showing
// them would let a user change a number and see nothing happen on the contract.
const DELIBERATELY_EXCLUDED = [
  'warranties.one_year_workmanship',
  'insurance.coverage_certificate_available',
  'right_to_cancel.cancellation_deadline_days',
  'signature.contractor.signed_at',
  'signature.homeowner.signed_at',
  'signature.homeowner.dated',
];
for (const p of DELIBERATELY_EXCLUDED) {
  ok(schemaHasPath(ContractPayload, p), `Excluded path "${p}" exists in the schema (exclusion is a choice, not a typo)`);
  ok(!declared.includes(p), `Excluded path "${p}" is not exposed by the editor`);
}

// ── every printing legal section now has an editor ───────────
// Five sections printed but had no editor at all before this iteration.
const PREVIOUSLY_UNREACHABLE = ['change_orders', 'unforeseen', 'material_selection', 'invoice_terms', 'signature'];
for (const block of PREVIOUSLY_UNREACHABLE) {
  ok(Object.prototype.hasOwnProperty.call(LEGAL_BLOCK_META, block), `Block "${block}" now has an editor`);
  ok((LEGAL_BLOCK_META[block]?.paths || []).length > 0, `Block "${block}" exposes at least one path`);
}

// ── sub-tab routing covers every block exactly once ──────────
const blocksInTabs = LEGAL_TABS.flatMap((t) => t.blocks);
for (const id of Object.keys(LEGAL_BLOCK_META)) {
  const hits = blocksInTabs.filter((b) => b === id).length;
  ok(hits === 1, `Block "${id}" appears in exactly one legal sub-tab`, `appears ${hits} times`);
}
for (const b of blocksInTabs) {
  ok(Object.prototype.hasOwnProperty.call(LEGAL_BLOCK_META, b), `Sub-tab block "${b}" has metadata`,
    `LEGAL_TABS routes to a block the editor cannot render`);
}

// ── per-tab filtering returns a non-empty, correct subset ────
for (const tab of LEGAL_TABS) {
  const got = legalBlocksFor('contract', blocksFor(LEGAL_TABS, tab.id));
  ok(got.length > 0, `Legal sub-tab "${tab.id}" renders at least one block`);
  ok(got.every((b) => tab.blocks.includes(b)), `Legal sub-tab "${tab.id}" renders only its own blocks`,
    `got ${got.join(',')} expected subset of ${tab.blocks.join(',')}`);
}
ok(legalBlocksFor('contract', null).length === Object.keys(LEGAL_BLOCK_META).length,
  'No section filter renders every contract legal block');

// ── invoices ─────────────────────────────────────────────────
// The whole legal tab used to be hidden for invoices, so invoice_terms was unreachable
// even though it prints on the invoice.
ok(legalBlocksFor('invoice', null).join(',') === 'invoice_terms',
  'Invoices expose only the invoicing terms block');
for (const tab of LEGAL_TABS) {
  const got = legalBlocksFor('invoice', blocksFor(LEGAL_TABS, tab.id));
  const expected = tab.blocks.includes('invoice_terms') ? ['invoice_terms'] : [];
  ok(got.join(',') === expected.join(','), `Invoice legal sub-tab "${tab.id}" resolves correctly`,
    `got [${got.join(',')}] expected [${expected.join(',')}]`);
}
for (const p of INVOICE_LEGAL_BLOCKS.flatMap((b) => LEGAL_BLOCK_META[b].paths)) {
  ok(schemaHasPath(InvoicePayload, p), `Invoice schema has "${p}"`);
  ok(pdfReadsPath(invoicePdfSrc, p) || pdfReadsPath(contractPdfSrc, p),
    `"${p}" is read by a PDF renderer`);
}

// ── metadata completeness ────────────────────────────────────
for (const [id, meta] of Object.entries(LEGAL_BLOCK_META)) {
  ok(typeof meta.title === 'string' && meta.title.length > 0, `Block "${id}" has a title`);
  ok(typeof meta.plain === 'string' && meta.plain.length > 0, `Block "${id}" has a plain-English subtitle`);
  ok(typeof meta.help === 'string' && meta.help.length > 0, `Block "${id}" has help text`);
  ok(Array.isArray(meta.paths) && meta.paths.length > 0, `Block "${id}" declares paths`);
  ok(meta.paths.every((p) => p.startsWith(`${id}.`)), `Block "${id}" only declares its own paths`,
    `stray: ${meta.paths.filter((p) => !p.startsWith(`${id}.`)).join(', ')}`);
}

// ── no duplicate paths across blocks ─────────────────────────
ok(new Set(ALL_LEGAL_PATHS).size === ALL_LEGAL_PATHS.length, 'No path is claimed by two blocks',
  `duplicates: ${ALL_LEGAL_PATHS.filter((p, i) => ALL_LEGAL_PATHS.indexOf(p) !== i).join(', ')}`);

// ── report ───────────────────────────────────────────────────
for (const f of failures) console.error(`FAIL  ${f}`);
console.log(`\ntest-legal-binding: PASS ${pass} FAIL ${failures.length}`);
process.exit(failures.length === 0 ? 0 : 1);
