// test-lock-binding — a lock is a promise the app has to keep on three counts.
//
// A locked path makes three claims to the user, and every one of them was false somewhere:
//
//   1. "You cannot change this here."   contractor.address rendered a plain enabled textarea.
//      The user typed, the server answered 200 with `skipped_locks:["contractor.address"]`,
//      and the value silently reverted about half a second later. Measured live against the
//      deployed API by scripts/probe-lock-desync.mjs on a throwaway document.
//   2. "Here is where you unlock it."   The message said "Unlock it in the Legal tab" for all
//      30 default locks. 13 of them are not in the Legal tab, and 6 of those were in no tab at
//      all — sectionForPath returned null, so the instruction pointed nowhere.
//   3. "New Jersey requires this."      True for 2 of 30.
//
// These assertions are structural on purpose: they read the JSX the user is shown, not a
// summary of it. scripts/negcheck-locks.sh reintroduces each defect and proves this file fails.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { DEFAULT_CONTRACT_LOCKS, DEFAULT_INVOICE_LOCKS } from '../packages/templates/legal.js';
import { defaultPayloadFor } from '../packages/templates/defaults.js';
import { ContractPayload, InvoicePayload } from '../packages/schema/documents.js';
import {
  whereToUnlock, sectionForPath, blockForPath, blockLabel, formTabsFor, LEGAL_TABS,
  FORM_BLOCK_LABELS,
} from '../src/components/doc/docSections.js';
import { LEGAL_BLOCK_META } from '../src/components/editors/legal/legalMeta.js';
import { lockReason } from '../src/lib/pdfTextIndex.js';
import { fieldRowLockUi, literalToggles } from './lib/lockUi.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL:', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const EDITOR = {
  contract: ['src/components/editors/ContractFormEditor.jsx'],
  invoice: ['src/components/editors/InvoiceFormEditor.jsx'],
};
const LEGAL_EDITOR = 'src/components/editors/LegalEditor.jsx';

const LOCKS = {
  contract: Object.keys(DEFAULT_CONTRACT_LOCKS).filter((k) => DEFAULT_CONTRACT_LOCKS[k]),
  invoice: Object.keys(DEFAULT_INVOICE_LOCKS).filter((k) => DEFAULT_INVOICE_LOCKS[k]),
};

