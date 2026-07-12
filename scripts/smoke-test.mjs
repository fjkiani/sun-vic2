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
check('Contract has 5-milestone payment schedule', (c.payment?.schedule?.length || 0) === 5);
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

console.log('\n[totals] calculations\n');
const invWithItems = {
  ...i,
  phases: [{ id: 'p1', title: 'X', items: [{ desc: 'a', qty: 2, rate: 100 }, { desc: 'b', qty: 1, rate: 50 }] }],
  tax_rate_percent: 8.625,
};
const t = totalDollarsForInvoice(invWithItems);
check('Invoice subtotal correct', t.subtotal === 250, `got ${t.subtotal}`);
check('Invoice tax correct', Math.abs(t.tax - (250 * 0.08625)) < 0.01, `got ${t.tax}`);
check('totalCentsFor rounds correctly', totalCentsFor('invoice', invWithItems) === 27156, `got ${totalCentsFor('invoice', invWithItems)}`);

const cWithItems = {
  ...c,
  scope_of_work: { phases: [{ id: 'p1', title: 'X', items: [{ desc: 'a', qty: 5, rate: 200 }] }] },
};
check('Contract subtotal correct', totalDollarsForContract(cWithItems).subtotal === 1000);

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
