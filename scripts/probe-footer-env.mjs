// probe-footer-env.mjs — what does the PRODUCTION server actually print in the
// page footer, and where does that string come from?
//
// The templates print `contractor.address_footer`, a key that does not exist in
// ContractorInfo. So the footer can only come from the frozen config constant
// CONTRACTOR.address_footer, which in turn reads process.env.BUSINESS_ADDRESS_FOOTER
// *on the server*. Local defaults tell us nothing about Vercel's environment.
//
// This probe asks production to render a real PDF, downloads it, extracts the
// text, and compares the footer line against every candidate spelling. That is
// the only way to know whether BUSINESS_ADDRESS / BUSINESS_ADDRESS_FOOTER are
// set in Vercel before we change which key the footer reads.
//
//   node scripts/probe-footer-env.mjs [--base URL] [--doc CTR-2026-0016]

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > -1 ? process.argv[i + 1] : d;
};
const BASE = arg('--base', process.env.E2E_BASE || 'https://sun-vic2.vercel.app');
const TOKEN = arg('--token', process.env.E2E_TOKEN || 'mock-local-token');
const WANT = arg('--doc', 'CTR-2026-0016');

const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function api(method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let data = null;
  try { data = JSON.parse(txt); } catch { data = txt; }
  return { status: r.status, data };
}

const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

const list = await api('GET', '/api/documents');
if (list.status !== 200) {
  console.error('list failed', list.status, list.data);
  process.exit(1);
}
const docs = Array.isArray(list.data) ? list.data : (list.data.documents || list.data.data || []);
const doc = docs.find((d) => d.doc_number === WANT) || docs.find((d) => d.template === 'contract');
if (!doc) { console.error('no contract found'); process.exit(1); }
console.log(`document: ${doc.doc_number} (${doc.id}) template=${doc.template}`);

const gen = await api('POST', `/api/documents/${doc.id}/pdf`);
if (gen.status !== 200) {
  console.error('pdf generate failed', gen.status, JSON.stringify(gen.data).slice(0, 400));
  process.exit(1);
}
console.log(`server rendered: ${gen.data.object_key}`);

const pdfRes = await fetch(gen.data.signed_url);
const buf = Buffer.from(await pdfRes.arrayBuffer());
console.log(`downloaded ${buf.length} bytes`);

const pdf = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;

// Grab the payload so we can compare the footer against the payload's own address.
const full = await api('GET', `/api/documents/${doc.id}`);
const payloadAddress = norm(full.data?.payload?.contractor?.address);
const payloadKeys = Object.keys(full.data?.payload?.contractor || {});

// Footer lines sit at the bottom of every page. Collect the lowest-y runs of page 1.
const page = await pdf.getPage(1);
const vp = page.getViewport({ scale: 1 });
const tc = await page.getTextContent();
const runs = tc.items
  .filter((it) => norm(it.str))
  .map((it) => ({ str: norm(it.str), y: it.transform[5] }));
runs.sort((a, b) => a.y - b.y);
const footerBand = runs.filter((r) => r.y < vp.height * 0.10);

console.log(`\npage-1 footer band (y < ${(vp.height * 0.10).toFixed(0)}pt):`);
for (const r of footerBand) console.log(`  y=${r.y.toFixed(1)}  ${JSON.stringify(r.str)}`);

// Which run is an address? The one containing a 5-digit ZIP.
const addressRuns = [];
for (let p = 1; p <= pdf.numPages; p++) {
  const pg = await pdf.getPage(p);
  const v = pg.getViewport({ scale: 1 });
  const t = await pg.getTextContent();
  for (const it of t.items) {
    const s = norm(it.str);
    if (!s) continue;
    if (it.transform[5] < v.height * 0.10 && /\b\d{5}\b/.test(s)) addressRuns.push({ page: p, str: s });
  }
}
const distinctFooterAddresses = [...new Set(addressRuns.map((r) => r.str))];

console.log('\n── what production actually printed ──────────────────────────');
console.log(`footer address occurrences : ${addressRuns.length} (across ${pdf.numPages} pages)`);
console.log(`distinct footer spellings  : ${distinctFooterAddresses.length}`);
for (const s of distinctFooterAddresses) console.log(`   footer  : ${JSON.stringify(s)}`);
console.log(`payload contractor.address : ${JSON.stringify(payloadAddress)}`);
console.log(`payload contractor keys    : ${JSON.stringify(payloadKeys)}`);
console.log(`payload has address_footer : ${payloadKeys.includes('address_footer')}`);

const LOCAL_ADDRESS = '6 Stone Ridge Rd.- Old Bridge - NJ - 08857';
const LOCAL_FOOTER = '6 Stone Ridge Rd ,Old Bridge, NJ, 08857';
const footer = distinctFooterAddresses[0] || '';

console.log('\n── where does the server footer string come from? ────────────');
console.log(`matches local BUSINESS_ADDRESS default        : ${footer === LOCAL_ADDRESS}`);
console.log(`matches local BUSINESS_ADDRESS_FOOTER default : ${footer === LOCAL_FOOTER}`);
console.log(`matches this document's payload address       : ${footer === payloadAddress}`);
if (footer !== LOCAL_FOOTER && footer !== LOCAL_ADDRESS) {
  console.log('  → Vercel has BUSINESS_ADDRESS_FOOTER set to something else. Do NOT drop the key.');
} else if (footer === LOCAL_FOOTER && footer !== payloadAddress) {
  console.log('  → the footer is the frozen constant and DISAGREES with the editable address.');
}

console.log('\n── header vs footer, same document ───────────────────────────');
const headerAddr = [];
for (let p = 1; p <= pdf.numPages; p++) {
  const pg = await pdf.getPage(p);
  const v = pg.getViewport({ scale: 1 });
  const t = await pg.getTextContent();
  for (const it of t.items) {
    const s = norm(it.str);
    if (s && it.transform[5] >= v.height * 0.10 && /\b\d{5}\b/.test(s) && /stone|ridge|old bridge/i.test(s)) {
      headerAddr.push({ page: p, str: s });
    }
  }
}
const distinctBody = [...new Set(headerAddr.map((r) => r.str))];
for (const s of distinctBody) console.log(`   body    : ${JSON.stringify(s)}`);
const all = new Set([...distinctFooterAddresses, ...distinctBody]);
console.log(`\nDISTINCT SPELLINGS OF THE COMPANY ADDRESS IN ONE DOCUMENT: ${all.size}`);
for (const s of all) console.log(`   ${JSON.stringify(s)}`);