function getPath(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

console.log('1. every default lock names a path that exists in a real document');
{
  // A lock on a path the payload does not have is a no-op that reads like protection. The
  // invoice locked `payment_methods.text`; payment_methods is z.array(z.string()), so the key
  // could never exist and the four printed methods were unprotected.
  for (const template of ['contract', 'invoice']) {
    const schema = template === 'contract' ? ContractPayload : InvoicePayload;
    const parsed = schema.parse(defaultPayloadFor(template, { homeownerName: 'Test Homeowner' }));
    for (const p of LOCKS[template]) {
      const v = getPath(parsed, p);
      ok(v !== undefined, `${template}: lock on ${p} points at a path the payload actually has`);
      ok(v !== null, `${template}: ${p} is not null`);
    }
  }
  ok(!('payment_methods.text' in DEFAULT_INVOICE_LOCKS),
     'the invoice no longer locks payment_methods.text, a path that cannot exist');
  eq(DEFAULT_INVOICE_LOCKS.payment_methods, true,
     'it locks the payment_methods array itself, which is what prints');
  // A lock on an array root only protects something if the array has contents, and the rows are
  // written through a template-literal path (`payment_methods.${i}`) that the form-binding path
  // extractor deliberately skips — so assert the shape here instead of nowhere.
  const inv = InvoicePayload.parse(defaultPayloadFor('invoice', { homeownerName: 'Test Homeowner' }));
  ok(Array.isArray(inv.payment_methods), 'payment_methods is an array, not an object with a .text');
  ok(inv.payment_methods.length > 0, `and it has rows to protect (${inv.payment_methods.length})`);
  ok(inv.payment_methods.every((m) => typeof m === 'string'), 'every row is a string the editor can render');
}

console.log('2. every default lock can tell the user where to go, in words');
{
  for (const template of ['contract', 'invoice']) {
    for (const p of LOCKS[template]) {
      const w = whereToUnlock(template, p);
      ok(!!w, `${template}: ${p} resolves to a destination on the screen`);
      if (!w) continue;
      ok(w.tab === 'form' || w.tab === 'legal', `${template}: ${p} names a real tab`);
      ok(!!w.sectionLabel, `${template}: ${p} names the sub-tab, not just the tab`);
      ok(w.label.includes(' › '), `${template}: ${p} reads as a path a human can follow — ${w.label}`);
      ok(!/^\w+ › \w+$|undefined|null/.test(w.label) || w.label.split(' › ').length >= 2,
         `${template}: ${p} label is assembled, not a raw id`);
      // The group name must be a real heading in the editor, not a payload key.
      const g = blockLabel(template, blockForPath(p));
      ok(!!g, `${template}: ${p} belongs to a named group (${g})`);
      ok(!/_/.test(g), `${template}: ${p} group name is prose, not a payload key — ${g}`);
    }
  }
  // The specific re-routings this iteration fixed, asserted by name so a regression is loud.
  eq(whereToUnlock('contract', 'contractor.address').label, 'Form › Homeowner › Your company',
     'the company address is in the Form tab, not the Legal tab');
  eq(whereToUnlock('invoice', 'contractor.address').label, 'Form › Bill to › Your company',
     'and on the invoice too, where it previously routed nowhere');
  eq(whereToUnlock('invoice', 'payment_methods').label, 'Form › Amount › How to pay',
     'payment methods now have a home on the invoice');
  eq(whereToUnlock('contract', 'right_to_cancel.text').label, 'Legal › Cancellation › Right to cancel',
     'and the statutory notice names its sub-tab, not just "the Legal tab"');
  eq(whereToUnlock('contract', 'timeline.disclaimer').label, 'Form › Timeline',
     'a group with the same name as its tab is not repeated back at the user');
  eq(whereToUnlock('contract', 'nothing.real'), null,
     'a path nothing renders returns null rather than inventing a destination');
}

console.log('3. the destination actually contains an unlock control');
{
  for (const template of ['contract', 'invoice']) {
    const ui = fieldRowLockUi(EDITOR[template].map((f) => join(root, f)));
    const toggles = literalToggles(EDITOR[template].map((f) => join(root, f)));
    const legalSrc = read(LEGAL_EDITOR);
    for (const p of LOCKS[template]) {
      const loc = sectionForPath(template, p);
      if (loc?.tab === 'form') {
        const row = ui.get(p);
        const covered = (row && row.padlock) || toggles.has(p);
        ok(covered, `${template}: ${p} has a padlock in the form editor`);
        if (row) ok(row.disabled, `${template}: ${p} refuses keystrokes while locked`);
      } else {
        // Legal blocks lock per block; the chip toggles every canonical path the block owns.
        const block = blockForPath(p);
        ok(!!LEGAL_BLOCK_META[block]?.paths?.includes(p),
           `${template}: ${p} is declared by legal block ${block}`);
        ok(/<LockChip\b/.test(legalSrc), 'the legal editor renders a lock chip');
      }
    }
  }
}

console.log('4. a padlock the user can press must disable the input it guards');
{
  // FINDING 64 generalised. Eight cover and homeowner rows offered a padlock and kept the
  // textarea live: locking one of them produced exactly the same silent revert, just for a
  // field the app does not lock by default.
  for (const template of ['contract', 'invoice']) {
    const ui = fieldRowLockUi(EDITOR[template].map((f) => join(root, f)));
    ok(ui.size > 10, `${template}: the extractor found the editor's rows (${ui.size})`);
    for (const [p, v] of ui) {
      if (!v.padlock) continue;
      ok(v.disabled, `${template}: ${p} offers a padlock, so its input must be disabled when locked`);
    }
  }
}

console.log('5. the reason given is the reason that applies');
{
  // Comments are stripped first: the files explain at length what the old sentences were and
  // why they were wrong, and the point of this check is what the UI renders, not what the
  // source says about history. negcheck-locks.sh puts the phrase back inside a rendered string
  // to prove the check still fires after the stripping.
  const stripComments = (t) => t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  const src = [
    'src/components/pdf/PdfDocView.jsx',
    'src/components/agent/AgentTurnDetail.jsx',
    'src/lib/pdfTextIndex.js',
  ].map((f) => stripComments(read(f))).join('\n');
  ok(!/required NJ contract language/i.test(src),
     'the blanket "required NJ contract language" sentence is gone from the UI');
  ok(!/Unlock it in the Legal tab/i.test(src),
     'so is the hardcoded "Unlock it in the Legal tab" direction');
  ok(!/part of the template, not a field you can change/i.test(src),
     'and the brush-off that answered four different questions with one sentence');
  ok(/whereToUnlock\(/.test(read('src/components/pdf/PdfDocView.jsx')),
     'the destination is derived from the tab map at click time');
  ok(/lockReason\(/.test(read('src/components/agent/AgentTurnDetail.jsx')),
     'the copilot refusal explains itself from the same source as the document does');

  let statutory = 0;
  for (const template of ['contract', 'invoice']) {
    for (const p of LOCKS[template]) if (lockReason(p).klass === 'statutory') statutory++;
  }
  eq(statutory, 2, 'exactly two of the 30 default locks are fixed by New Jersey');
}

console.log('6. every block a tab claims has a heading, and every printed block has a tab');
{
  for (const template of ['contract', 'invoice']) {
    for (const tab of formTabsFor(template)) {
      for (const b of tab.blocks) {
        const label = blockLabel(template, b);
        ok(!!label, `${template}: form block ${b} has a heading (${label})`);
      }
    }
  }
  for (const tab of LEGAL_TABS) {
    for (const b of tab.blocks) {
      ok(!!LEGAL_BLOCK_META[b]?.title, `legal block ${b} has a heading`);
    }
  }
  // The invoice's two orphans, asserted by name.
  const invBlocks = formTabsFor('invoice').flatMap((t) => t.blocks);
  ok(invBlocks.includes('contractor'), 'the invoice has a home for the company block');
  ok(invBlocks.includes('payment_methods'), 'and for the payment methods it prints');
  const invSrc = read('src/components/editors/InvoiceFormEditor.jsx');
  ok(/case 'contractor':/.test(invSrc), 'and the invoice editor actually renders the company block');
  ok(/case 'payment_methods':/.test(invSrc), 'and the payment methods block');
  // Headings come from one place, so the toast and the screen cannot drift.
  ok(/FORM_BLOCK_LABELS/.test(invSrc), 'the invoice editor takes its headings from FORM_BLOCK_LABELS');
  ok(/FORM_BLOCK_LABELS/.test(read('src/components/editors/ContractFormEditor.jsx')),
     'so does the contract editor');
  eq(FORM_BLOCK_LABELS.contract.contractor, 'Your company', 'and the company heading is what the toast names');
}

console.log(`\ntest-lock-binding: PASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
