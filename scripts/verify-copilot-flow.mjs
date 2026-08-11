// verify-copilot-flow — a real browser, the real bundle, a real LLM, a real multi-turn
// conversation that ends in a real document.
//
// The complaints this has to answer, literally:
//   "this doesnt even have a proper flow"      → reading order, and progress you can see
//   "the copilot feels like a siloed version/chatbot vs what we have here"
//                                              → same agent detail the document screen shows
//
// So the assertions are geometric and behavioural, not cosmetic:
//   - the agent's reply is physically ABOVE the box you answer it in (this was inverted)
//   - answering advances a visible checklist derived from the SAME slot definitions the
//     server-side agent uses
//   - applied tool calls and refusals render through the shared AgentTurnDetail component
//   - a created document appears inline and the page does NOT navigate out from under a
//     live conversation
//
// Real LLM turns cost real quota (default provider is Cohere on a trial key), so the run is
// deliberately short: one message that fills most slots via the extractors, then stepwise
// answers for whatever is left. Any document the agent creates is permanently deleted in
// `finally`.
//
// Usage: node scripts/verify-copilot-flow.mjs [--base http://localhost:4180] [--shots DIR] [--headed]

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4180');
const API = arg('--api', process.env.E2E_BASE || 'https://sun-vic2.vercel.app');
const TOKEN = process.env.E2E_TOKEN || 'mock-local-token';
const SHOTS = arg('--shots', '/workspace/shots/copilot');
const HEADED = args.includes('--headed');
const TURN_TIMEOUT = Number(arg('--turn-timeout', '90000'));
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  ok   ${m}`); } else { fail++; console.log(`  FAIL ${m}`); } };
const note = (m) => console.log(`  ~    ${m}`);

async function apiFetch(pathname, init = {}) {
  const r = await fetch(`${API}${pathname}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) },
  });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: r.status, data, text };
}

// Documents this run causes to exist. Deleted permanently at the end.
const createdDocIds = new Set();

async function docsSnapshot() {
  const r = await apiFetch('/api/documents');
  const list = r.data?.documents || r.data || [];
  return new Set((Array.isArray(list) ? list : []).map((d) => d.id));
}

// Send one message and wait for the assistant turn count to grow. Returns the reply text.
async function turn(page, text, label) {
  const before = await page.locator('[data-testid="copilot-agent-turn"]').count();
  await page.locator('[data-testid="copilot-input"]').fill(text);
  await page.locator('[data-testid="copilot-send"]').click();
  await page.waitForFunction(
    (n) => document.querySelectorAll('[data-testid="copilot-agent-turn"]').length > n,
    before,
    { timeout: TURN_TIMEOUT },
  );
  const reply = await page.locator('[data-testid="copilot-agent-turn"]').last().innerText();
  note(`${label}: "${reply.replace(/\s+/g, ' ').slice(0, 110)}"`);
  return reply;
}

async function checklistState(page) {
  const cl = page.locator('[data-testid="slot-checklist"]');
  if (await cl.count() === 0) return null;
  return {
    template: await cl.getAttribute('data-template'),
    filled: Number(await cl.getAttribute('data-filled')),
    required: Number(await cl.getAttribute('data-required')),
    rows: await page.locator('[data-testid="slot-row"]').evaluateAll((els) =>
      els.map((e) => ({
        slot: e.getAttribute('data-slot'),
        filled: e.getAttribute('data-filled') === '1',
        waiting: e.getAttribute('data-waiting') === '1',
        // The rendered value, not just the fact that something is there. Asserting only
        // filled-ness is how a run passed while writing the entire user message into
        // homeowner.name on a real contract.
        text: e.textContent.trim(),
      }))),
  };
}

