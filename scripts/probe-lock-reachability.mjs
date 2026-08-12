#!/usr/bin/env node
// probe-lock-reachability.mjs — for every path the app locks by default, answer three
// questions the toast implicitly claims to know:
//
//   1. Where does the UI route the user?            sectionForPath()
//   2. Is there actually an unlock control there?   any `onToggleLock('<path>')` call site
//   3. Is the "required NJ contract language" claim true for this path?
//
// The toast currently answers all three with one hardcoded sentence: "locked — required NJ
// contract language. Unlock it in the Legal tab." This probe measures how often each of the
// three parts of that sentence is false.
//
// Static, no browser. Detecting "does this row show a padlock" by grepping for the literal
// `onToggleLock('<path>')` was the first attempt and it is a trap: the moment a block factors
// the call behind a local helper — `tog('contractor.address')` — the grep reports false and the
// probe manufactures a defect that is not there. Measure the rendered structure instead: a
// FieldRow carrying `path="X"` shows a padlock iff a <LockToggle> sits inside it. Blocks that
// lock a whole array put the toggle outside any row, so a literal argument to *any* toggle call
// still counts.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const { fieldRowLockUi, literalToggles } = await import(path.join(ROOT, 'scripts/lib/lockUi.mjs'));

const { DEFAULT_CONTRACT_LOCKS, DEFAULT_INVOICE_LOCKS } = await import(
  path.join(ROOT, 'packages/templates/legal.js')
);
const { sectionForPath, whereToUnlock } = await import(
  path.join(ROOT, 'src/components/doc/docSections.js')
);

// ── 2. which paths have a padlock anywhere in the UI ────────────────────────
// Detection lives in scripts/lib/lockUi.mjs, shared with test-lock-binding.mjs, so the number
// this probe reports and the number the test enforces cannot disagree.
const EDITORS = [
  'src/components/editors/ContractFormEditor.jsx',
  'src/components/editors/InvoiceFormEditor.jsx',
  'src/components/editors/LegalEditor.jsx',
].map((f) => path.join(ROOT, f));
const rowUi = fieldRowLockUi(EDITORS);
const unlockable = new Set([
  ...[...rowUi.entries()].filter(([, v]) => v.padlock).map(([p]) => p),
  ...literalToggles(EDITORS),
]);

// LegalEditor locks per BLOCK; resolve which leaf paths that covers.
const { LEGAL_BLOCK_META } = await import(path.join(ROOT, 'src/components/editors/legal/legalMeta.js'));
const legalLockCall = /<LockChip\b/.test(read('src/components/editors/LegalEditor.jsx'));

function hasPadlock(template, p) {
  if (unlockable.has(p)) return 'exact';
  if (!legalLockCall) return false;
  // A legal block toggle covers every path the block declares.
  const root = p.split('.')[0];
  const meta = LEGAL_BLOCK_META[root];
  if (!meta) return false;
  if (!meta.paths.includes(p)) return false;
  if (template === 'invoice' && root !== 'invoice_terms') return false;
  return 'block';
}

// ── 3. is the NJ claim true? ────────────────────────────────────────────────
// Grounded in N.J.A.C. 13:45A-16.2(a)(12) (what a home-improvement contract must contain)
// and N.J.S.A. 56:8-151(b) (the verbatim cancellation notice).
const STATUTORY_VERBATIM = new Set(['right_to_cancel.text']);
const STATUTORY_SUBSTANCE = new Set(['insurance.text']);
const IDENTITY = (p) => p.startsWith('contractor.');

function njClaim(p) {
  if (STATUTORY_VERBATIM.has(p)) return 'verbatim';
  if (STATUTORY_SUBSTANCE.has(p)) return 'substance';
  if (IDENTITY(p)) return 'presence-only';
  return 'not-nj';
}

// Print the exact words the toast prints, not a re-derivation of them, so the probe cannot
// report a destination the user will never see.
function tabLabel(template, p) {
  const w = whereToUnlock(template, p);
  return w ? w.label : null;
}

function report(template, locks) {
  const rows = Object.keys(locks).filter((k) => locks[k]);
  console.log(`\n=== ${template.toUpperCase()} — ${rows.length} default locks ===`);
  let wrongTab = 0, noRoute = 0, noPadlock = 0, njFalse = 0;
  const w = Math.max(...rows.map((r) => r.length));
  for (const p of rows) {
    const loc = sectionForPath(template, p);
    const where = tabLabel(template, p);
    const pad = hasPadlock(template, p);
    const nj = njClaim(p);
    const saysLegal = loc?.tab === 'legal';
    if (!loc) noRoute++; else if (!saysLegal) wrongTab++;
    if (!pad) noPadlock++;
    if (nj === 'presence-only' || nj === 'not-nj') njFalse++;
    console.log(
      `${p.padEnd(w)}  route=${String(where).padEnd(34)}  padlock=${String(pad).padEnd(5)}  nj=${nj}`,
    );
  }
  console.log(`--- toast claims "Unlock it in the Legal tab":`);
  console.log(`    routes nowhere at all ............ ${noRoute}/${rows.length}`);
  console.log(`    routes to a NON-legal tab ........ ${wrongTab}/${rows.length}`);
  console.log(`    destination has NO unlock control  ${noPadlock}/${rows.length}`);
  console.log(`--- toast claims "required NJ contract language":`);
  console.log(`    false for ........................ ${njFalse}/${rows.length}`);
  return { rows: rows.length, noRoute, wrongTab, noPadlock, njFalse };
}

const c = report('contract', DEFAULT_CONTRACT_LOCKS);
const i = report('invoice', DEFAULT_INVOICE_LOCKS);

console.log(`\n=== TOTAL ===`);
console.log(`locks: ${c.rows + i.rows}`);
console.log(`wrong-or-missing route: ${c.noRoute + c.wrongTab + i.noRoute + i.wrongTab}`);
console.log(`no unlock control at destination: ${c.noPadlock + i.noPadlock}`);
console.log(`"required NJ contract language" is false: ${c.njFalse + i.njFalse}`);
