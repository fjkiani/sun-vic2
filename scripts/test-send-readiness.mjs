// test-send-readiness — the send path, held to what production actually reported.
//
// Baseline measured against the live deployment before this change: 17 of 17 documents could
// not be sent, 17 of 17 had no recipient (so the button was a silent no-op and never called the
// API at all), and 13 of 17 were additionally blocked by the readiness gate. The nine distinct
// blocking fields observed are pinned below.
//
// Two properties are asserted:
//   1. preflight in the browser agrees with what the server returned, so the live checklist is
//      not a second, drifting opinion.
//   2. every blocking field, and every field the form can edit, resolves to a tab+section — a
//      "Fix →" that lands nowhere is worse than no button, because the field is not merely
//      scrolled off, it is unmounted.

import { readFileSync } from 'node:fs';
import { preflight } from '../packages/validation/guardrails.js';
import { sectionForPath, formTabsFor, LEGAL_TABS } from '../src/components/doc/docSections.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const eq = (a, b, m) => ok(a === b, `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// The exact blocking fields the production sweep returned, with how many documents each hit.
const PRODUCTION_BLOCKERS = {
  'timeline.start_date': 10,
  'homeowner.address': 9,
  'payment.total_cents': 8,
  'homeowner.name': 7,
  'bill_to.property_address': 3,
  'totals.total_due_cents': 3,
  'milestone_label': 3,
  'bill_to.client_name': 2,
  'payment.schedule': 1,
};

console.log('1. every field production reported as blocking resolves to somewhere fixable');
{
  for (const [field, count] of Object.entries(PRODUCTION_BLOCKERS)) {
    const tmpl = field.startsWith('bill_to') || field.startsWith('totals') || field === 'milestone_label'
      ? 'invoice' : 'contract';
    const loc = sectionForPath(tmpl, field);
    ok(loc !== null, `${field} (blocked ${count} docs) must resolve to a tab+section`);
    if (loc) {
      const tabs = loc.tab === 'form' ? formTabsFor(tmpl) : LEGAL_TABS;
      ok(tabs.some((t) => t.id === loc.section), `${field} -> ${loc.tab}/${loc.section} is a real section`);
    }
  }
}

console.log('2. the silent no-op is now a reported blocker, not a dead button');
{
  // A contract with everything filled EXCEPT a recipient — the exact shape of all 17 live docs.
  const doc = {
    template: 'contract',
    client_email: null,
    payload: {
      homeowner: { name: 'Maria Delgado', address: '88 Raritan Avenue, Highland Park, NJ', email: '' },
      payment: { total_cents: 4850000, schedule: [{ milestone: 'Deposit', percent: 100, condition: 'On signing' }] },
      timeline: { start_date: '2026-09-01' },
    },
  };
  const none = preflight(doc, 'email', { recipient: '' });
  ok(!none.ok, 'a document with no recipient is not sendable');
  ok(none.blocking.some((i) => i.field === 'recipient'), 'and says so explicitly, as a named issue');
  eq(none.blocking.length, 1, 'the recipient is the ONLY thing wrong with this one');

  const withTo = preflight(doc, 'email', { recipient: 'maria@example.com' });
  ok(withTo.ok, 'supplying a recipient at send time makes it sendable without editing the document');
  eq(withTo.blocking.length, 0, 'nothing else blocks it');
}

console.log('3. the checklist clears field by field as you fill them in');
{
  const empty = {
    template: 'contract',
    payload: { homeowner: {}, payment: {}, timeline: {} },
  };
  const start = preflight(empty, 'email', { recipient: 'a@b.com' });
  const fields = start.blocking.map((i) => i.field);
  ok(fields.includes('homeowner.name'), 'missing name is reported');
  ok(fields.includes('homeowner.address'), 'missing address is reported');
  ok(fields.includes('payment.total_cents'), 'missing total is reported');
  ok(fields.includes('timeline.start_date'), 'missing start date is reported');

  // Fill them one at a time; the count must fall monotonically and never rise.
  const steps = [
    ['homeowner.name', 'Maria Delgado'],
    ['homeowner.address', '88 Raritan Avenue'],
    ['payment.total_cents', 4850000],
    ['timeline.start_date', '2026-09-01'],
  ];
  let payload = JSON.parse(JSON.stringify(empty.payload));
  let prev = start.blocking.length;
  for (const [path, value] of steps) {
    const parts = path.split('.');
    let cur = payload;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] ??= {};
    cur[parts[parts.length - 1]] = value;
    const now = preflight({ template: 'contract', payload }, 'email', { recipient: 'a@b.com' }).blocking.length;
    ok(now < prev, `filling ${path} removes a blocker (${prev} -> ${now})`);
    prev = now;
  }

  // Filling the four *named* fields does NOT clear the gate, and that is correct: a contract
  // with no payment schedule is not sendable either. The production sweep saw this on one
  // document. Asserting "0 here" would have been asserting a bug, so pin what actually remains.
  const left = preflight({ template: 'contract', payload }, 'email', { recipient: 'a@b.com' }).blocking;
  eq(left.length, 1, 'four fields down, one blocker left');
  eq(left[0]?.field, 'payment.schedule', 'and it is the payment schedule, not something unnamed');

  payload.payment.schedule = [{ milestone: 'Deposit', percent: 100, condition: 'On signing' }];
  const done = preflight({ template: 'contract', payload }, 'email', { recipient: 'a@b.com' });
  ok(done.ok, 'adding the schedule clears the gate entirely');
  eq(done.blocking.length, 0, 'nothing blocking remains');
}

