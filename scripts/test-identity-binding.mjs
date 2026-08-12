// test-identity-binding.mjs — the company's own identity must be reachable from the payload.
//
// The bug this exists to prevent:
//   Both PDF templates dereferenced `contractor.address_footer` and printed it in the page
//   footer of every page of every document. `ContractorInfo` never declared that key, so zod
//   stripped it on create (documents.js:121) and again on every save (document.js:99). The
//   templates' `|| CONTRACTOR.address_footer` fallback then printed a frozen config constant.
//   Result: a string on all 7 pages that no form rendered, no click could resolve, and no
//   agent could write — and which carried a *different spelling* of the street address than
//   the editable `contractor.address` two pages earlier.
//
// This is the same shape as the `contractor.address_line_1` defect that src/lib/pdfTextIndex.js
// was written to eliminate. It came back through a different door, so the guard is generalised:
//
//   1. STRUCTURAL — the config identity keys and the schema identity keys are the same set,
//      so defaults.js can never spread a key the schema will strip.
//   2. STRUCTURAL — every `contractor.<key>` a PDF template dereferences is declared in the
//      schema. A phantom path fails here before anything renders.
//   3. BEHAVIOURAL — render both templates for real, extract every text run, and require that
//      each printed identity *value* is contained in at least one payload leaf. This is exactly
//      the property "clicking it opens an editor", asserted against the real renderer.
//   4. BEHAVIOURAL — the page-footer address resolves through the real click resolver.
//
// Tier 2 (legal_name inside boilerplate prose and two chrome labels) is an explicit, counted
// allow-list, not a blanket exemption: packages/templates/legal.js documents the decision to
// keep the company name inline in legal prose. The allow-list is asserted exactly, so a new
// unreachable identity string cannot appear without failing this test.
//
//   node scripts/test-identity-binding.mjs

import React from 'react';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { renderToBuffer } from '@react-pdf/renderer';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { CONTRACTOR } from '../packages/config/business.js';
import { ContractorInfo } from '../packages/schema/documents.js';
import { payloadSchemaFor } from '../packages/schema/documents.js';
import { defaultContractPayload, defaultInvoicePayload } from '../packages/templates/defaults.js';
import { ContractPDF, InvoicePDF } from '../packages/templates/pdf/index.js';
import { buildLeafIndex, resolveTextToPath } from '../src/lib/pdfTextIndex.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
const fails = [];
function ok(label, cond, detail) {
  if (cond) { pass++; return; }
  fails.push(detail ? `${label}\n      ${detail}` : label);
}

// ── helpers ───────────────────────────────────────────────────────────────────
// pdf.js splits a single drawn string into arbitrary runs ("6" + "Stone Ridge Rd ,…"),
// so any comparison that respects whitespace will produce false negatives. Squash it.
const squash = (s) => String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase();

async function pdfText(Comp, payload) {
  const buf = await renderToBuffer(React.createElement(Comp, { payload }));
  const pdf = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items
      .filter((it) => String(it.str).trim())
      .map((it) => ({ str: it.str, y: it.transform[5], height: vp.height }));
    pages.push(items);
  }
  return { pages, all: pages.flat() };
}

