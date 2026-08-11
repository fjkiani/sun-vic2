// test-clarify-budget.mjs
//
// The copilot could not finish a contract in production. The cause was not the
// model: MAX_CLARIFY_TURNS was a hard-coded 3 while a contract has 5 required
// slots, so a cooperative user answering one question per turn was cut off at
// question 3 of 5 and pushed into the `refuse` stage. 5 > 3 — the interview was
// arithmetically impossible to complete, and no amount of prompt tuning could
// have fixed it.
//
// Everything here is pure arithmetic over the real slot and tool definitions.
// No LLM, no network. This file exists so that inequality can never come back.

import {
  slotDefsFor,
  requiredSlotDefs,
  clarifyBudget,
  CLARIFY_HEADROOM,
  missingRequiredSlots,
  ALL_SLOT_KEYS,
} from '../packages/agent/thread-slots.js';
import { threadToolDefs } from '../packages/agent/thread-tools.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL', msg); } };
const section = (s) => console.log(`\n${s}`);

const TEMPLATES = ['contract', 'invoice'];

// ─── 1. The invariant that was violated in production ─────────────────────
section('1. clarify budget must cover the interview');
for (const t of TEMPLATES) {
  const req = requiredSlotDefs(t).length;
  const budget = clarifyBudget(t);
  console.log(`  ${t}: ${req} required slots, budget ${budget}`);
  ok(req > 0, `${t} has at least one required slot`);
  // THE regression guard. A budget below the required count means a user who
  // answers every question correctly still gets refused.
  ok(budget >= req, `${t}: budget ${budget} >= ${req} required slots (a cooperative user must be able to finish)`);
  ok(budget >= req + CLARIFY_HEADROOM, `${t}: budget leaves ${CLARIFY_HEADROOM} spare for a re-ask`);
  // And the old constant must genuinely be gone, not merely renamed.
  ok(budget !== 3 || req <= 1, `${t}: budget is derived, not the old hard-coded 3`);
}

// ─── 2. Simulate the interview the stage machine actually runs ────────────
// Model of thread-agent.js: each ask_slot spends 1 budget unit; a turn that
// fills a slot resets the counter to 0. Stage flips to `refuse` when
// clarifyCount >= clarifyBudget(template) while required slots remain.
section('2. simulated cooperative interview reaches ready_to_generate');
function runInterview(template, { answersLand = true } = {}) {
  const gathered = {};
  let clarify = 0;
  const asked = [];
  for (let turn = 0; turn < 40; turn++) {
    const missing = missingRequiredSlots(template, gathered);
    if (missing.length === 0) return { outcome: 'ready_to_generate', turns: turn, asked, clarify };
    if (clarify >= clarifyBudget(template)) return { outcome: 'refuse', turns: turn, asked, clarify };
    const target = missing[0];
    asked.push(target.key);
    clarify += 1;                       // the agent asks
    if (answersLand) {
      gathered[target.key] = target.type === 'multi-enum' ? ['Interiors'] : 'answered';
      clarify = 0;                      // learning something resets the stall counter
    }
  }
  return { outcome: 'looped', turns: 40, asked, clarify };
}

for (const t of TEMPLATES) {
  const r = runInterview(t, { answersLand: true });
  console.log(`  ${t}: cooperative user -> ${r.outcome} after ${r.turns} question(s) [${r.asked.join(', ')}]`);
  ok(r.outcome === 'ready_to_generate', `${t}: a user who answers every question reaches ready_to_generate`);
  ok(r.turns === requiredSlotDefs(t).length, `${t}: took exactly ${requiredSlotDefs(t).length} questions, no wasted turns`);
}

