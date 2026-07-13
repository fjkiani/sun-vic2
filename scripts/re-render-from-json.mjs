// Re-render a saved agent payload JSON into a PDF without calling the LLM again.
// Handy after template tweaks.

import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { renderToBuffer } from '@react-pdf/renderer';
import { ContractPDF } from '../packages/templates/pdf/ContractPDF.jsx';
import { InvoicePDF }  from '../packages/templates/pdf/InvoicePDF.jsx';

const template = process.env.TEMPLATE || 'contract';
const outDir = process.env.OUT_DIR || '/mnt/results/sunvic_demo';
const jsonPath = path.join(outDir, `${template}_agent.json`);
const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

const logoPath = path.join(process.cwd(), 'public', 'logo', 'sunvic.png');
const logoUrl = fs.existsSync(logoPath)
  ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
  : null;

const PDFComp = template === 'contract' ? ContractPDF : InvoicePDF;
const start = Date.now();
const buf = await renderToBuffer(React.createElement(PDFComp, { payload, logoUrl }));
const outPath = path.join(outDir, `${template}_agent.pdf`);
fs.writeFileSync(outPath, buf);
console.log(`✓ Re-rendered ${outPath} (${buf.length} bytes, ${Date.now()-start}ms)`);