// Count non-overlapping occurrences of a squashed needle in squashed page text.
function countIn(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

// ── 1. structural: config keys === schema keys ────────────────────────────────
const configKeys = Object.keys(CONTRACTOR).sort();
const schemaKeys = Object.keys(ContractorInfo.shape).sort();
ok('config CONTRACTOR keys === ContractorInfo keys',
  JSON.stringify(configKeys) === JSON.stringify(schemaKeys),
  `config: ${configKeys.join(',')}\n      schema: ${schemaKeys.join(',')}`);
for (const k of configKeys) {
  ok(`config key "${k}" is declared in ContractorInfo`, schemaKeys.includes(k),
    'defaults.js spreads the whole config object, so an undeclared key is silently stripped by zod on every save');
}

// ── 2. structural: every contractor.<key> a template reads is declared ────────
for (const file of ['ContractPDF.jsx', 'InvoicePDF.jsx']) {
  const src = readFileSync(join(ROOT, 'packages/templates/pdf', file), 'utf8');
  // `c.foo` inside contractorFromPayload, and `contractor.foo` at the render sites.
  const derefs = new Set();
  for (const m of src.matchAll(/\bc\.([a-z_][a-z0-9_]*)\b/g)) derefs.add(m[1]);
  for (const m of src.matchAll(/\bcontractor\.([a-z_][a-z0-9_]*)\b/g)) derefs.add(m[1]);
  // Only judge names that look like identity fields, i.e. that the config or schema knows,
  // plus anything that reaches CONTRACTOR.<key> as a fallback (the phantom's signature).
  for (const m of src.matchAll(/\bCONTRACTOR\.([a-z_][a-z0-9_]*)\b/g)) derefs.add(m[1]);
  for (const key of [...derefs].sort()) {
    if (!configKeys.includes(key) && !schemaKeys.includes(key)) continue;
    ok(`${file} reads contractor.${key} — declared in ContractorInfo`, schemaKeys.includes(key),
      `${file} prints contractor.${key} but the schema strips it, so the value can only come from a constant`);
  }
}

// ── 3. behavioural: printed identity values are reachable from the payload ────
// Tier 1: data fields. Every printed occurrence must live in a payload leaf.
const DATA_FIELDS = ['address', 'phone', 'email', 'license_number', 'website'];

// A payload whose identity is replaced everywhere — in the contractor block AND inside any
// legal prose that baked a copy at creation time. After this substitution the real config
// values exist nowhere in the payload, so any that still appear in the render are provably
// coming from a constant or a hardcoded literal in the template. Testing against the default
// payload alone cannot see this, because there payload values and config values are equal.
const SENTINEL = {
  legal_name: 'ZZNAMEZZ', address: 'ZZADDRZZ', address_footer: '',
  phone: 'ZZPHONEZZ', email: 'ZZMAILZZ', license_number: 'ZZLICZZ', website: 'ZZWEBZZ',
};
function sentinelise(node) {
  if (typeof node === 'string') {
    let s = node;
    // longest first, so "SUNVIC CONTRACTORS LLC" is not half-eaten by a shorter value
    for (const k of Object.keys(SENTINEL).sort((a, b) => (CONTRACTOR[b] || '').length - (CONTRACTOR[a] || '').length)) {
      const v = CONTRACTOR[k];
      if (v && SENTINEL[k]) s = s.split(v).join(SENTINEL[k]);
    }
    return s;
  }
  if (Array.isArray(node)) return node.map(sentinelise);
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, sentinelise(v)]));
  }
  return node;
}

// Tier 2: the documented exception. legal.js keeps the company name inline in legal prose,
// and two PDF chrome labels embed it. Enumerated exactly so it cannot quietly grow.
const ALLOWED_UNREACHABLE = {
  contract: [
    'Personal or Business Check (made payable to SUNVIC CONTRACTORS LLC)',
    'SUNVIC CONTRACTORS LLC is responsible for obtaining all required permits necessary for the work.',
  ],
  invoice: [],
};

const cases = [
  { template: 'contract', Comp: ContractPDF, payload: payloadSchemaFor('contract').parse(defaultContractPayload()) },
  { template: 'invoice', Comp: InvoicePDF, payload: payloadSchemaFor('invoice').parse(defaultInvoicePayload()) },
];

