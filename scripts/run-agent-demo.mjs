// Run the actual production `oneshot()` agent path against OpenRouter GPT-OSS-120B for the
// canonical demo prompt, then render both the raw JSON and a PDF.
//
// Usage:
//   OPENROUTER_API_KEY=sk-or-… TEMPLATE=contract node run-agent-demo.mjs
//   OPENROUTER_API_KEY=sk-or-… TEMPLATE=invoice  node run-agent-demo.mjs
//
// Writes:
//   /mnt/results/sunvic_demo/<template>_agent.json   — raw payload the LLM returned (post-validate + merge)
//   /mnt/results/sunvic_demo/<template>_agent.pdf    — rendered PDF
//   /mnt/results/sunvic_demo/agent_run.log           — append-only log of the run

import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { renderToBuffer } from '@react-pdf/renderer';
import { oneshot } from '../packages/agent/oneshot.js';
import { ContractPDF } from '../packages/templates/pdf/ContractPDF.jsx';
import { InvoicePDF } from '../packages/templates/pdf/InvoicePDF.jsx';

const outDir = process.env.OUT_DIR || '/mnt/results/sunvic_demo';
fs.mkdirSync(outDir, { recursive: true });
const logPath = path.join(outDir, 'agent_run.log');
// S3-mounted /mnt/results/ doesn't support append writes — accumulate in memory, write once.
const logLines = [];
if (fs.existsSync(logPath)) {
  try { logLines.push(...fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean)); } catch {}
}
const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  logLines.push(line);
};
process.on('exit', () => {
  try { fs.writeFileSync(logPath, logLines.join('\n') + '\n'); } catch (e) { console.error('log flush:', e.message); }
});

const template = process.env.TEMPLATE || 'contract';
if (!['contract', 'invoice'].includes(template)) {
  console.error(`TEMPLATE must be contract or invoice, got ${template}`);
  process.exit(1);
}

// ── Demo prompts ────────────────────────────────────────────
const CONTRACT_PROMPT = `Full home renovation at 665 Denver Blvd, Old Bridge NJ 08857.
Property is 3,200 sqft. Scope: gut renovate the kitchen and two full bathrooms, plus build a
second-story addition (bedroom + full bath). Homeowners are John and Sarah Chen — phone
(732) 555-0100, email chen.family@example.com. Total budget $485,000, split roughly 70/30
labor to materials. Project kickoff September 15, 2026. Substantial completion target April 30, 2027.
Standard NJ home-improvement contract structure.`;

const INVOICE_PROMPT = `Milestone invoice for the Chen renovation project at 665 Denver Blvd,
Old Bridge NJ 08857. Contract reference CTR-2026-0001. This is Progress Payment (2), which is
30% of the $485,000 contract total, due upon MEP Rough-in inspection approval.

Work billed under this milestone is the MEP rough-in: electrical panel upgrade to 200A with
home-run circuits for kitchen and baths; DWV + PEX plumbing rough-in for two baths and kitchen;
3-ton HVAC condenser + air handler with full ductwork; municipal inspection scheduling and
coordination; and materials delivered (wire, PEX, refrigerant line-set, panel, HVAC equipment).

Two prior payments have been received: Deposit Payment 15% ($72,750) at signing on Sept 15 2026,
and Progress Payment (1) 20% ($97,000) upon foundation approval on Oct 24 2026.

Invoice date November 20, 2026. Due within one business day per Sunvic terms. Apply New Jersey
sales tax at 6.625% to the materials portion only (per N.J.A.C. 18:24-5.6).

Bill to: John & Sarah Chen — chen.family@example.com — (732) 555-0100.`;

const prompt = template === 'contract' ? CONTRACT_PROMPT : INVOICE_PROMPT;
const model = process.env.MODEL || 'openai/gpt-oss-120b:free';

log('════════════════════════════════════════');
log(`RUN template=${template} model=${model}`);
log(`prompt-length=${prompt.length}`);

const start = Date.now();
let result;
try {
  result = await oneshot({
    prompt,
    template,
    providerId: 'openrouter',
    model,
    homeownerName: 'John & Sarah Chen',
  });
} catch (e) {
  log(`✗ oneshot failed: ${e.message}`);
  console.error(e.stack);
  process.exit(2);
}
const elapsed = Date.now() - start;

log(`✓ oneshot ok  elapsed=${elapsed}ms  provider=${result.provider}  total_cents=${result.total_cents}`);
log(`  client_name=${result.client_name || '(none)'}  client_email=${result.client_email || '(none)'}`);
if (result.raw?.usage) {
  log(`  tokens: prompt=${result.raw.usage.prompt_tokens} completion=${result.raw.usage.completion_tokens} total=${result.raw.usage.total_tokens}`);
}

// Save raw JSON payload
const jsonOut = path.join(outDir, `${template}_agent.json`);
fs.writeFileSync(jsonOut, JSON.stringify(result.payload, null, 2));
log(`  wrote payload → ${jsonOut}`);

// Render PDF
const logoPath = path.join(process.cwd(), 'public', 'logo', 'sunvic.png');
const logoUrl = fs.existsSync(logoPath)
  ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
  : null;

const PDFComp = template === 'contract' ? ContractPDF : InvoicePDF;
const pdfStart = Date.now();
const buf = await renderToBuffer(React.createElement(PDFComp, { payload: result.payload, logoUrl }));
const pdfElapsed = Date.now() - pdfStart;

const pdfOut = path.join(outDir, `${template}_agent.pdf`);
fs.writeFileSync(pdfOut, buf);
log(`  wrote pdf → ${pdfOut}  (${buf.length} bytes, ${pdfElapsed}ms)`);
log('════════════════════════════════════════');
