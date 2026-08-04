// Smoke test — runs without a live Supabase / LLM connection.
// Verifies:
//   1. Default payloads validate against their Zod schemas.
//   2. Locks helpers behave correctly.
//   3. Totals helpers produce sensible numbers.
//   4. Server-side PDF render actually produces a non-empty Buffer for both templates.
//
// Usage: node scripts/smoke-test.mjs

import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { ContractPayload, InvoicePayload } from '../packages/schema/documents.js';
import { defaultContractPayload, defaultInvoicePayload, defaultLocksFor } from '../packages/templates/defaults.js';
import { isLocked, violatedLocks, mergeWithLocks } from '../netlify/functions/_shared/locks.js';
import { totalDollarsForInvoice, totalDollarsForContract, totalCentsFor } from '../netlify/functions/_shared/totals.js';
import { ContractPDF, InvoicePDF } from '../packages/templates/pdf/index.js';

let failed = 0;
function check(name, cond, detail) {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

console.log('\n[schema] default payloads validate\n');
const c = defaultContractPayload();
const i = defaultInvoicePayload();
const cParse = ContractPayload.safeParse(c);
const iParse = InvoicePayload.safeParse(i);
check('Contract default validates', cParse.success, cParse.success ? '' : JSON.stringify(cParse.error.issues.slice(0, 3)));
check('Invoice default validates', iParse.success, iParse.success ? '' : JSON.stringify(iParse.error.issues.slice(0, 3)));
check('Contract has canonical warranty', /warranty/i.test(c.warranties?.text || ''));
// Canonical SUNVIC schedule = 6 milestones (Deposit 15 / Progress 20·30·15·15 / Final 5),
// matching the sample contract PDF. (Earlier this asserted 5, which was incorrect.)
check('Contract has 6-milestone payment schedule', (c.payment?.schedule?.length || 0) === 6, `got ${c.payment?.schedule?.length}`);
check('Contract payment sums to 100%', c.payment.schedule.reduce((s, m) => s + m.percent, 0) === 100);

console.log('\n[locks] guard behaviour\n');
const locks = defaultLocksFor('contract');
check('warranties.text locked by default', isLocked(locks, 'warranties.text'));
check('bill_to.client_name not locked', !isLocked(locks, 'bill_to.client_name'));
const violations = violatedLocks({}, { warranties: { text: 'hacked' } }, locks);
check('violatedLocks catches the write', violations.includes('warranties.text'));
const { out: merged, skipped } = mergeWithLocks(c, { warranties: { text: 'malicious' }, agreement_summary: 'new' }, locks);
check('mergeWithLocks drops locked path', merged.warranties.text === c.warranties.text);
check('mergeWithLocks lets non-locked through', merged.agreement_summary === 'new');
check('mergeWithLocks reports skipped', skipped.includes('warranties.text'));

console.log('\n[totals] calculations (canonical schema shape)\n');
// Bug K fix: totalDollarsFor{Invoice,Contract} now return a SCALAR (dollars), not a
// {subtotal,tax,total} object — the old object shape was mis-consumed as a scalar by the
// agent call sites, producing NaN. Invoice money lives on milestone.subtotal_cents +
// tax.amount_cents (integer cents) per packages/schema/documents.js. (Earlier this test used
// a legacy phases/items/qty/rate shape the schema never produced, so totals were always 0.)
const invWithItems = {
  ...i,
  milestone: { ...(i.milestone || {}), subtotal_cents: 25000 },   // $250.00
  tax: { ...(i.tax || {}), amount_cents: 2156 },                  // $21.56 (8.625% on $250)
  totals: { ...(i.totals || {}), total_due_cents: 27156 },        // $271.56 due
};
check('Invoice total (dollars) correct', totalDollarsForInvoice(invWithItems) === 271.56, `got ${totalDollarsForInvoice(invWithItems)}`);
check('totalCentsFor(invoice) correct', totalCentsFor('invoice', invWithItems) === 27156, `got ${totalCentsFor('invoice', invWithItems)}`);

// Contract totals: scope_of_work.groups[].tasks[].amount_cents + scope_of_work.total_cents.
const cWithItems = {
  ...c,
  scope_of_work: { groups: [{ title: 'X', tasks: [{ description: 'a', amount_cents: 100000 }] }], total_cents: 100000 },
  payment: { ...c.payment, total_cents: 100000 },
};
check('Contract total (dollars) correct', totalDollarsForContract(cWithItems) === 1000, `got ${totalDollarsForContract(cWithItems)}`);
check('totalCentsFor(contract) correct', totalCentsFor('contract', cWithItems) === 100000, `got ${totalCentsFor('contract', cWithItems)}`);

console.log('\n[pdf] server-side render\n');
const cPdf = await renderToBuffer(React.createElement(ContractPDF, { payload: c, docNumber: 'CTR-2026-0001' }));
check('Contract PDF renders (non-empty)', Buffer.isBuffer(cPdf) && cPdf.length > 5000, `size=${cPdf.length}`);
check('Contract PDF header is %PDF', cPdf.slice(0, 4).toString() === '%PDF');

const iPdf = await renderToBuffer(React.createElement(InvoicePDF, { payload: i, docNumber: 'INV-2026-0001' }));
check('Invoice PDF renders (non-empty)', Buffer.isBuffer(iPdf) && iPdf.length > 5000, `size=${iPdf.length}`);
check('Invoice PDF header is %PDF', iPdf.slice(0, 4).toString() === '%PDF');

console.log();
if (failed === 0) {
  console.log('✅ All smoke tests passed.');
  process.exit(0);
} else {
  console.error(`❌ ${failed} smoke tests failed.`);
  process.exit(1);
}
