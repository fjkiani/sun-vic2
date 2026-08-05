// Static binding checks for the editors.
//
// Two whole classes of bug shipped because nothing connected the UI to the schema:
//   * the Legal tab wrote `permits.text` and `dispute_resolution.text`, paths that do not
//     exist — the boxes rendered empty and every edit was discarded;
//   * the contract form wrote `contractor.name` / `contractor.license_no` and the invoice
//     form wrote `bill_to.client_address`, `project_ref`, `tax_rate_percent`, `notes` and
//     `{description, unit_price_cents}` line items — none of which the schema or the PDF
//     renderers know about.
//
// Both are invisible at runtime: the save succeeds, the payload grows a junk key, and the
// document prints without the value. These helpers let a test walk every path an editor
// writes and prove it exists in the Zod schema, so the class cannot return silently.

// Peel ZodDefault / ZodOptional / ZodNullable / ZodEffects wrappers off a schema node.
function unwrap(node) {
  let cur = node;
  for (let i = 0; i < 12 && cur; i += 1) {
    const def = cur._def;
    if (!def) return cur;
    if (def.innerType) { cur = def.innerType; continue; }
    if (def.schema) { cur = def.schema; continue; }
    return cur;
  }
  return cur;
}

function shapeOf(node) {
  const inner = unwrap(node);
  const def = inner?._def;
  if (!def) return null;
  if (typeof def.shape === 'function') return def.shape();
  if (def.shape && typeof def.shape === 'object') return def.shape;
  return null;
}

function elementOf(node) {
  const inner = unwrap(node);
  return inner?._def?.type || null; // ZodArray element
}

/**
 * Does `path` (dot notation, e.g. "homeowner.name") resolve inside `schema`?
 * Array segments are traversed when the next segment is numeric or the array's element
 * is an object and the caller is naming a field on it.
 */
export function schemaHasPath(schema, path) {
  const parts = String(path).split('.').filter(Boolean);
  let node = schema;
  for (const part of parts) {
    if (!node) return false;
    const shape = shapeOf(node);
    if (shape && Object.prototype.hasOwnProperty.call(shape, part)) {
      node = shape[part];
      continue;
    }
    const el = elementOf(node);
    if (el) {
      if (/^\d+$/.test(part)) { node = el; continue; }
      const elShape = shapeOf(el);
      if (elShape && Object.prototype.hasOwnProperty.call(elShape, part)) { node = elShape[part]; continue; }
    }
    return false;
  }
  return true;
}

/** Every leaf path in a schema, for error messages that suggest the right spelling. */
export function listSchemaPaths(schema, prefix = '', depth = 0) {
  if (depth > 4) return [];
  const shape = shapeOf(schema);
  if (!shape) return prefix ? [prefix] : [];
  const out = [];
  for (const [key, child] of Object.entries(shape)) {
    const p = prefix ? `${prefix}.${key}` : key;
    const childShape = shapeOf(child);
    if (childShape) out.push(...listSchemaPaths(child, p, depth + 1));
    else out.push(p);
  }
  return out;
}

const DOTTED = '[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)*';

/**
 * Pull the payload paths an editor source file writes.
 * Recognises the three shapes the editors actually use:
 *   set('payment.total_cents', v)      onSave('scope_of_work.groups', next)
 *   onSave({ 'homeowner.name': v })    { 'totals.tax_cents': n }   (patch objects)
 * Template-literal paths are deliberately not matched — an editor that builds a path at
 * runtime cannot be statically verified, so this test forces paths to be written out.
 */
export function extractWrittenPaths(source) {
  const found = new Set();
  const call = new RegExp(`(?:\\bset|\\bonSave|\\bsetMany)\\(\\s*'(${DOTTED})'`, 'g');
  const key = new RegExp(`'(${DOTTED}\\.${DOTTED})'\\s*:`, 'g');
  let m;
  while ((m = call.exec(source)) !== null) found.add(m[1]);
  while ((m = key.exec(source)) !== null) found.add(m[1]);
  return [...found].sort();
}

/** Paths the caller is allowed to write even though they are not leaves (arrays, objects). */
export function suggestClosest(path, all) {
  const tail = String(path).split('.').pop();
  return all.filter((p) => p.endsWith(`.${tail}`) || p === tail).slice(0, 3);
}