console.log('4. a required money field is not satisfied by zero');
{
  const zero = {
    template: 'contract',
    payload: {
      homeowner: { name: 'A', address: 'B' },
      payment: { total_cents: 0, schedule: [{ milestone: 'Deposit', percent: 100, condition: 'x' }] },
      timeline: { start_date: '2026-09-01' },
    },
  };
  const r = preflight(zero, 'email', { recipient: 'a@b.com' });
  ok(!r.ok, 'a $0 contract total still blocks the send');
  ok(r.blocking.some((i) => i.field === 'payment.total_cents'), 'and names the total as the reason');
  // This matters because 12 of the 17 live documents carry total_cents: 0.
}

console.log('5. every "Fix" jump lands on the section that actually mounts the field');
{
  // Not "resolves to a real section" — that is too weak. Both 'cover' and 'payment' are real
  // invoice sections, so a field living in CoverBlock but mapped to 'payment' would pass a
  // mere existence check while leaving the user staring at a section that never renders it.
  // So recover, from the source, which accordion block each FieldRow is physically inside,
  // and require sectionForPath to name a sub-tab whose block list contains THAT block.

  /** Form editors dispatch blocks through `case 'id': return <FnNameBlock ...>`. */
  function formEditorRows(file) {
    const src = readFileSync(file, 'utf8');
    const fnToBlock = new Map();
    for (const m of src.matchAll(/case\s+'([a-z_]+)':\s*return\s+<(\w+)/g)) fnToBlock.set(m[2], m[1]);
    const rows = [];
    let fn = null;
    for (const line of src.split('\n')) {
      const d = line.match(/^function\s+(\w+)\s*\(/);
      if (d) fn = d[1];
      for (const m of line.matchAll(/<FieldRow[^>]*\spath="([^"]+)"/g)) {
        rows.push({ path: m[1], block: fnToBlock.get(fn) || null, where: `${fn}` });
      }
    }
    return rows;
  }

  /** LegalEditor is one BlockBody with a switch, so the nearest preceding case IS the block. */
  function legalEditorRows(file) {
    const src = readFileSync(file, 'utf8');
    const rows = [];
    let block = null;
    for (const line of src.split('\n')) {
      const c = line.match(/^\s*case\s+'([a-z_]+)':/);
      if (c) block = c[1];
      for (const m of line.matchAll(/<FieldRow[^>]*\spath="([^"]+)"/g)) {
        rows.push({ path: m[1], block, where: `BlockBody:${block}` });
      }
    }
    return rows;
  }

  const legal = legalEditorRows('src/components/editors/LegalEditor.jsx');
  const perTemplate = {
    contract: [...formEditorRows('src/components/editors/ContractFormEditor.jsx'), ...legal],
    invoice: [...formEditorRows('src/components/editors/InvoiceFormEditor.jsx'), ...legal],
  };

  for (const [template, rows] of Object.entries(perTemplate)) {
    ok(rows.length > 20, `${template}: recovered ${rows.length} editable rows with their blocks`);

    const unplaced = rows.filter((r) => !r.block);
    ok(unplaced.length === 0,
      `${template}: every row was traced to a block (untraced: ${unplaced.map((r) => `${r.path}@${r.where}`).join(', ')})`);

    const wrong = [];
    for (const r of rows) {
      if (!r.block) continue;
      const loc = sectionForPath(template, r.path);
      if (!loc) { wrong.push(`${r.path}: no section at all`); continue; }
      const tabs = loc.tab === 'form' ? formTabsFor(template) : LEGAL_TABS;
      const tab = tabs.find((t) => t.id === loc.section);
      if (!tab) { wrong.push(`${r.path}: -> ${loc.tab}/${loc.section}, which is not a tab`); continue; }
      // The invoice form shows a couple of legal texts inline as a convenience; landing on the
      // Legal copy of the same path is still a place the field is mounted and editable.
      if (!tab.blocks.includes(r.block) && loc.tab !== 'legal') {
        wrong.push(`${r.path}: rendered in '${r.block}' but Fix jumps to ${loc.tab}/${loc.section} [${tab.blocks.join('|')}]`);
      }
    }
    ok(wrong.length === 0, `${template}: no Fix jump lands on a section that does not mount the field\n     ${wrong.join('\n     ')}`);
  }
}

console.log('6. unknown paths fail closed rather than pointing somewhere wrong');
{
  eq(sectionForPath('contract', 'not_a_real_block.thing'), null, 'an unknown root returns null');
  eq(sectionForPath('contract', ''), null, 'an empty path returns null');
  eq(sectionForPath('contract', null), null, 'a null path returns null');
  // A null answer means the UI leaves the row non-jumpable, which is honest. Guessing a
  // section would scroll the user somewhere unrelated and look broken.
}

console.log(`\ntest-send-readiness: PASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