// The same simulation under the OLD rules must fail, or this test proves nothing.
section('3. the old rules are proven to fail (positive control)');
function runInterviewOldRules(template) {
  const gathered = {};
  let clarify = 0;
  for (let turn = 0; turn < 40; turn++) {
    const missing = missingRequiredSlots(template, gathered);
    if (missing.length === 0) return { outcome: 'ready_to_generate', turns: turn };
    if (clarify >= 3) return { outcome: 'refuse', turns: turn };  // hard-coded cap
    const target = missing[0];
    clarify += 1;                        // no reset on progress
    gathered[target.key] = target.type === 'multi-enum' ? ['Interiors'] : 'answered';
  }
  return { outcome: 'looped', turns: 40 };
}
{
  const old = runInterviewOldRules('contract');
  console.log(`  contract under old rules -> ${old.outcome} after ${old.turns} question(s)`);
  ok(old.outcome === 'refuse', 'positive control: the old fixed cap of 3 did refuse a cooperative contract user');
  ok(old.turns === 3, 'positive control: it gave up at exactly question 3 of 5');
  const oldInv = runInterviewOldRules('invoice');
  console.log(`  invoice under old rules  -> ${oldInv.outcome} after ${oldInv.turns} question(s)`);
  ok(oldInv.outcome === 'ready_to_generate', 'positive control: invoices were unaffected (2 required <= 3), matching the bug report');
}

// ─── 4. A stalled user must still be cut off ──────────────────────────────
section('4. an unproductive user is still refused (the guard still guards)');
for (const t of TEMPLATES) {
  const r = runInterview(t, { answersLand: false });
  console.log(`  ${t}: silent user -> ${r.outcome} after ${r.turns} question(s)`);
  ok(r.outcome === 'refuse', `${t}: a user who never answers is still refused`);
  ok(r.turns === clarifyBudget(t), `${t}: refused after exactly the budget (${clarifyBudget(t)})`);
  ok(r.turns < 40, `${t}: terminates — no infinite interrogation`);
}

// ─── 5. Cohere strict_tools eligibility ───────────────────────────────────
// strict_tools is the documented cure for HALLUCINATED_ALL_TOOL_CALLS, but
// Cohere rejects any tool whose parameters are all optional. generate_document
// used to be exactly that, so enabling strict mode would have swapped a 422 for
// a 400.
section('5. every thread tool is strict_tools-eligible');
const tools = threadToolDefs();
ok(tools.length === 6, `6 thread tools declared (${tools.length})`);
for (const t of tools) {
  const req = t.parameters?.required;
  ok(Array.isArray(req) && req.length > 0, `${t.name}: declares at least one required parameter (strict_tools requirement)`);
  for (const key of req || []) {
    ok(!!t.parameters?.properties?.[key], `${t.name}: required parameter "${key}" exists in properties`);
  }
}
const fieldCount = tools.reduce((n, t) => n + Object.keys(t.parameters?.properties || {}).length, 0);
console.log(`  total declared fields across tools: ${fieldCount}`);
ok(fieldCount <= 200, `under Cohere's 200-field strict_tools cap (${fieldCount})`);

// ─── 6. Tool subsets the stage machine hands the provider ─────────────────
// A single-tool menu is what turned "the model wants to ask a question" into a
// hard 422. Every stage must offer a plausible alternative move.
section('6. no stage declares a dead-end tool menu');
const SUBSETS = {
  gathering:         ['ask_slot', 'set_thread_title', 'lookup_document'],
  ready_to_generate: ['generate_document', 'lookup_document', 'set_thread_title'],
  refuse:            ['refuse_and_summarize', 'ask_slot'],
  editing:           ['send_to_client', 'lookup_document', 'set_thread_title'],
};
const known = new Set(tools.map((t) => t.name));
for (const [stage, names] of Object.entries(SUBSETS)) {
  ok(names.length >= 2, `${stage}: offers ${names.length} tools, not a single forced move`);
  for (const n of names) ok(known.has(n), `${stage}: "${n}" is a real tool`);
}

// ─── 7. ask_slot's enum must cover every slot the machine can ask for ─────
section('7. ask_slot enum covers every askable slot');
const askSlot = tools.find((t) => t.name === 'ask_slot');
const enumKeys = new Set(askSlot.parameters.properties.slot_key.enum);
for (const t of TEMPLATES) {
  for (const def of slotDefsFor(t)) {
    ok(enumKeys.has(def.key), `${t}: slot "${def.key}" is in the ask_slot enum (else strict_tools cannot express it)`);
  }
}
ok(enumKeys.size === ALL_SLOT_KEYS.length, `enum matches ALL_SLOT_KEYS (${enumKeys.size} vs ${ALL_SLOT_KEYS.length})`);

console.log(`\nPASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
