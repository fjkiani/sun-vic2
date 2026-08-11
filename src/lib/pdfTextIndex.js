// pdfTextIndex — map a string picked off the rendered PDF back to the payload path it came from.
//
// This is the piece the old Live mirror got catastrophically wrong, so the design is a direct
// response to how it failed. That component carried a hardcoded list of 20 `path="..."` strings.
// Nine of them were wrong: three were misspellings that no longer existed on the payload
// (`contractor.address_line_1` against a real key of `contractor.address`), and seven pointed at
// a parent OBJECT rather than the text leaf inside it (`warranties`, not `warranties.text`).
// Because the setter did `cur[last] = value`, typing one character into a warranty replaced the
// whole object with a string and silently destroyed its siblings.
//
// Two invariants follow from that, and everything here exists to enforce them:
//
//   1. NEVER reference a path that is not present in the live payload. The index is BUILT from
//      the payload every time, so a drifted or misspelled path is not expressible.
//   2. NEVER write to a non-leaf, and NEVER guess. An ambiguous or unresolved click returns a
//      reason, not a path. A no-op is always correct; a write to the wrong field is not.

/** Collapse whitespace so PDF line-breaking does not defeat comparison. */
export function norm(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/** Case/punctuation-insensitive form, for matching only — never for writing. */
function loose(s) {
  return norm(s).toLowerCase().replace(/[\u2018\u2019']/g, "'").replace(/[^\w$.,/@%-]+/g, ' ').trim();
}

const MAX_DEPTH = 12;

/**
 * What kind of value is this, judged by path and content?
 * Drives both how it is matched against the PDF and how typed input is parsed back.
 */
export function kindForPath(path, value) {
  const leaf = String(path).split('.').pop();
  if (/_cents$/.test(leaf)) return 'money';
  if (/(^|_)(date)$/.test(leaf) || /_date$/.test(leaf)) return 'date';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) return 'date';
  if (/(^|_)percent$/.test(leaf)) return 'percent';
  return 'text';
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * The strings this leaf might actually appear as on the page.
 * A cents integer is never printed as "4850000", so without this every money and date field
 * on the document would be unclickable. Each variant is a match key only — writes always go
 * back through parseInput, never through one of these strings.
 */
export function formatVariants(path, value) {
  const kind = kindForPath(path, value);
  const out = [];
  if (kind === 'money') {
    const n = Number(value);
    if (Number.isFinite(n)) {
      const d = n / 100;
      const grouped = d.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      out.push(`$${grouped}`, grouped, String(d));
      // The no-decimals form is only a legitimate match key when it is LOSSLESS. For
      // $1,234,567.89 the rounded string "$1,234,568" is a different amount, and indexing it
      // would let a click on that text commit an 11-cent alteration to a contract total.
      // Every key in this index must parse back to exactly the value it was built from.
      if (Number.isInteger(d)) {
        const whole = d.toLocaleString('en-US');
        out.push(`$${whole}`, whole);
      }
    }
  } else if (kind === 'date') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
    if (m) {
      const [, y, mo, da] = m;
      const mi = Number(mo) - 1, dn = Number(da);
      if (MONTHS[mi]) {
        out.push(`${MONTHS[mi]} ${dn}, ${y}`, `${MONTHS[mi].slice(0, 3)} ${dn}, ${y}`,
                 `${Number(mo)}/${dn}/${y}`, `${mo}/${da}/${y}`);
      }
    }
  } else if (kind === 'percent') {
    const n = Number(value);
    if (Number.isFinite(n)) out.push(`${n}%`, `${n} %`);
  }
  return out;
}

/**
 * Turn what the user typed back into the value the payload stores.
 * Returns {ok:false} rather than a wrong number — a rejected edit is recoverable, a silently
 * mis-parsed contract total is not.
 */
export function parseInput(kind, raw) {
  const s = norm(raw);
  if (kind === 'money') {
    const cleaned = s.replace(/[$,\s]/g, '');
    if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return { ok: false, reason: 'not_a_number' };
    return { ok: true, value: Math.round(Number(cleaned) * 100) };
  }
  if (kind === 'percent') {
    const cleaned = s.replace(/[%\s]/g, '');
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return { ok: false, reason: 'not_a_number' };
    return { ok: true, value: Number(cleaned) };
  }
  if (kind === 'date') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: true, value: s };
    const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (slash) {
      const [, mo, da, y] = slash;
      return { ok: true, value: `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}` };
    }
    const named = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
    if (named) {
      const idx = MONTHS.findIndex((m) => m.toLowerCase().startsWith(named[1].toLowerCase().slice(0, 3)));
      if (idx >= 0) return { ok: true, value: `${named[3]}-${String(idx + 1).padStart(2, '0')}-${String(named[2]).padStart(2, '0')}` };
    }
    return { ok: false, reason: 'not_a_date' };
  }
  return { ok: true, value: raw };
}

/**
 * Every editable scalar leaf in the payload, with its dotted path.
 * Arrays are indexed (`scope_of_work.tasks.0.description`) so list rows stay addressable.
 * Objects and arrays themselves are deliberately NOT emitted — they are not writable targets.
 */
