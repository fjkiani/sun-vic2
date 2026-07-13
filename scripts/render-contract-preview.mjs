// Render a contract PDF from defaults so we can see if the template compiles and looks right.
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { renderToBuffer } from '@react-pdf/renderer';
import { ContractPDF } from '../packages/templates/pdf/ContractPDF.jsx';
import { defaultContractPayload } from '../packages/templates/defaults.js';

const outDir = process.env.OUT_DIR || '/mnt/results/sunvic_demo';
fs.mkdirSync(outDir, { recursive: true });

// Build a sample payload with the demo job pre-populated
const payload = defaultContractPayload({
  homeownerName: 'John & Sarah Chen',
  jobNo: 'CTR-2026-0001',
  forLabel: 'John & Sarah Chen',
});
payload.homeowner.address = '665 Denver Blvd, Old Bridge, NJ 08857';
payload.homeowner.phone = '(732) 555-0100';
payload.homeowner.email = 'chen.family@example.com';
payload.payment.labor_cost_cents  = 34_000_000;   // $340,000
payload.payment.materials_cost_cents = 14_500_000; // $145,000
payload.payment.total_cents = 48_500_000;         // $485,000

const logoPath = path.join(process.cwd(), 'public', 'logo', 'sunvic.png');
const logoUrl = fs.existsSync(logoPath) ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}` : null;

console.log('Rendering...');
const start = Date.now();
const buf = await renderToBuffer(React.createElement(ContractPDF, { payload, logoUrl }));
const elapsed = Date.now() - start;

const out = path.join(outDir, 'contract_preview.pdf');
fs.writeFileSync(out, buf);
console.log(`✓ Wrote ${out}  (${buf.length} bytes, ${elapsed}ms)`);
