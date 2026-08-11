// Readable URLs.
//
// Every address in the app was a raw UUID — /documents/b7de498e-df40-47cf-bc54-5600caf50658.
// That is unreadable, unspeakable over the phone, and tells you nothing about what you are
// about to open. Documents already carry a number that is printed on the PDF itself
// (CTR-2026-0019), so that is the address. Projects have no such number, so the slug is the
// project name plus a short id so two "123 Oak St" projects stay distinguishable.
//
// Rules that matter:
//   - UUID addresses keep working forever. Links already sent to people must not rot.
//   - Resolution never guesses. An ambiguous or unknown slug resolves to null and the caller
//     shows a not-found, rather than opening whichever project happened to sort first.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Is this address the raw primary key rather than a slug? */
export function isUuid(s) {
  return UUID_RE.test(String(s || '').trim());
}

/**
 * Lowercase, hyphen-joined, ASCII-ish. Accents are folded rather than dropped so
 * "Peña Residence" becomes "pena-residence" and not "pea-residence".
 */
export function slugify(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')   // strip combining marks left by NFKD
    .replace(/['\u2019]/g, '')          // O'Brien -> obrien, not o-brien
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** The short id tail that makes a project slug unambiguous. */
export function idTail(id) {
  return String(id || '').replace(/-/g, '').slice(0, 8).toLowerCase();
}

/**
 * Canonical path for a document. The document number is unique and human-readable, so it is
 * the address; falls back to the id if a row somehow has no number yet.
 */
export function docHref(doc) {
  const ref = doc && (doc.doc_number || doc.id);
  // A half-loaded row must not become /documents/undefined, which renders as a 404 that
  // looks like the document was deleted.
  if (!ref) return '/work?type=documents';
  return `/documents/${encodeURIComponent(ref)}`;
}

/** Canonical path for a project: readable name + short id. */
export function projectHref(project) {
  if (!project) return '/work?type=projects';
  const base = slugify(project.name);
  const tail = idTail(project.id);
  return `/projects/${base ? `${base}-${tail}` : tail}`;
}

/**
 * Resolve a project address back to a real id.
 *
 * Matches on the id tail first because that is the part guaranteed unique — renaming a
 * project must not break links that are already out there. Falls back to an exact name-slug
 * match for hand-typed URLs, and refuses when that is ambiguous.
 *
 * @returns {string|null} the project id, or null if it cannot be resolved unambiguously
 */
export function projectIdFromRef(ref, projects) {
  const s = String(ref || '').trim();
  if (!s) return null;
  if (isUuid(s)) return s;
  const list = Array.isArray(projects) ? projects : [];

  const tail = s.slice(s.lastIndexOf('-') + 1).toLowerCase();
  if (/^[0-9a-f]{6,}$/.test(tail)) {
    const hits = list.filter((p) => idTail(p.id).startsWith(tail));
    if (hits.length === 1) return hits[0].id;
    if (hits.length > 1) return null;   // ambiguous: refuse rather than pick
  }

  const byName = list.filter((p) => slugify(p.name) === s);
  if (byName.length === 1) return byName[0].id;
  return null;
}

/**
 * Resolve a document address to an id using an already-loaded list, for callers that have
 * one and want to skip a round trip. The API also accepts a document number directly.
 */
export function docIdFromRef(ref, docs) {
  const s = String(ref || '').trim();
  if (!s) return null;
  if (isUuid(s)) return s;
  const hit = (Array.isArray(docs) ? docs : [])
    .find((d) => String(d.doc_number || '').toLowerCase() === s.toLowerCase());
  return hit ? hit.id : null;
}
