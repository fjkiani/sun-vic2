// Render an invoice PDF for milestone Progress Payment (2) on the demo contract.
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { renderToBuffer } from '@react-pdf/renderer';
import { InvoicePDF } from '../packages/templates/pdf/InvoicePDF.jsx';
import { defaultInvoicePayload } from '../packages/templates/defaults.js';

const outDir = process.env.OUT_DIR || '/mnt/results/sunvic_demo';
fs.mkdirSync(outDir, { recursive: true });

// Contract-level facts (mirror what the contract preview uses)
const CONTRACT_TOTAL_CENTS = 48_500_000;   // $485,000
const CONTRACT_LABOR_CENTS = 34_000_000;   // $340,000 (70%)
const CONTRACT_MATS_CENTS  = 14_500_000;   // $145,000 (30%)
const CONTRACT_REF         = 'CTR-2026-0001';

// P2 MEP milestone = 30% of contract
const MILESTONE_PCT = 30;
const MILESTONE_SUBTOTAL_CENTS = Math.round(CONTRACT_TOTAL_CENTS * MILESTONE_PCT / 100);          // 14,550,000
const MILESTONE_LABOR_CENTS    = Math.round(CONTRACT_LABOR_CENTS * MILESTONE_PCT / 100);        // 10,200,000
const MILESTONE_MATS_CENTS     = MILESTONE_SUBTOTAL_CENTS - MILESTONE_LABOR_CENTS;               //  4,350,000

// NJ 6.625% on materials portion only
const TAX_RATE = 6.625;
const TAX_CENTS = Math.round(MILESTONE_MATS_CENTS * TAX_RATE / 100);                             //   288,188 (= $2,881.88)

const TOTAL_DUE_CENTS = MILESTONE_SUBTOTAL_CENTS + TAX_CENTS;

// Prior payments received: Deposit 15% and P1 20%
const DEPOSIT_CENTS = Math.round(CONTRACT_TOTAL_CENTS * 0.15);                                    // 7,275,000
const P1_CENTS      = Math.round(CONTRACT_TOTAL_CENTS * 0.20);                                    // 9,700,000
const PRIOR_SUM     = DEPOSIT_CENTS + P1_CENTS;                                                   // 16,975,000

// Contract balance after this invoice
const REMAINING_AFTER = CONTRACT_TOTAL_CENTS - PRIOR_SUM - TOTAL_DUE_CENTS;

const payload = defaultInvoicePayload({
  homeownerName: 'John & Sarah Chen',
});

Object.assign(payload, {
  invoice_number: 'INV-2026-0003',
  invoice_date: '2026-11-20',
  due_date: '2026-11-23',
  contract_ref: CONTRACT_REF,
  milestone_label: 'Progress Payment (2)',
  milestone_condition: 'Due upon MEP Rough-in inspection approval',
  status: 'issued',

  bill_to: {
    client_name: 'John & Sarah Chen',
    property_address: '665 Denver Blvd, Old Bridge, NJ 08857',
    recipient_email: 'chen.family@example.com',
    recipient_phone: '(732) 555-0100',
  },

  contract: {
    ref: CONTRACT_REF,
    total_cents: CONTRACT_TOTAL_CENTS,
  },
  milestone: {
    percent: MILESTONE_PCT,
    subtotal_cents: MILESTONE_SUBTOTAL_CENTS,
    labor_portion_cents: MILESTONE_LABOR_CENTS,
    materials_portion_cents: MILESTONE_MATS_CENTS,
  },

  line_items: [
    { desc: 'Electrical rough-in — service upgrade to 200A panel, home-run circuits for kitchen (2 dedicated appliance, 1 island, 4 SABC), bath GFCI circuits (2), whole-house LV data pull',
      qty: 1, rate_cents: 3_800_000, amount_cents: 3_800_000 },
    { desc: 'Plumbing rough-in — DWV stack tie-in for 2 baths + kitchen, PEX manifold distribution, tub/shower valve set (2), toilet stub-outs (2), kitchen sink + dishwasher supply',
      qty: 1, rate_cents: 3_400_000, amount_cents: 3_400_000 },
    { desc: 'HVAC rough-in — 3-ton condenser + air handler set, supply/return trunkline installation to 8 supply registers, 2 return grilles, refrigerant line-set run + insulated',
      qty: 1, rate_cents: 2_700_000, amount_cents: 2_700_000 },
    { desc: 'MEP inspection prep, coordination, and municipal rough-in inspection scheduling (electrical, plumbing, mechanical)',
      qty: 1, rate_cents:   350_000, amount_cents:   350_000 },
    { desc: 'Materials — copper wiring, PEX tubing/fittings, refrigerant line-set, valves, panel + breakers, HVAC equipment (per attached itemized delivery ledger)',
      qty: 1, rate_cents: 4_300_000, amount_cents: 4_300_000 },
  ],

  prior_payments: [
    { label: 'Deposit Payment (15%) — signing',            date: '2026-09-15', amount_cents: DEPOSIT_CENTS },
    { label: 'Progress Payment (1) (20%) — foundation ✓',  date: '2026-10-24', amount_cents: P1_CENTS },
  ],

  tax: {
    rate_percent: TAX_RATE,
    applies_to: 'materials_only',
    amount_cents: TAX_CENTS,
  },

  totals: {
    subtotal_cents: MILESTONE_SUBTOTAL_CENTS,
    tax_cents: TAX_CENTS,
    total_due_cents: TOTAL_DUE_CENTS,
    remaining_after_cents: REMAINING_AFTER,
  },
});

const logoPath = path.join(process.cwd(), 'public', 'logo', 'sunvic.png');
const logoUrl = fs.existsSync(logoPath)
  ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
  : null;

console.log('Rendering invoice...');
const start = Date.now();
const buf = await renderToBuffer(React.createElement(InvoicePDF, { payload, logoUrl }));
const elapsed = Date.now() - start;

const out = path.join(outDir, 'invoice_preview.pdf');
fs.writeFileSync(out, buf);
console.log(`✓ Wrote ${out}  (${buf.length} bytes, ${elapsed}ms)`);
console.log('\nFinancial check:');
console.log(`  Milestone subtotal   ${fmt(MILESTONE_SUBTOTAL_CENTS)}`);
console.log(`  Tax (6.625% × mats)  ${fmt(TAX_CENTS)}`);
console.log(`  Total due            ${fmt(TOTAL_DUE_CENTS)}`);
console.log(`  Prior payments       ${fmt(PRIOR_SUM)}`);
console.log(`  Balance after        ${fmt(REMAINING_AFTER)}`);

function fmt(c) { return '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
