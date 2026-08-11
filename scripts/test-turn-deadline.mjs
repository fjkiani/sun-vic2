// test-turn-deadline.mjs
//
// A production copilot turn came back 504. The interesting part is what a 504
// costs here: the server had already written a contract row, and the response
// body is the only thing that tells the browser a document was created. The
// gateway killed the reply, the card never rendered, and the conversation moved
// on to a stage where generate_document is no longer offered — so a real
// document existed and was unreachable from the conversation that made it.
//
// The cause was arithmetic, not luck. Nothing in the call path had a timeout:
//
//   runThreadTurn  loops up to MAX_ROUNDS times
//     provider.chat  can issue 3 sequential requests (hallucinated-tools chain)
//       fetch         had no signal at all
//
// so one 60s function could sit behind up to MAX_ROUNDS x 3 unbounded HTTP
// calls. This file proves the bounds now compose to less than the gateway's,
// reading the real constants out of the real files so the three cannot drift
// apart silently. No network, no LLM.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL', msg); } };
const section = (s) => console.log(`\n${s}`);

// Constants are parsed from source rather than imported because thread-agent.js
// pulls in the database client. Parsing also means a rename shows up as a
// failure here instead of as a silent 504 in production.
function constant(file, name) {
  const src = read(file);
  const m = src.match(new RegExp(`\\b${name}\\s*=\\s*([0-9_]+)`));
  if (!m) throw new Error(`${name} not found in ${file} — was it renamed?`);
  return Number(m[1].replace(/_/g, ''));
}

const TURN_DEADLINE_MS   = constant('packages/agent/thread-agent.js', 'TURN_DEADLINE_MS');
const MIN_TURN_SLICE_MS  = constant('packages/agent/thread-agent.js', 'MIN_TURN_SLICE_MS');
const MAX_ITERATIONS     = constant('packages/agent/thread-agent.js', 'MAX_ITERATIONS');
const MAX_ROUNDS         = constant('packages/agent/thread-agent.js', 'MAX_ROUNDS');
const POST_TIMEOUT_MS    = constant('packages/agent/providers/cohere.js', 'POST_TIMEOUT_MS');
const MIN_POST_MS        = constant('packages/agent/providers/cohere.js', 'MIN_POST_MS');
const CHAT_BUDGET_MS     = constant('packages/agent/providers/cohere.js', 'CHAT_BUDGET_MS');

// ─── 1. The gateway's own number ──────────────────────────────────────────
section('1. the gateway deadline is declared, not defaulted');
const vercel = JSON.parse(read('vercel.json'));
const THREADS_FN = 'api/threads/index.js';
const fn = vercel.functions?.[THREADS_FN];
ok(!!fn, `${THREADS_FN} has an explicit functions entry (the platform default is 10s, which every LLM turn would exceed)`);
const GATEWAY_MS = (fn?.maxDuration || 10) * 1000;
console.log(`  gateway allows ${GATEWAY_MS / 1000}s`);
ok(GATEWAY_MS >= 30_000, `${GATEWAY_MS / 1000}s is enough for a real model turn`);
// The turn route only reaches that function through this rewrite. If the
// rewrite changes shape the maxDuration silently stops applying.
const rw = (vercel.rewrites || []).find((r) => r.source?.startsWith('/api/threads'));
ok(!!rw, 'the /api/threads rewrite that routes turns to that function still exists');

// ─── 2. Each bound is inside the next one out ─────────────────────────────
section('2. the bounds nest');
console.log(`  fetch ${POST_TIMEOUT_MS / 1000}s  <  chat ${CHAT_BUDGET_MS / 1000}s  <  turn ${TURN_DEADLINE_MS / 1000}s  <  gateway ${GATEWAY_MS / 1000}s`);
ok(MIN_POST_MS < POST_TIMEOUT_MS, `MIN_POST_MS (${MIN_POST_MS}) below the per-call cap`);
ok(POST_TIMEOUT_MS <= CHAT_BUDGET_MS, `one call (${POST_TIMEOUT_MS}) cannot exceed the chain's default budget (${CHAT_BUDGET_MS})`);
// A caller that forgets to pass budget_ms must still be safe.
ok(CHAT_BUDGET_MS < TURN_DEADLINE_MS, `the adapter's default budget (${CHAT_BUDGET_MS}) is inside the turn deadline (${TURN_DEADLINE_MS})`);
ok(MIN_TURN_SLICE_MS < TURN_DEADLINE_MS, 'a round slice is smaller than the whole turn');
ok(MIN_TURN_SLICE_MS >= MIN_POST_MS, `a round is only started with room for at least one call (${MIN_TURN_SLICE_MS} >= ${MIN_POST_MS})`);
ok(TURN_DEADLINE_MS < GATEWAY_MS, `turn deadline ${TURN_DEADLINE_MS} < gateway ${GATEWAY_MS}`);

