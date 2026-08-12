// Structural reader for "does the editor actually let the user unlock this field".
//
// Shared by scripts/test-lock-binding.mjs (which fails the build) and
// scripts/probe-lock-reachability.mjs (which reports the numbers), so the enforcement and the
// measurement can never disagree about what they are looking at.
//
// Why structural and not a grep: the first version of the probe grepped for the literal
// `onToggleLock('contractor.address')`. The blocks factor that behind a local helper —
// `tog('contractor.address')` — so the grep reported "no padlock" for six rows that render one,
// and the probe manufactured a defect that did not exist. Reading the JSX structure (a
// <LockToggle> inside the <FieldRow> that owns the path) is what the user actually sees.

import fs from 'node:fs';

/**
 * Every <FieldRow> in a JSX source, with the path it owns and the JSX inside it.
 * Handles attributes containing `>` (arrow functions) by tracking brace depth, and nested
 * FieldRows by counting opens and closes.
 *
 * @returns {{path:string|null, open:string, body:string}[]}
 */
export function extractFieldRows(src) {
  const rows = [];
  const TAG = '<FieldRow';
  let i = 0;
  while (true) {
    const start = src.indexOf(TAG, i);
    if (start < 0) break;
    // The character after the tag name must not be an identifier char (guards <FieldRowGroup).
    const after = src[start + TAG.length];
    if (/[A-Za-z0-9_]/.test(after || '')) { i = start + TAG.length; continue; }

    // Walk the opening tag to its closing '>' at brace depth 0.
    let j = start + TAG.length;
    let depth = 0;
    let selfClosing = false;
    for (; j < src.length; j++) {
      const ch = src[j];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) { selfClosing = src[j - 1] === '/'; break; }
    }
    const open = src.slice(start, j + 1);
    const m = /\bpath=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{'([^']*)'\})/.exec(open);
    const path = m ? (m[1] ?? m[2] ?? m[3] ?? m[4]) : null;

    let body = '';
    let end = j + 1;
    if (!selfClosing) {
      // Find the matching </FieldRow>, allowing nesting.
      let k = j + 1;
      let open2 = 1;
      while (k < src.length && open2 > 0) {
        const nextOpen = src.indexOf(TAG, k);
        const nextClose = src.indexOf('</FieldRow>', k);
        if (nextClose < 0) break;
        if (nextOpen >= 0 && nextOpen < nextClose) { open2++; k = nextOpen + TAG.length; }
        else { open2--; k = nextClose + '</FieldRow>'.length; if (open2 === 0) end = k; }
      }
      body = src.slice(j + 1, Math.max(j + 1, end - '</FieldRow>'.length));
    }
    rows.push({ path, open, body });
    i = end;
  }
  return rows;
}

/**
 * For each payload path the form editors render: does its row show a padlock, and is its input
 * disabled while locked?
 *
 * `disabled` is the half that FINDING 64 was about. contractor.address rendered a plain enabled
 * textarea; the user typed, the server answered 200 with skipped_locks, and the value reverted
 * half a second later with no explanation. A padlock alone does not fix that — the input has to
 * refuse the keystroke.
 *
 * @returns {Map<string, {padlock:boolean, disabled:boolean, file:string}>}
 */
export function fieldRowLockUi(files, read = (f) => fs.readFileSync(f, 'utf8')) {
  const out = new Map();
  for (const f of files) {
    const src = read(f);
    for (const row of extractFieldRows(src)) {
      if (!row.path) continue;
      const prev = out.get(row.path) || { padlock: false, disabled: false, file: f };
      out.set(row.path, {
        padlock: prev.padlock || /<LockToggle\b/.test(row.body),
        disabled: prev.disabled || /\bdisabled=/.test(row.body),
        file: f,
      });
    }
  }
  return out;
}

/** Paths passed literally to any onToggleLock(...) call — covers block/array-level padlocks. */
export function literalToggles(files, read = (f) => fs.readFileSync(f, 'utf8')) {
  const out = new Set();
  for (const f of files) {
    for (const m of read(f).matchAll(/onToggleLock\(\s*'([^']+)'\s*\)/g)) out.add(m[1]);
  }
  return out;
}
