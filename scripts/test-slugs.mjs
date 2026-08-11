// test-slugs — readable URLs must round-trip, and must never resolve to the wrong record.
//
// The failure that matters is not an ugly URL, it is a slug that silently opens someone
// else's project. Every resolution case below asserts either the exact right id or null.

import {
  isUuid, slugify, idTail, docHref, projectHref, projectIdFromRef, docIdFromRef,
} from '../src/lib/slugs.js';

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; } else { fail++; console.log(`FAIL  ${label}`); } }
function eq(a, b, label) { ok(Object.is(a, b), `${label} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }

// ─── 1. uuid detection ──────────────────────────────────────────────────────
eq(isUuid('b7de498e-df40-47cf-bc54-5600caf50658'), true, 'a real uuid is a uuid');
eq(isUuid('B7DE498E-DF40-47CF-BC54-5600CAF50658'), true, 'uppercase uuid is a uuid');
eq(isUuid('CTR-2026-0019'), false, 'a document number is not a uuid');
eq(isUuid('88-raritan-avenue-dce232a6'), false, 'a project slug is not a uuid');
eq(isUuid(''), false, 'empty is not a uuid');
eq(isUuid(null), false, 'null is not a uuid');

// ─── 2. slugify ─────────────────────────────────────────────────────────────
eq(slugify('88 Raritan Avenue Highland Park NJ'), '88-raritan-avenue-highland-park-nj', 'spaces become hyphens');
eq(slugify('123 Oak St.'), '123-oak-st', 'trailing punctuation is dropped, not left as a hyphen');
eq(slugify("O'Brien Residence"), 'obrien-residence', 'a straight apostrophe does not split the word');
eq(slugify('O\u2019Brien Residence'), 'obrien-residence', 'a curly apostrophe does not split the word either');
eq(slugify('Pe\u00f1a Residence'), 'pena-residence', 'accents fold to their base letter');
eq(slugify('  Fahad   Kiani  '), 'fahad-kiani', 'runs of whitespace collapse');
eq(slugify('—'), '', 'a name with nothing sluggable yields empty, not a hyphen');
ok(slugify('x'.repeat(200)).length <= 60, 'a very long name is capped');
ok(!slugify('x'.repeat(59) + ' tail').endsWith('-'), 'capping never leaves a trailing hyphen');

// ─── 3. document addresses ──────────────────────────────────────────────────
eq(docHref({ doc_number: 'CTR-2026-0019', id: 'b7de498e-df40-47cf-bc54-5600caf50658' }),
  '/documents/CTR-2026-0019', 'a document is addressed by its number');
eq(docHref({ id: 'b7de498e-df40-47cf-bc54-5600caf50658' }),
  '/documents/b7de498e-df40-47cf-bc54-5600caf50658', 'no number falls back to the id');
eq(docHref(null), '/work?type=documents', 'no document at all goes to the list, not to /documents/undefined');

const DOCS = [
  { id: 'aaaaaaaa-0000-4000-8000-000000000001', doc_number: 'CTR-2026-0019' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000002', doc_number: 'INV-2026-0003' },
];
eq(docIdFromRef('CTR-2026-0019', DOCS), 'aaaaaaaa-0000-4000-8000-000000000001', 'number resolves to its id');
eq(docIdFromRef('ctr-2026-0019', DOCS), 'aaaaaaaa-0000-4000-8000-000000000001', 'number match is case-insensitive');
eq(docIdFromRef('aaaaaaaa-0000-4000-8000-000000000002', DOCS), 'aaaaaaaa-0000-4000-8000-000000000002', 'a uuid passes straight through');
eq(docIdFromRef('CTR-2026-9999', DOCS), null, 'an unknown number refuses');
eq(docIdFromRef('', DOCS), null, 'an empty ref refuses');

// ─── 4. project addresses ───────────────────────────────────────────────────
const P1 = { id: 'dce232a6-1111-4000-8000-000000000001', name: '88 Raritan Avenue Highland Park NJ' };
const P2 = { id: '834cceae-2222-4000-8000-000000000002', name: '123 Oak St' };
const P3 = { id: '834ccebb-3333-4000-8000-000000000003', name: '123 Oak St' };   // same name, different project
const PROJECTS = [P1, P2, P3];

eq(projectHref(P1), '/projects/88-raritan-avenue-highland-park-nj-dce232a6', 'project slug is name + short id');
eq(projectHref({ id: '834cceae-2222-4000-8000-000000000002', name: '' }), '/projects/834cceae', 'a nameless project still gets a usable address');
eq(projectHref(null), '/work?type=projects', 'no project goes to the list');

eq(projectIdFromRef(projectHref(P1).split('/').pop(), PROJECTS), P1.id, 'project slug round-trips');
eq(projectIdFromRef(projectHref(P2).split('/').pop(), PROJECTS), P2.id, 'duplicate names stay distinguishable — first');
eq(projectIdFromRef(projectHref(P3).split('/').pop(), PROJECTS), P3.id, 'duplicate names stay distinguishable — second');
eq(projectIdFromRef(P1.id, PROJECTS), P1.id, 'a raw uuid still resolves');

// The whole point of the id tail: renaming must not break a link already sent out.
eq(projectIdFromRef('completely-different-name-dce232a6', PROJECTS), P1.id, 'a renamed project still resolves by its id tail');

// Refusals.
eq(projectIdFromRef('123-oak-st', PROJECTS), null, 'a bare duplicated name is ambiguous and refuses');
eq(projectIdFromRef('88-raritan-avenue-highland-park-nj', PROJECTS), P1.id, 'a unique bare name still resolves');
eq(projectIdFromRef('nothing-like-this-ffffffff', PROJECTS), null, 'an unknown id tail refuses');
eq(projectIdFromRef('', PROJECTS), null, 'an empty ref refuses');
eq(projectIdFromRef('anything', []), null, 'nothing loaded yet refuses rather than guessing');

// A tail that collides across two projects must refuse, not pick one.
const COLLIDE = [
  { id: 'abcdef12-0000-4000-8000-000000000001', name: 'One' },
  { id: 'abcdef12-0000-4000-8000-000000000002', name: 'Two' },
];
eq(projectIdFromRef('one-abcdef12', COLLIDE), null, 'a colliding id tail refuses rather than opening the wrong project');

// ─── 5. no address is ever undefined ────────────────────────────────────────
for (const [label, href] of [
  ['docHref({})', docHref({})],
  ['projectHref({})', projectHref({})],
]) {
  ok(!/undefined|null|NaN/.test(href), `${label} produces no undefined in the URL — got ${href}`);
}

console.log(`\ntest-slugs: PASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