// ─── 3. Worst case, composed ──────────────────────────────────────────────
// The loop starts a round only while elapsed <= TURN_DEADLINE_MS - MIN_TURN_SLICE_MS,
// and hands chat() exactly the remaining budget. chat() clamps every request to
// what is left, except for the MIN_POST_MS floor — so the single way to run past
// the deadline is one final request overshooting by at most MIN_POST_MS. After
// the loop the turn still has to run its tool calls and append messages.
section('3. worst case composed against the gateway');
const TOOL_AND_PERSIST_HEADROOM_MS = 10_000;
const WORST = TURN_DEADLINE_MS + MIN_POST_MS + TOOL_AND_PERSIST_HEADROOM_MS;
console.log(`  worst case ${WORST / 1000}s = deadline ${TURN_DEADLINE_MS / 1000} + overshoot ${MIN_POST_MS / 1000} + persist headroom ${TOOL_AND_PERSIST_HEADROOM_MS / 1000}`);
console.log(`  slack under the gateway: ${(GATEWAY_MS - WORST) / 1000}s`);
ok(WORST < GATEWAY_MS, `worst case ${WORST}ms fits inside the gateway's ${GATEWAY_MS}ms`);
ok(GATEWAY_MS - WORST >= 5_000, 'at least 5s of slack, not a photo finish');

// ─── 4. Positive control: the configuration that actually 504'd ───────────
// Nothing below is hypothetical. MAX_ROUNDS rounds, three fallback attempts per
// round, and a measured-typical 12s Cohere call, with no timeout anywhere.
section('4. positive control — the old unbounded path');
const TYPICAL_CALL_MS = 12_000;
const ATTEMPTS_PER_CHAT = 3;
const OLD_WORST = MAX_ROUNDS * ATTEMPTS_PER_CHAT * TYPICAL_CALL_MS;
console.log(`  ${MAX_ROUNDS} rounds x ${ATTEMPTS_PER_CHAT} attempts x ${TYPICAL_CALL_MS / 1000}s = ${OLD_WORST / 1000}s against a ${GATEWAY_MS / 1000}s gateway`);
ok(OLD_WORST > GATEWAY_MS, 'the unbounded path really could outlive the gateway (this is the 504 that was observed)');
// Even the far more modest case — the retry chain firing once — was over.
const ONE_CHAIN = ATTEMPTS_PER_CHAT * TYPICAL_CALL_MS;
const TWO_ROUNDS = 2 * ONE_CHAIN;
console.log(`  and a single retry chain across two rounds was already ${TWO_ROUNDS / 1000}s`);
ok(TWO_ROUNDS > GATEWAY_MS, 'two rounds with one fallback chain each was already past the gateway');
// The same shape must be impossible now.
ok(TURN_DEADLINE_MS < ONE_CHAIN * MAX_ROUNDS, 'the deadline is what stops it, not a smaller round count');

// ─── 5. The mechanism is actually wired, not just declared ────────────────
section('5. the timeout is wired into the request');
const cohere = read('packages/agent/providers/cohere.js');
ok(/signal:\s*AbortSignal\.timeout\(/.test(cohere), 'fetch is given an AbortSignal.timeout');
ok(typeof AbortSignal.timeout === 'function', 'AbortSignal.timeout exists in this Node runtime');
ok(/status:\s*504/.test(cohere), 'an adapter timeout surfaces as 504, not as an opaque throw');
ok(/budget_ms/.test(cohere), 'chat() accepts a caller budget');
const agent = read('packages/agent/thread-agent.js');
ok(/budget_ms:\s*budgetLeft/.test(agent), 'the turn passes its remaining budget to the provider');
ok(/deadlineHit/.test(agent), 'the loop tracks hitting the deadline');

// ─── 6. Running out of time must answer, never throw ──────────────────────
// A deadline that produced a 500 would have solved nothing.
section('6. the deadline degrades into a reply');
ok(/deadlineHit \|\| iterations >= MAX_ITERATIONS \|\| rounds >= MAX_ROUNDS/.test(agent),
  'the deadline shares the graceful fallback with the iteration cap');
ok(/took longer than I can spend on a single turn/.test(agent), 'the fallback says what happened in plain words');
// Comments are stripped first: the fix deliberately quotes the old text so the
// next reader knows what was there, and that must not read as a regression.
const agentCode = agent.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
ok(!/hit the tool-call limit/.test(agentCode), 'the old jargon dead-end message is no longer emitted');
ok(/hit the tool-call limit/.test(agent), 'but it is still recorded in a comment, so the history is not lost');
ok(/pendingSlotAfter = next\.key/.test(agent), 'the fallback arms pending_slot so the next reply is absorbed as an answer');
ok(MAX_ITERATIONS <= MAX_ROUNDS, `MAX_ITERATIONS (${MAX_ITERATIONS}) <= MAX_ROUNDS (${MAX_ROUNDS}) so refunds cannot loop`);

// ─── 7. A lost response must not hide a document ──────────────────────────
// Bounding the turn makes a 504 unlikely; it does not make a dropped response
// impossible. The document a turn created has to be recoverable from state.
section('7. documents survive a lost response');
ok(/thread_documents/.test(agent), 'the turn reports every document tied to the thread, not only new ones');
ok(/thread_documents/.test(read('netlify/functions/thread-turn.js')), 'the HTTP layer passes it through');
ok(/thread_documents/.test(read('src/lib/useAgent.js')), 'the client keeps it');
const copilot = read('src/pages/CopilotPage.jsx');
ok(/recoveredDocs/.test(copilot), 'the copilot renders documents no turn announced');
ok(/shownDocIds/.test(copilot), 'and does not double-render ones it already showed');

console.log(`\nPASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
