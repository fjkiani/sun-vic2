// probe-clickmap-diff — why exactly did that run fail to resolve?
//
// probe-pdf-clickmap says the resolver calls ~100 runs per contract "template chrome" and
// that a few of those are wrong. "A few are wrong" is not actionable. This takes each
// unresolved run whose text is visibly payload-shaped and prints the resolver's own loose
// form beside the loose form of the closest payload leaf, with the first divergence marked,
// so the failure is a character and not a vibe.
//
// Read-only. Run with tsx.
//
// Usage: npx tsx scripts/probe-clickmap-diff.mjs [--base URL] [--doc CTR-2026-0016]

import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { ContractPDF, InvoicePDF } from '../packages/templates/pdf/index.js';
import { buildLeafIndex, resolveTextToPath, norm } from '../src/lib/pdfTextIndex.js';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const BASE = arg('--base', process.env.E2E_BASE || 'https://sun-vic2.vercel.app');
const TOKEN = process.env.E2E_TOKEN || 'mock-local-token';
const DOC = arg('--doc', 'CTR-2026-0016');

// The resolver's private loose(). Copied deliberately: if it drifts, this probe's answers
// stop matching the product's answers and the copy is what makes that visible.
const RESOLVER_LOOSE = (s) => norm(s).toLowerCase()
  .replace(/[\u2018\u2019']/g, "'")
  .replace(/[^\w$.,/@%-]+/g, ' ')
  .trim();

// Punctuation- and space-blind, i.e. "the same string as far as a human is concerned".
const HUMAN = (s) => norm(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

async function api(path) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
  });
  return JSON.parse(await r.text());
}

function firstDivergence(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

async function main() {
  const full = await api(`/api/documents/${DOC}`);
  const doc = full.document || full;
  const Comp = doc.template === 'invoice' ? InvoicePDF : ContractPDF;
  const buffer = await renderToBuffer(React.createElement(Comp, { payload: doc.payload, docNumber: doc.doc_number }));

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdoc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const runs = [];
  for (let p = 1; p <= pdoc.numPages; p++) {
    const content = await (await pdoc.getPage(p)).getTextContent();
    for (const it of content.items) if (it.str?.trim()) runs.push({ page: p, str: it.str });
  }

  const index = buildLeafIndex(doc.payload);
  console.log(`${DOC}: ${runs.length} runs, ${index.length} payload leaves\n`);

  // Every unresolved run whose human form matches or is contained by a payload leaf's human
  // form. Those are the ones the user is entitled to be annoyed about.
  const cases = new Map();
  for (const r of runs) {
    const res = resolveTextToPath(index, r.str, '');
    if (res.ok || res.reason === 'ambiguous') continue;
    const h = HUMAN(r.str);
    if (h.length < 4) continue;
    const leaf = index.find((l) => HUMAN(l.value).includes(h)) ||
                 index.find((l) => h.includes(HUMAN(l.value)) && HUMAN(l.value).length >= 6);
    if (!leaf) continue;
    const k = `${r.str}|${leaf.path}`;
    if (!cases.has(k)) cases.set(k, { run: r.str, leaf, n: 0, reason: res.reason });
    cases.get(k).n++;
  }

  if (!cases.size) { console.log('nothing payload-shaped was refused.'); return; }

  console.log('── refused, but the text is in the payload ─────────────────────────────');
  for (const c of [...cases.values()].sort((a, b) => b.n - a.n)) {
    const a = RESOLVER_LOOSE(c.run);
    const b = RESOLVER_LOOSE(c.leaf.value);
    const i = firstDivergence(a, b);
    console.log(`\n  ${c.n}x  reason=${c.reason}  ->  ${c.leaf.path}`);
    console.log(`     on page : "${a}"`);
    console.log(`     payload : "${b}"`);
    if (i >= 0) {
      console.log(`     diverge : ${' '.repeat(i)}^  at index ${i}: ` +
        `page has ${JSON.stringify(a[i] ?? '<end>')}, payload has ${JSON.stringify(b[i] ?? '<end>')}`);
      console.log(`     substring test  a in b: ${b.includes(a)}   (this is what step 3 asks)`);
      console.log(`     punctuation-blind, would it match? ${HUMAN(c.leaf.value).includes(HUMAN(c.run))}`);
    }
  }

  // How much of the document is affected, so the fix can be sized.
  const affected = [...cases.values()].reduce((s, c) => s + c.n, 0);
  console.log(`\n${affected} of ${runs.length} runs (${(affected / runs.length * 100).toFixed(1)}%) refuse a click on text that is in the payload.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
