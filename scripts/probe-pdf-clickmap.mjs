// probe-pdf-clickmap — "That text is part of the template, not a field you can change."
//
// That toast is a claim about the payload, and it is either true or it is a lie that
// costs the user a click and their trust. This measures it on real documents instead
// of guessing: render each live document with the same template the browser uses,
// extract every text run with the same pdf.js geometry, resolve every run with the
// same resolver, then bucket the answers.
//
// The bucket that matters is FALSE NEGATIVE: a run the resolver called template
// chrome whose text is demonstrably sitting in the payload. If that bucket is empty
// the toast is honest and "out of sync" is about something else. If it is not empty,
// the count and the examples say exactly what to fix.
//
// Read-only. No writes, no LLM. Run with tsx (the PDF templates are JSX).
//
// Usage: npx tsx scripts/probe-pdf-clickmap.mjs [--base URL] [--limit N] [--show N]

import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { ContractPDF, InvoicePDF } from '../packages/templates/pdf/index.js';
import {
  buildLeafIndex, resolveTextToPath, isPathLocked, norm,
} from '../src/lib/pdfTextIndex.js';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const BASE = arg('--base', process.env.E2E_BASE || 'https://sun-vic2.vercel.app');
const TOKEN = process.env.E2E_TOKEN || 'mock-local-token';
const LIMIT = Number(arg('--limit', '99'));
const SHOW = Number(arg('--show', '25'));

async function api(path) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
  });
  const t = await r.text();
  try { return { status: r.status, data: JSON.parse(t) }; } catch { return { status: r.status, data: null, text: t }; }
}

// Same loose comparison the resolver uses for its keys, applied here only to ask the
// independent question "is this string anywhere in the payload at all".
const loose = (s) => norm(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

function payloadHaystack(payload) {
  const out = [];
  const walk = (v) => {
    if (v == null) return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === 'object') { Object.values(v).forEach(walk); return; }
    const s = String(v);
    if (s.trim()) out.push(loose(s));
  };
  walk(payload);
  return out;
}

async function textRuns(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const runs = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1.5 });
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const tx = pdfjs.Util.transform(viewport.transform, item.transform);
      const h = Math.hypot(tx[2], tx[3]);
      runs.push({ page: p, str: item.str, left: tx[4], top: tx[5] - h });
    }
  }
  return runs;
}

// The browser groups runs into lines by Math.round(top / 4) and passes the joined line
// as context to the resolver. Reproduce it, or the tie-break behaves differently here.
function lineTextFor(runs) {
  const byLine = new Map();
  for (const r of runs) {
    const k = `${r.page}:${Math.round(r.top / 4)}`;
    if (!byLine.has(k)) byLine.set(k, []);
    byLine.get(k).push(r);
  }
  const map = new Map();
  for (const [k, group] of byLine) {
    group.sort((a, b) => a.left - b.left);
    const text = group.map((g) => g.str).join(' ');
    for (const g of group) map.set(g, text);
    void k;
  }
  return map;
}

async function main() {
  const list = await api('/api/documents');
  const docs = (list.data?.documents || []).slice(0, LIMIT);
  console.log(`inspecting ${docs.length} live document(s)\n`);

  const totals = { runs: 0, exact: 0, line: 0, substring: 0, locked: 0, ambiguous: 0, tooShort: 0, notInPayload: 0 };
  const falseNegatives = [];
  const chrome = new Map();   // genuinely-static text -> how often

  for (const d of docs) {
    const full = await api(`/api/documents/${d.doc_number}`);
    const doc = full.data?.document || full.data;
    if (!doc?.payload) { console.log(`  ${d.doc_number}: no payload, skipped`); continue; }

    const Comp = doc.template === 'invoice' ? InvoicePDF : ContractPDF;
    let buffer;
    try {
      buffer = await renderToBuffer(React.createElement(Comp, { payload: doc.payload, docNumber: doc.doc_number }));
    } catch (e) {
      console.log(`  ${d.doc_number}: render failed — ${e.message}`);
      continue;
    }
    const runs = await textRuns(buffer);
    const lines = lineTextFor(runs);
    const index = buildLeafIndex(doc.payload);
    const hay = payloadHaystack(doc.payload);

    const per = { exact: 0, line: 0, substring: 0, locked: 0, ambiguous: 0, tooShort: 0, notInPayload: 0, fn: 0 };
    for (const r of runs) {
      totals.runs++;
      const res = resolveTextToPath(index, r.str, lines.get(r) || '');
      if (res.ok) {
        per[res.confidence]++; totals[res.confidence]++;
        if (isPathLocked(doc.locks || {}, res.path)) { per.locked++; totals.locked++; }
        continue;
      }
      if (res.reason === 'ambiguous') { per.ambiguous++; totals.ambiguous++; continue; }
      if (res.reason === 'too_short' || res.reason === 'empty') { per.tooShort++; totals.tooShort++; continue; }

      // reason === not_in_payload. Is that true?
      per.notInPayload++; totals.notInPayload++;
      const l = loose(r.str);
      const inPayload = l.length >= 4 && hay.some((h) => h.includes(l));
      if (inPayload) {
        per.fn++;
        falseNegatives.push({ doc: d.doc_number, page: r.page, text: r.str.trim() });
      } else {
        chrome.set(r.str.trim(), (chrome.get(r.str.trim()) || 0) + 1);
      }
    }
    console.log(`  ${d.doc_number} (${doc.template}): ${runs.length} runs — ` +
      `editable ${per.exact + per.line + per.substring} (locked ${per.locked}), ` +
      `ambiguous ${per.ambiguous}, short ${per.tooShort}, "template" ${per.notInPayload}` +
      (per.fn ? `  <-- ${per.fn} FALSE NEGATIVE` : ''));
  }

  console.log('\n── totals ─────────────────────────────────────────────');
  console.log(`text runs examined         ${totals.runs}`);
  console.log(`resolved exact             ${totals.exact}`);
  console.log(`resolved by line context   ${totals.line}`);
  console.log(`resolved by substring      ${totals.substring}`);
  console.log(`  of which locked          ${totals.locked}`);
  console.log(`ambiguous (offered choice) ${totals.ambiguous}`);
  console.log(`too short to identify      ${totals.tooShort}`);
  console.log(`called "template chrome"   ${totals.notInPayload}`);
  console.log(`  ...and actually static   ${totals.notInPayload - falseNegatives.length}`);
  console.log(`  ...FALSE NEGATIVES       ${falseNegatives.length}`);

  if (falseNegatives.length) {
    console.log('\n── the toast lied about these ──────────────────────────');
    const byText = new Map();
    for (const f of falseNegatives) {
      const k = f.text;
      if (!byText.has(k)) byText.set(k, { n: 0, docs: new Set() });
      const e = byText.get(k); e.n++; e.docs.add(f.doc);
    }
    [...byText.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, SHOW)
      .forEach(([t, e]) => console.log(`  ${String(e.n).padStart(4)}x  "${t.slice(0, 90)}"  (${e.docs.size} doc(s))`));
  } else {
    console.log('\nno false negatives: every run the resolver refused really is template chrome.');
  }

  console.log('\n── most common genuinely-static text (top 12) ──────────');
  [...chrome.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .forEach(([t, n]) => console.log(`  ${String(n).padStart(4)}x  "${t.slice(0, 70)}"`));
}

main().catch((e) => { console.error(e); process.exit(1); });