async function main() {
  const docsBefore = await docsSnapshot();
  console.log(`live documents before: ${docsBefore.size}`);

  const browser = await chromium.launch({ headless: !HEADED });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript((t) => {
      localStorage.setItem('sunvic.token', t);
      localStorage.setItem('sunvic.auth.token', t);
    }, TOKEN);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    // ── 1. the page loads and starts as a prompt, not a dashboard ────────────────
    console.log('\n1. cold load');
    await page.goto(`${BASE}/copilot`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="copilot-page"]', { timeout: 30000 });
    ok(await page.locator('[data-testid="copilot-input"]').count() === 1, 'composer present on cold load');
    ok(await page.locator('[data-testid="copilot-conversation"]').count() === 0,
       'no empty conversation shell before the first message');
    ok(await page.locator('[data-testid="slot-checklist"]').count() === 0,
       'no checklist before a template is known (would be a lie about state)');
    await page.screenshot({ path: `${SHOTS}/01-cold.png`, fullPage: true });

    // ── 2. reading order: reply above the box you answer it in ───────────────────
    console.log('\n2. first turn and reading order');
    // Deliberately vague about most slots so the agent must ask at least one question.
    const r1 = await turn(page, 'Create a new home-improvement contract.', 'turn 1');
    ok(r1.trim().length > 0, 'agent replied with non-empty text');

    const conv = page.locator('[data-testid="copilot-conversation"]');
    ok(await conv.count() === 1, 'conversation panel appeared');

    const lastTurnBox = await page.locator('[data-testid="copilot-agent-turn"]').last().boundingBox();
    const inputBox = await page.locator('[data-testid="copilot-input"]').boundingBox();
    ok(lastTurnBox && inputBox && (lastTurnBox.y + lastTurnBox.height) <= inputBox.y + 1,
       `agent reply sits above the composer (reply bottom ${Math.round((lastTurnBox?.y ?? 0) + (lastTurnBox?.height ?? 0))}px, input top ${Math.round(inputBox?.y ?? 0)}px)`);

    const userBox = await page.locator('[data-testid="copilot-user-turn"]').first().boundingBox();
    ok(userBox && lastTurnBox && userBox.y < lastTurnBox.y,
       'your message reads before the agent answer (chronological, top to bottom)');

    // The dashboard must be out of the conversation's way, not wedged between question
    // and answer box. That layout is what produced the pasted screen in the complaint.
    const tabsBox = await page.locator('[role="tablist"]').first().boundingBox();
    ok(tabsBox && inputBox && tabsBox.y > inputBox.y,
       `business tabs sit below the composer (tabs ${Math.round(tabsBox?.y ?? 0)}px, input ${Math.round(inputBox?.y ?? 0)}px)`);
    await page.screenshot({ path: `${SHOTS}/02-first-turn.png`, fullPage: true });

    // ── 3. the flow is visible: a checklist bound to the server's own slot defs ──
    console.log('\n3. slot checklist');
    const cl1 = await checklistState(page);
    ok(cl1 !== null, 'checklist rendered once the agent settled on a template');
    if (cl1) {
      ok(cl1.template === 'contract', `checklist template = contract (got ${cl1.template})`);
      ok(cl1.required === 5, `contract needs 5 required slots (got ${cl1.required})`);
      ok(cl1.rows.length === cl1.required, `one row per required slot (${cl1.rows.length})`);
      const waiting = cl1.rows.filter((r) => r.waiting);
      ok(waiting.length <= 1, `at most one slot marked as being answered now (${waiting.length})`);
      note(`checklist ${cl1.filled}/${cl1.required}: ${cl1.rows.map((r) => `${r.slot}${r.filled ? '✓' : r.waiting ? '→' : '○'}`).join(' ')}`);
    }

    // ── 4. answering advances the checklist ──────────────────────────────────────
    console.log('\n4. answering fills slots');
    const filledBefore = cl1?.filled ?? 0;
    // This exact sentence is the one that produced
    //   homeowner.name = "Jane Smith, full gut renovation at 36 Bushnell Rd, $65,000, starting
    //                     September 1 2026."
    // on a real contract, because absorbPendingSlot fell back to writing the raw message in.
    const COMPOUND = 'Jane Smith, full gut renovation at 36 Bushnell Rd, $65,000, starting September 1 2026.';
    await turn(page, COMPOUND, 'turn 2');
    const cl2 = await checklistState(page);
    ok(cl2 !== null, 'checklist still rendered after answering');
    if (cl2) {
      ok(cl2.filled > filledBefore,
         `checklist advanced ${filledBefore} → ${cl2.filled} of ${cl2.required}`);
      const byKey = Object.fromEntries(cl2.rows.map((r) => [r.slot, r]));
      ok(byKey['homeowner.name']?.filled === true, 'homeowner name recorded from free text');
      ok(byKey['payment.total_cents']?.filled === true, 'budget total recorded from free text');

      // The regression that matters: the name must be the NAME, not the sentence.
      const nameText = byKey['homeowner.name']?.text || '';
      ok(/Jane Smith/.test(nameText), `homeowner name reads "Jane Smith" (${nameText})`);
      ok(!/renovation|Bushnell|65,000|September/.test(nameText),
         `homeowner name is not the whole message (${nameText})`);
      ok(nameText.length < 60, `homeowner name is name-length, not sentence-length (${nameText.length} chars)`);
      // And the other facts in that one sentence still landed in their own slots.
      ok(/Bushnell/.test(byKey['homeowner.address']?.text || ''),
         `address split out of the same sentence (${byKey['homeowner.address']?.text})`);
      ok(/2026-09-01|Sep/.test(byKey['timeline.start_date']?.text || ''),
         `start date split out of the same sentence (${byKey['timeline.start_date']?.text})`);
      // "full gut renovation" is an umbrella term, not a scope of work. Guessing
      // it wrote scope_categories = ["Demolition & Foundation"] and nothing else
      // onto a real contract — a whole-house job described as demolition with no
      // rebuild. The slot must stay open so the agent asks.
      ok(byKey['scope_categories']?.filled !== true,
         `scope not guessed from an umbrella term (${byKey['scope_categories']?.text || 'still open'})`);
      note(`checklist ${cl2.filled}/${cl2.required}: ${cl2.rows.map((r) => `${r.slot}${r.filled ? '✓' : r.waiting ? '→' : '○'}`).join(' ')}`);
      // The money row must read as money, not as raw cents. 6500000 on screen would be a bug.
      const moneyText = await page.locator('[data-slot="payment.total_cents"]').innerText();
      ok(/\$\s?65,000/.test(moneyText), `budget renders as dollars, not cents (${moneyText.replace(/\s+/g, ' ')})`);
    }
    await page.screenshot({ path: `${SHOTS}/03-checklist.png`, fullPage: true });

    // ── 5. finish the remaining slots, up to a bounded number of turns ──────────
    console.log('\n5. drive to a document');
    let cl = cl2;
    const ANSWERS = {
      'homeowner.name': 'Jane Smith',
      'homeowner.address': '36 Bushnell Rd, Edison, NJ 08820',
      'scope_categories': 'Demolition & Foundation, Interiors',
      'payment.total_cents': '$65,000',
      'timeline.start_date': 'September 1, 2026',
    };
    let guard = 0;
    while (cl && cl.filled < cl.required && guard < 5) {
      guard++;
      const next = cl.rows.find((r) => !r.filled);
      if (!next) break;
      await turn(page, ANSWERS[next.slot] || 'yes', `answer ${next.slot}`);
      cl = await checklistState(page);
      note(`checklist ${cl?.filled}/${cl?.required}`);
    }
    ok(cl !== null && cl.filled === cl.required,
       `all ${cl?.required} required slots filled in ${guard} follow-up turn(s)`);

    // The agent may need one more turn to actually call generate_document.
    let docCard = await page.locator('[data-testid="review-card"]').count();
    if (docCard === 0 && cl?.filled === cl?.required) {
      await turn(page, 'Yes, draft it.', 'draft');
      docCard = await page.locator('[data-testid="review-card"]').count();
    }

    // ── 6. the agent's work is shown, not just its prose ────────────────────────
    console.log('\n6. agent detail (the anti-silo assertion)');
    const detailCount = await page.locator('[data-testid="agent-turn-detail"]').count();
    const appliedCount = await page.locator('[data-testid="agent-tool-applied"]').count();
    const refusedCount = await page.locator('[data-testid="agent-tool-refused"]').count();
    note(`turn-detail blocks ${detailCount}, applied ${appliedCount}, refused ${refusedCount}`);
    ok(detailCount > 0, 'at least one turn showed what the agent did');
    ok(appliedCount > 0, 'an applied tool call is visible in the conversation');
    const appliedTools = await page.locator('[data-testid="agent-tool-applied"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-tool')));
    note(`tools shown: ${appliedTools.join(', ') || '(none)'}`);
    ok(!appliedTools.includes('ask_slot'),
       'conversational tools are not printed as "actions" (ask_slot suppressed)');

    // ── 7. a created document appears inline, and does not hijack the page ──────
    console.log('\n7. document lands inline');
    ok(docCard > 0, `document card rendered in the conversation (${docCard})`);
    ok(page.url().includes('/copilot'),
       `still on the copilot after the document was created (${page.url()})`);
    ok(await page.locator('[data-testid="copilot-input"]').count() === 1,
       'composer still available — the conversation can continue');
    const openBtn = await page.locator('[data-testid="copilot-open-doc"]').count();
    ok(openBtn > 0, 'an explicit "open it" action exists');
    await page.screenshot({ path: `${SHOTS}/04-document.png`, fullPage: true });

    // Record what was created so it can be removed.
    const docsAfter = await docsSnapshot();
    for (const id of docsAfter) if (!docsBefore.has(id)) createdDocIds.add(id);
    note(`documents created by this run: ${createdDocIds.size}`);
    ok(createdDocIds.size >= 1, 'a real document exists on the server (not just a UI card)');

    // What was PERSISTED, not what was rendered. This is the assertion that would have caught
    // the corrupted homeowner name on the first run.
    for (const id of createdDocIds) {
      const got = await apiFetch(`/api/documents/${id}`);
      const p = got.data?.document?.payload || {};
      const hname = p?.homeowner?.name ?? '';
      note(`persisted homeowner.name = ${JSON.stringify(hname)}`);
      ok(/Jane Smith/.test(hname), `contract stores a real homeowner name (${JSON.stringify(hname)})`);
      ok(!/renovation|Bushnell|65,000|September/.test(hname),
         'contract does not store the whole user message as the homeowner name');
      ok(String(hname).length < 60, `stored name is name-length (${String(hname).length} chars)`);
      const addr = p?.homeowner?.address ?? '';
      ok(/Bushnell/.test(addr), `contract stores the property address separately (${JSON.stringify(addr)})`);
      ok(Number(p?.payment?.total_cents) === 6500000,
         `contract stores $65,000 as 6500000 cents (got ${p?.payment?.total_cents})`);
    }

    // ── 8. URL state ────────────────────────────────────────────────────────────
    console.log('\n8. url-addressable tabs');
    await page.locator('[role="tab"]', { hasText: 'Prompts' }).first().click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('tab') === 'prompts',
      null, { timeout: 5000 }).catch(() => {});
    ok(new URL(page.url()).searchParams.get('tab') === 'prompts',
       `tab is in the URL (${page.url()})`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="copilot-page"]');
    const selected = await page.locator('[role="tab"][aria-selected="true"]').first().innerText();
    ok(/prompts/i.test(selected), `reload restores the tab from the URL (${selected})`);

    // ── 9. mobile ───────────────────────────────────────────────────────────────
    console.log('\n9. mobile');
    const mctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true, hasTouch: true, deviceScaleFactor: 3,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await mctx.addInitScript((t) => {
      localStorage.setItem('sunvic.token', t);
      localStorage.setItem('sunvic.auth.token', t);
    }, TOKEN);
    const mp = await mctx.newPage();
    const mErrors = [];
    mp.on('pageerror', (e) => mErrors.push(String(e)));
    await mp.goto(`${BASE}/copilot`, { waitUntil: 'domcontentloaded' });
    await mp.waitForSelector('[data-testid="copilot-page"]', { timeout: 30000 });
    const mSend = await mp.locator('[data-testid="copilot-send"]').boundingBox();
    ok(mSend && mSend.height >= 44, `send button is a real tap target (${Math.round(mSend?.height ?? 0)}px)`);
    ok(mSend && (mSend.x + mSend.width) <= 390, `send button inside the viewport (right edge ${Math.round((mSend?.x ?? 0) + (mSend?.width ?? 0))}px)`);
    const mInput = await mp.locator('[data-testid="copilot-input"]').boundingBox();
    ok(mInput && mInput.width > 150, `composer is usable width (${Math.round(mInput?.width ?? 0)}px)`);
    // 16px input text or iOS Safari zooms the page on focus.
    const fs = await mp.locator('[data-testid="copilot-input"]').evaluate((e) => getComputedStyle(e).fontSize);
    ok(parseFloat(fs) >= 16, `composer font is >= 16px so iOS does not zoom (${fs})`);
    await mp.screenshot({ path: `${SHOTS}/05-mobile.png`, fullPage: true });
    ok(mErrors.length === 0, `no mobile page errors${mErrors.length ? `: ${mErrors[0]}` : ''}`);
    await mctx.close();

    ok(errors.length === 0, `no desktop page errors${errors.length ? `: ${errors.slice(0, 2).join(' | ')}` : ''}`);
  } finally {
    await browser.close();
    // ── cleanup: permanently remove anything this run created ──────────────────
    for (const id of createdDocIds) {
      const d = await apiFetch(`/api/documents/${id}?permanent=1`, { method: 'DELETE' });
      const g = await apiFetch(`/api/documents/${id}`);
      ok(g.status === 404, `scratch document ${id.slice(0, 8)} permanently deleted (delete ${d.status}, get ${g.status})`);
    }
    const after = await docsSnapshot();
    console.log(`live documents after: ${after.size}`);
  }

  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
