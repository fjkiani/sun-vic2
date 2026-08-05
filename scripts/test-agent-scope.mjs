// The agent is now docked on every document tab, so what it is *aimed at* is the thing
// that decides whether "make this stricter" edits the warranty block or rewrites the scope
// of work. These assertions pin that mapping down.
//
// The specific hazard: sub-tab ids are a UI grouping and do not map one-to-one onto
// payload keys. Legal's "Terms" holds four unrelated blocks; Form's "Homeowner" also
// carries the contractor card. Scoping on the sub-tab name alone silently under-describes
// both, which is why block lists win when present.

import { buildScopedMessage, scopePlaceholder, scopeSuggestions, scopeTarget } from '../src/lib/agentScope.js';
import { CONTRACT_FORM_TABS, INVOICE_FORM_TABS, LEGAL_TABS, formTabsFor, blocksFor } from '../src/components/doc/docSections.js';
import { LEGAL_BLOCK_META } from '../src/components/editors/legal/legalMeta.js';

let pass = 0;
const failures = [];
function ok(cond, label, detail = '') {
  if (cond) { pass += 1; return; }
  failures.push(detail ? `${label} — ${detail}` : label);
}
function eq(a, b, label) { ok(a === b, label, `got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`); }

const PREFIX = /^\[The user is editing (.+?)\. Prefer changes there/;

// ── the user's words survive verbatim ────────────────────────
{
  const msg = 'Change the deposit to 20% and don\'t touch anything else.';
  for (const scope of [{}, { tab: 'ai' }, { tab: 'legal' }, { tab: 'form', section: 'payment' },
    { tab: 'legal', section: 'terms', blocks: ['permits', 'change_orders'] }]) {
    ok(buildScopedMessage(msg, scope).endsWith(msg),
      `Original message preserved verbatim for scope ${JSON.stringify(scope)}`);
  }
  eq(buildScopedMessage(msg, { tab: 'ai' }), msg, 'The AI tab adds no prefix at all');
  eq(buildScopedMessage(msg, {}), msg, 'An empty scope adds no prefix');
  eq(buildScopedMessage(msg), msg, 'A missing scope adds no prefix');
}

// ── blocks beat section, section beats tab ───────────────────
{
  const withBlocks = scopeTarget({ tab: 'legal', section: 'terms', blocks: ['warranties'] });
  eq(withBlocks, 'the warranties block', 'A block list wins over the sub-tab name');

  const sectionOnly = scopeTarget({ tab: 'legal', section: 'terms' });
  ok(sectionOnly.includes('permits') && sectionOnly.includes('change orders'),
    'A known sub-tab describes the blocks it contains', sectionOnly);

  const tabOnly = scopeTarget({ tab: 'legal' });
  ok(tabOnly.includes('warranties') && tabOnly.includes('permits'), 'Tab-level scope still works', tabOnly);

  // The regression the summary flagged: before block support, an unrecognised sub-tab id
  // fell all the way back to whole-tab scoping.
  ok(scopeTarget({ tab: 'legal', blocks: ['right_to_cancel', 'dispute_resolution'] })
    !== scopeTarget({ tab: 'legal' }),
    'Cancellation sub-tab is no longer indistinguishable from the whole legal tab');
  eq(scopeTarget({ tab: 'legal', blocks: [] }), scopeTarget({ tab: 'legal' }),
    'An empty block list degrades to tab scope rather than breaking');
  eq(scopeTarget({ tab: 'form', blocks: ['not_a_real_block'] }), scopeTarget({ tab: 'form' }),
    'An unknown block degrades to tab scope');
}

// ── every real sub-tab produces a distinct, specific target ──
{
  const seen = new Map();
  for (const [tab, tabs] of [['form', CONTRACT_FORM_TABS], ['legal', LEGAL_TABS]]) {
    for (const t of tabs) {
      const blocks = blocksFor(tabs, t.id);
      const target = scopeTarget({ tab, section: t.id, blocks });
      ok(!!target, `Sub-tab ${tab}/${t.id} resolves to a target`);
      ok(target !== scopeTarget({ tab }), `Sub-tab ${tab}/${t.id} is narrower than its tab`, target);
      const key = `${tab}:${target}`;
      ok(!seen.has(key), `Sub-tab ${tab}/${t.id} target is unique`, `collides with ${seen.get(key)}`);
      seen.set(key, t.id);
      // Every block the sub-tab contains should be named in the instruction. Compared with
      // separators normalised, because the labels are properly written English — the
      // right_to_cancel block reads "the right-to-cancel block", hyphenated.
      const flat = (s) => s.replace(/[-_\s]+/g, ' ').toLowerCase();
      for (const b of blocks) {
        ok(flat(target).includes(flat(b)) || ['cover'].includes(b),
          `Sub-tab ${tab}/${t.id} names its block "${b}"`, target);
      }
    }
  }
}

// ── every legal block is individually addressable ────────────
// This is what the section header button relies on: tapping the star on Warranties sends
// blocks:['warranties'] and must produce a warranties-specific instruction.
{
  for (const id of Object.keys(LEGAL_BLOCK_META)) {
    const target = scopeTarget({ tab: 'legal', blocks: [id] });
    ok(!!target, `Legal block "${id}" has a scope label`);
    ok(target !== scopeTarget({ tab: 'legal' }), `Legal block "${id}" is narrower than the tab`);
    const prefixed = buildScopedMessage('tighten this', { tab: 'legal', blocks: [id] });
    const m = prefixed.match(PREFIX);
    ok(!!m, `Legal block "${id}" produces a well-formed instruction prefix`);
    ok(m && m[1] === target, `Legal block "${id}" prefix carries its own label`);
  }
}

// ── multi-block joins read as English ────────────────────────
{
  const two = scopeTarget({ tab: 'legal', blocks: ['warranties', 'insurance'] });
  ok(two.includes(' and '), 'Two blocks are joined with "and"', two);
  ok(!two.includes(', and'), 'No Oxford comma artefact on two items', two);
  const three = scopeTarget({ tab: 'legal', blocks: ['warranties', 'insurance', 'unforeseen'] });
  ok(three.includes(', ') && three.includes(' and '), 'Three blocks read as a list', three);
  const mixed = scopeTarget({ tab: 'legal', blocks: ['warranties', 'nope'] });
  eq(mixed, 'the warranties block', 'Unknown blocks are dropped, known ones kept');
}

// ── placeholders and suggestions follow the scope ────────────
{
  eq(scopePlaceholder({ tab: 'legal', blocks: ['right_to_cancel'] }), 'Ask about right to cancel…',
    'A single focused block names itself in the placeholder');
  ok(scopePlaceholder({ tab: 'form' }).includes('job details'), 'Form tab placeholder is form-specific');
  ok(scopePlaceholder({}).length > 0, 'There is always a placeholder');

  const pay = scopeSuggestions({ tab: 'form', blocks: ['payment'] });
  ok(pay.some((s) => /100%/.test(s)), 'Payment block suggests the schedule check', pay.join(' | '));
  const scope = scopeSuggestions({ tab: 'form', blocks: ['scope_of_work'] });
  ok(scope.some((s) => /phases/i.test(s)), 'Scope block suggests phasing', scope.join(' | '));
  const inv = scopeSuggestions({ tab: 'form' }, { template: 'invoice' });
  ok(inv.some((s) => /invoice|amounts/i.test(s)), 'Invoice form gets invoice suggestions', inv.join(' | '));
  const ctr = scopeSuggestions({ tab: 'form' }, { template: 'contract' });
  ok(ctr.join() !== inv.join(), 'Contract and invoice suggestions differ');
  for (const s of [{ tab: 'ai' }, { tab: 'pdf' }, { tab: 'preview' }, { tab: 'legal' }, {}]) {
    ok(scopeSuggestions(s).length > 0, `Suggestions exist for ${JSON.stringify(s)}`);
  }
}

// ── invoice form tabs resolve too ────────────────────────────
{
  eq(formTabsFor('invoice'), INVOICE_FORM_TABS, 'Invoices use the invoice form tabs');
  eq(formTabsFor('contract'), CONTRACT_FORM_TABS, 'Contracts use the contract form tabs');
  for (const t of INVOICE_FORM_TABS) {
    const target = scopeTarget({ tab: 'form', section: t.id, blocks: blocksFor(INVOICE_FORM_TABS, t.id) });
    ok(!!target, `Invoice sub-tab ${t.id} resolves to a target`);
  }
}

// ── the prefix cannot be confused for user text ──────────────
{
  const out = buildScopedMessage('hello', { tab: 'form', blocks: ['payment'] });
  ok(out.startsWith('['), 'Instruction prefix is bracketed');
  ok(out.includes('\n\n'), 'Prefix is separated from the user message by a blank line');
  eq(out.split('\n\n').slice(1).join('\n\n'), 'hello', 'Everything after the blank line is the user message');
}

for (const f of failures) console.error(`FAIL  ${f}`);
console.log(`\ntest-agent-scope: PASS ${pass} FAIL ${failures.length}`);
process.exit(failures.length === 0 ? 0 : 1);
