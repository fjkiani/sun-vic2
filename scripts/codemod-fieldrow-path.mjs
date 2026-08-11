// codemod-fieldrow-path — give every FieldRow a declarative `path`, recovered from the
// locks[...] reference already inside it.
//
// Scroll sync needs to know which payload field a form row corresponds to. Today that only
// exists inside an onChange closure (`onChange={(v) => set('homeowner.name', v)}`), which is
// not readable from the DOM. Every row also carries a LockToggle referencing the same path as
// a literal, so the path is recoverable without guessing.
//
// Run with --check to report only. Prints every row it could NOT resolve, so a silent partial
// migration is impossible.

import { readFileSync, writeFileSync } from 'node:fs';

const FILES = [
  'src/components/editors/ContractFormEditor.jsx',
  'src/components/editors/InvoiceFormEditor.jsx',
  'src/components/editors/LegalEditor.jsx',
];
const check = process.argv.includes('--check');

let totalRows = 0, injected = 0, already = 0, unresolved = [];

for (const file of FILES) {
  const src = readFileSync(file, 'utf8');
  const out = [];
  let i = 0;

  while (i < src.length) {
    const open = src.indexOf('<FieldRow', i);
    if (open === -1) { out.push(src.slice(i)); break; }
    out.push(src.slice(i, open));

    // End of the opening tag, respecting braces so a `>` inside {…} does not fool us.
    let j = open, depth = 0, tagEnd = -1;
    while (j < src.length) {
      const ch = src[j];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) { tagEnd = j; break; }
      j++;
    }
    if (tagEnd === -1) { out.push(src.slice(open)); break; }

    // The element body, up to its matching close tag.
    const close = src.indexOf('</FieldRow>', tagEnd);
    const body = close === -1 ? '' : src.slice(tagEnd, close);
    const tag = src.slice(open, tagEnd);
    totalRows++;

    if (/\bpath=/.test(tag)) {
      already++;
      out.push(tag + '>');
      i = tagEnd + 1;
      continue;
    }

    // Recover the path: prefer the LockToggle literal, else the set('…') in an onChange.
    const m = body.match(/locks\[['"]([^'"]+)['"]\]/)
           || body.match(/onToggleLock\(['"]([^'"]+)['"]\)/)
           || body.match(/\bset\(['"]([^'"]+)['"]/)
           || body.match(/\bset\(\{\s*['"]([^'"]+)['"]\s*:/);   // LegalEditor's object form
    if (!m) {
      const label = (tag.match(/label="([^"]*)"/) || [])[1] || tag.slice(0, 60).replace(/\s+/g, ' ');
      unresolved.push(`${file}: ${label}`);
      out.push(tag + '>');
      i = tagEnd + 1;
      continue;
    }

    injected++;
    out.push(`${tag} path="${m[1]}">`);
    i = tagEnd + 1;
  }

  if (!check) writeFileSync(file, out.join(''));
}

console.log(`FieldRow rows found : ${totalRows}`);
console.log(`  path injected     : ${injected}`);
console.log(`  already had path  : ${already}`);
console.log(`  UNRESOLVED        : ${unresolved.length}`);
for (const u of unresolved) console.log('     -', u);
console.log(check ? '\n(check only — nothing written)' : '\nwritten');
process.exit(0);
