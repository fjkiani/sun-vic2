#!/usr/bin/env node
// Covers the start-date hole found by the live E2E: a prompt that plainly stated a start
// date produced timeline.start_date = null, which then blocked emailing the contract.

import { extractStartDate } from '../packages/agent/promptDates.js';

let pass = 0; const fails = [];
const eq = (a, b, label) => {
  if (a === b) { pass += 1; } else { fails.push(`${label} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`); }
};

// ── the exact phrasing that failed in production ──
eq(extractStartDate('New contract for Maria Delgado at 88 Raritan Avenue, Highland Park NJ. '
  + 'Interior renovation: kitchen cabinets and countertops, bathroom tile, and interior painting. '
  + 'Total is $48,500. Start date March 3 2026.'), '2026-03-03', 'the live E2E prompt');

// ── formats a contractor actually types ──
const cases = [
  ['Start date March 3 2026.', '2026-03-03'],
  ['Start date March 3, 2026', '2026-03-03'],
  ['Starting March 3rd, 2026', '2026-03-03'],
  ['We begin on 3 March 2026', '2026-03-03'],
  ['Work commences on the 3rd of March 2026', '2026-03-03'],
  ['Start 3/3/2026', '2026-03-03'],
  ['Start date 2026-03-03', '2026-03-03'],
  ['Kick off Sept 9 2026', '2026-09-09'],
  ['break ground Dec 1 2026', '2026-12-01'],
  ['Begins Jan 15, 2027', '2027-01-15'],
  ['start date 12/25/2026', '2026-12-25'],
];
for (const [text, want] of cases) eq(extractStartDate(text), want, JSON.stringify(text));

// ── it must not invent a date ──
for (const text of ['No dates here at all.', '', null, undefined, 'Total is $48,500.', 'Job number 2026-14']) {
  eq(extractStartDate(text), null, `no date in ${JSON.stringify(text)}`);
}

// ── impossible dates are rejected, not rolled over into a wrong answer ──
eq(extractStartDate('Start February 30 2026'), null, 'February 30 is rejected');
eq(extractStartDate('Start 13/45/2026'), null, 'month 13 / day 45 is rejected');
eq(extractStartDate('Start April 31 2026'), null, 'April 31 is rejected');
eq(extractStartDate('Start February 29 2024'), '2024-02-29', 'a real leap day is accepted');
eq(extractStartDate('Start February 29 2026'), null, 'a fake leap day is rejected');

// ── the start date is picked out from among several dates ──
eq(extractStartDate('Invoice dated January 5 2026. Work starts March 3 2026. Final completion September 3 2026.'),
  '2026-03-03', 'picks the start date, not the invoice date');
eq(extractStartDate('Prepared on 2026-01-05. Substantial completion 2026-09-03. Start date 2026-03-03.'),
  '2026-03-03', 'picks the cued date regardless of position');
// With no cue at all, first date in the text is the honest default.
eq(extractStartDate('Dated January 5 2026 for the Smith job, due September 3 2026.'),
  '2026-01-05', 'falls back to the first date when nothing is cued');

// ── the value is directly usable as the schema field ──
const out = extractStartDate('Start date March 3 2026');
eq(/^\d{4}-\d{2}-\d{2}$/.test(out), true, 'output is ISO YYYY-MM-DD');

console.log(`test-prompt-dates: PASS ${pass} FAIL ${fails.length}`);
fails.forEach((f) => console.log(`  - ${f}`));
if (fails.length) process.exit(1);