for (const { template, Comp, payload } of cases) {
  const { all, pages } = await pdfText(Comp, payload);
  const doc = squash(all.map((i) => i.str).join(' '));
  const leaves = buildLeafIndex(payload);
  const leafBlob = squash(leaves.map((l) => l.value).join(' \u0000 '));

  for (const field of DATA_FIELDS) {
    const value = CONTRACTOR[field];
    if (!value) continue;
    const n = countIn(doc, squash(value));
    if (n === 0) continue;             // this template does not print that field
    ok(`${template}: contractor.${field} is printed (${n}x) and reachable from a payload leaf`,
      leafBlob.includes(squash(value)),
      `"${value}" appears ${n}x in the rendered ${template} but is in no payload leaf — clicking it can only say "part of the template"`);
  }

  // legal_name: count how many printed occurrences are NOT covered by a payload leaf,
  // by removing every leaf-covered occurrence from consideration via the allow-list.
  const nameSquashed = squash(CONTRACTOR.legal_name);
  const printedNames = countIn(doc, nameSquashed);
  const allowedNames = ALLOWED_UNREACHABLE[template]
    .reduce((acc, s) => acc + countIn(squash(s), nameSquashed), 0);
  ok(`${template}: contractor.legal_name printed ${printedNames}x, and the name itself is a payload leaf`,
    printedNames === 0 || leafBlob.includes(nameSquashed));
  for (const s of ALLOWED_UNREACHABLE[template]) {
    ok(`${template}: known chrome label still present — "${s.slice(0, 48)}…"`, doc.includes(squash(s)),
      'the allow-list is stale; update it deliberately rather than letting it drift');
    ok(`${template}: known chrome label "${s.slice(0, 32)}…" is genuinely NOT in the payload`,
      !leafBlob.includes(squash(s)),
      'this string became payload-backed — remove it from ALLOWED_UNREACHABLE so the allow-list stays honest');
  }
  ok(`${template}: allow-listed unreachable legal_name occurrences accounted for (${allowedNames})`,
    allowedNames <= printedNames);

  // ── 4. behavioural: the page footer address resolves through the real resolver ──
  const footerRuns = [];
  for (const items of pages) {
    for (const it of items) {
      if (it.y < it.height * 0.10) footerRuns.push(it.str);
    }
  }
  const footerLine = footerRuns.join(' ');
  const expected = payload.contractor.address_footer || payload.contractor.address;
  ok(`${template}: footer prints the contractor address`, squash(footerLine).includes(squash(expected)),
    `footer runs: ${JSON.stringify(footerLine.slice(0, 160))}`);

  const r = resolveTextToPath(leaves, expected, footerLine);
  ok(`${template}: clicking the footer address resolves to a field (got ${r.ok ? r.path : r.reason})`,
    r.ok === true,
    'this is the exact click that used to answer "That text is part of the template, not a field you can change."');

  // and there must be exactly ONE spelling of the street address in the whole document
  const zipRuns = [...new Set(all.map((i) => i.str).filter((s) => /\b08857\b/.test(s)).map((s) => s.trim()))];
  ok(`${template}: one spelling of the company address, not ${zipRuns.length}`, zipRuns.length <= 1,
    zipRuns.map((s) => `  ${JSON.stringify(s)}`).join('\n'));

  // ── 3b. the sentinel render: does the template actually READ the payload? ──
  const sPayload = sentinelise(payload);
  const sDoc = squash((await pdfText(Comp, sPayload)).all.map((i) => i.str).join(' '));
  const allowBlob = squash(ALLOWED_UNREACHABLE[template].join(' \u0000 '));

  for (const field of DATA_FIELDS) {
    const v = CONTRACTOR[field];
    if (!v) continue;
    const leaked = countIn(sDoc, squash(v));
    const excused = countIn(allowBlob, squash(v));
    ok(`${template}: sentinel render leaks no real contractor.${field} (${leaked} found, ${excused} allow-listed)`,
      leaked <= excused,
      `"${v}" is printed even though nothing in the payload contains it — it comes from a config constant or a hardcoded literal, so no edit can ever change it`);
  }
  {
    const leaked = countIn(sDoc, squash(CONTRACTOR.legal_name));
    const excused = countIn(allowBlob, squash(CONTRACTOR.legal_name));
    ok(`${template}: sentinel render leaks no unlisted legal_name (${leaked} found, ${excused} allow-listed)`,
      leaked <= excused,
      'a new hardcoded company name appeared in the template — add it deliberately to ALLOWED_UNREACHABLE or bind it to the payload');
  }
  // and the sentinel must actually reach the page, or the check above is vacuous
  ok(`${template}: sentinel address reaches the rendered page`, sDoc.includes(squash(SENTINEL.address)),
    'the template never prints contractor.address, so the leak check proves nothing');
  ok(`${template}: sentinel legal_name reaches the rendered page`, sDoc.includes(squash(SENTINEL.legal_name)));
}

// ── 5. the phantom cannot come back: a stripped key is detectable ─────────────
{
  const raw = defaultContractPayload();
  const parsed = payloadSchemaFor('contract').parse(raw);
  const lostKeys = Object.keys(raw.contractor).filter((k) => !(k in parsed.contractor));
  ok('no contractor key survives defaults.js only to be stripped by the schema',
    lostKeys.length === 0, `stripped: ${lostKeys.join(', ')}`);

  // a legacy payload (the 6-key shape production actually stores) heals on the next save
  const legacy = JSON.parse(JSON.stringify(raw));
  delete legacy.contractor.address_footer;
  const healed = payloadSchemaFor('contract').parse(legacy);
  ok('a legacy payload missing address_footer gains it on the next save',
    'address_footer' in healed.contractor);
}

console.log(fails.length
  ? `test-identity-binding: PASS ${pass} FAIL ${fails.length}\n  - ${fails.join('\n  - ')}`
  : `test-identity-binding: PASS ${pass} FAIL 0`);
process.exit(fails.length ? 1 : 0);