export function buildLeafIndex(payload) {
  const leaves = [];
  const walk = (node, path, depth) => {
    if (depth > MAX_DEPTH || node == null) return;
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, path ? `${path}.${i}` : String(i), depth + 1));
      return;
    }
    if (typeof node === 'object') {
      for (const k of Object.keys(node)) walk(node[k], path ? `${path}.${k}` : k, depth + 1);
      return;
    }
    if (typeof node === 'boolean') return; // not text; not clickable on a PDF
    const value = String(node);
    if (!norm(value)) return; // empty leaves render nothing, so nothing can be clicked
    const kind = kindForPath(path, node);
    // A cents integer prints as "$48,500.00", so match on the rendered forms too. Every
    // variant maps back to this same path; writes go through parseInput, not the variant.
    const variants = formatVariants(path, node);
    leaves.push({
      path, value, kind,
      norm: norm(value),
      loose: loose(value),
      keys: [loose(value), ...variants.map(loose)].filter(Boolean),
    });
  };
  walk(payload, '', 0);
  return leaves;
}

/** Read a dotted path off an object. Returns undefined for any break in the chain. */
export function getPath(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * Is this path safe to write a string into?
 * Guards the exact defect that made the mirror destructive: the target must already be a
 * scalar. If it is an object or array, `cur[last] = value` would obliterate its children.
 */
export function isWritableLeaf(payload, path) {
  if (!path) return false;
  const cur = getPath(payload, path);
  if (cur === undefined) return false;          // path drifted out of the schema
  if (cur === null) return true;                // present-but-empty is fine to fill
  const t = typeof cur;
  return t === 'string' || t === 'number';
}

/**
 * Resolve text lifted off the PDF to exactly one payload path.
 *
 * @param {Array}  index    from buildLeafIndex()
 * @param {string} clicked  the text of the clicked run
 * @param {string} lineText the full visual line it sat on, if available — disambiguates a
 *                          bare "$65,000" that appears in three places
 * @returns {{ok:true, path, value, confidence} | {ok:false, reason, candidates?}}
 */
export function resolveTextToPath(index, clicked, lineText = '') {
  const c = norm(clicked);
  if (!c) return { ok: false, reason: 'empty' };
  const cl = loose(c);
  if (cl.length < 2) return { ok: false, reason: 'too_short' };

  // 1. Exact match against the stored value OR any of its rendered forms.
  let hits = index.filter((l) => l.keys.includes(cl));
  if (hits.length === 1) {
    return { ok: true, path: hits[0].path, value: hits[0].value, kind: hits[0].kind, confidence: 'exact' };
  }

  // 2. Several leaves hold the identical string. Use the surrounding line to break the tie:
  //    prefer the leaf whose sibling label also appears on that line.
  if (hits.length > 1) {
    const ll = loose(lineText);
    if (ll) {
      const scored = hits
        .map((h) => ({ h, s: labelAffinity(h.path, ll) }))
        .sort((a, b) => b.s - a.s);
      if (scored[0].s > 0 && scored[0].s > (scored[1]?.s ?? -1)) {
        return { ok: true, path: scored[0].h.path, value: scored[0].h.value, kind: scored[0].h.kind, confidence: 'line' };
      }
    }
    // Still tied. Hand the caller the options rather than picking one at random.
    return { ok: false, reason: 'ambiguous', candidates: hits.map((h) => ({ path: h.path, value: h.value, kind: h.kind })) };
  }

  // 3. The PDF splits long text across runs, so the clicked fragment is a substring of the
  //    leaf. Take the SHORTEST containing leaf — the tightest enclosing field, not the whole
  //    document. Require a real fragment so a stray "the" cannot match a paragraph.
  if (cl.length >= 4) {
    const containing = index
      .filter((l) => l.keys.some((k) => k.includes(cl)))
      .sort((a, b) => a.loose.length - b.loose.length);
    if (containing.length) {
      const shortest = containing[0];
      const tie = containing.filter((l) => l.loose.length === shortest.loose.length);
      if (tie.length === 1) {
        return { ok: true, path: shortest.path, value: shortest.value, kind: shortest.kind, confidence: 'substring' };
      }
      return { ok: false, reason: 'ambiguous', candidates: tie.map((h) => ({ path: h.path, value: h.value, kind: h.kind })) };
    }
  }

  // 4. Static template chrome — section headings, table captions, boilerplate that lives in the
  //    PDF component rather than the payload. Correctly not editable.
  return { ok: false, reason: 'not_in_payload' };
}

/**
 * How strongly does a path's own field name show up in the line's text?
 * `homeowner.phone` on a line reading "PHONE: 555-0100" scores; `contractor.phone` does not,
 * unless the line also says contractor.
 */
function labelAffinity(path, looseLine) {
  const parts = String(path).split('.');
  let score = 0;
  for (const p of parts) {
    const word = p.replace(/_/g, ' ').toLowerCase();
    if (!word || /^\d+$/.test(word)) continue;
    if (looseLine.includes(word)) score += word.length;
  }
  return score;
}

/**
 * Is this path locked? Locks are stored per exact path, but the useful question at click time
 * is also "is any ancestor locked", so a click inside `warranties.text` respects a lock on
 * `warranties` if one is ever set that way.
 */
export function isPathLocked(locks, path) {
  if (!locks || !path) return false;
  if (locks[path]) return true;
  const parts = String(path).split('.');
  for (let i = parts.length - 1; i > 0; i--) {
    if (locks[parts.slice(0, i).join('.')]) return true;
  }
  return false;
}

/** Human label for a path, for the lock message and the disambiguation list. */
export function labelForPath(path) {
  return String(path)
    .split('.')
    .map((p) => (/^\d+$/.test(p) ? `#${Number(p) + 1}` : p.replace(/_/g, ' ')))
    .join(' › ');
}
