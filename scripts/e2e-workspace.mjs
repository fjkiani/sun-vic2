#!/usr/bin/env node
/**
 * Iteration-7 gate: the consolidated workspace, at a real phone viewport.
 *
 * Deliberately a second script rather than an extension of e2e-mobile-ui.mjs — that suite
 * is the iteration-6 regression net and should keep passing untouched. This one asserts
 * only the new surfaces:
 *
 *   - the Live mirror is gone from every route that used to host it;
 *   - the PDF column's [PDF | Edit] toggle actually swaps panes;
 *   - all four project rail tabs open onto real content from inside the document editor;
 *   - the project page is tabbed, not a five-panel dump;
 *   - the milestone proposal reaches a 100%-validated confirm WITHOUT writing anything
 *     until a human clicks confirm — the human-in-the-loop claim, measured;
 *   - the copilot home leads with business KPIs.
 *
 * Every screen is also re-measured for horizontal overflow, sub-16px focusable text and
 * sub-44px tap targets, because new UI is exactly where those regress.
 *
 * Usage: node scripts/e2e-workspace.mjs [--headed] [--shots <dir>]
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.E2E_BASE || 'https://sun-vic2.vercel.app';
const TOKEN = process.env.E2E_TOKEN || 'mock-local-token';
const VIEWPORT = { width: 390, height: 844 }; // iPhone 12/13/14
const DESKTOP = { width: 1440, height: 900 };
const TAP_MIN = 44;

const shotsIdx = process.argv.indexOf('--shots');
const SHOTS = shotsIdx > -1 ? process.argv[shotsIdx + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let pass = 0;
const failures = [];
const ok = (cond, label, detail) => {
  if (cond) { pass += 1; console.log(`  ok   ${label}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail !== undefined ? ` — ${detail}` : ''}`); }
};
const line = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 58 - t.length))}`);

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* noop */ }
  return { status: res.status, json };
}

async function horizontalOverflow(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const overflow = de.scrollWidth - de.clientWidth;
    const offenders = [];
    if (overflow > 1) {
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > de.clientWidth + 1) {
          offenders.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').slice(0, 3).join('.')} right=${Math.round(r.right)}`);
          if (offenders.length >= 4) break;
        }
      }
    }
    return { overflow, offenders };
  });
}

async function zoomingInputs(page) {
  return page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('input, textarea, select')) {
      if (/^(checkbox|radio|hidden)$/.test(el.type || '')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 16) bad.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.placeholder || '').slice(0, 24)}" ${fs}px`);
    }
    return [...new Set(bad)].slice(0, 6);
  });
}

async function smallTapTargets(page) {
  return page.evaluate((min) => {
    const bad = [];
    for (const el of document.querySelectorAll('button, a[href], [role="button"], input, textarea, select')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      if (r.height < min) bad.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || el.placeholder || '').trim().slice(0, 24)}" h=${Math.round(r.height)}`);
    }
    return [...new Set(bad)].slice(0, 8);
  }, TAP_MIN);
}

// The editors collapse twice: an Accordion section, and inside it a FieldRow whose resting
// state is a readable summary line that only becomes an <input> when tapped. Counting
// inputs after opening just the accordion measures nothing.
//
// BOTH controls carry aria-expanded — ui/FieldRow.jsx:25 and ui/Accordion.jsx:48 — so
// "the buttons that are neither accordion headers nor tabs" selected no editor control at
// all, only page chrome. That earlier rule tapped the global md:hidden hamburger in
// header.bg-white.border-b, which opened the nav drawer, and the next click landed on a
// nav item: the suite navigated to /copilot mid-run and every subsequent tab click timed
// out against a tab strip reading "Business | Recent | Prompts".
//
// They are told apart structurally instead, classified against production DOM:
//   accordion header -> parent div.flex.items-stretch  (self "flex-1 …", depth 12)
//   field row        -> parent div.border-b            (self "w-full …", depth 14)
const ACC_HEADER = 'div.flex.items-stretch > button[aria-expanded]';
const FIELD_ROW = 'div.border-b > button[aria-expanded]';

async function openEditorFields(page, sections = 1, rows = 4) {
  const inputsBefore = await page.locator('input, textarea').count();

  // Re-query each pass: the accordion is single-open, so the closed set changes shape
  // after every click and cached nth() indices go stale.
  let openedSections = 0;
  for (let i = 0; i < sections; i++) {
    const h = page.locator(`${ACC_HEADER}[aria-expanded="false"]`).first();
    if (!(await h.count())) break;
    try { await h.click({ timeout: 3000 }); openedSections += 1; await page.waitForTimeout(400); } catch { break; }
  }

  let clicked = 0;
  for (let i = 0; i < rows; i++) {
    const r = page.locator(`${FIELD_ROW}[aria-expanded="false"]`).first();
    if (!(await r.count())) break;
    try { await r.click({ timeout: 3000 }); clicked += 1; await page.waitForTimeout(250); } catch { break; }
  }

  return {
    accordions: await page.locator(ACC_HEADER).count(),
    fieldRows: await page.locator(FIELD_ROW).count(),
    openedSections,
    clicked,
    inputsBefore,
    inputs: await page.locator('input, textarea').count(),
  };
}

/**
 * The suite once wandered onto /copilot without noticing and blamed the next locator.
 * Assert the route after any interaction that clicks unnamed controls.
 */
function assertStillOn(page, docId, where) {
  ok(page.url().includes(docId), `${where}: still on the document, not navigated away`, page.url());
}

/** One call, three measurements, applied to every new screen. */
async function screenHealth(page, name) {
  const of = await horizontalOverflow(page);
  ok(of.overflow <= 1, `${name}: no horizontal overflow`, `${of.overflow}px ${of.offenders.join(' | ')}`);
  const zi = await zoomingInputs(page);
  ok(zi.length === 0, `${name}: no sub-16px focusable text`, zi.join(' | '));
  const tt = await smallTapTargets(page);
  ok(tt.length === 0, `${name}: no sub-${TAP_MIN}px tap targets`, tt.join(' | '));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name.replace(/[^a-z0-9]+/gi, '-')}.png`, fullPage: false });
}

const tab = (page, label) => page.locator(`[role="tab"]:has-text("${label}")`).first();

const created = [];
const createdProjects = [];

async function main() {
  // A contract with NO payment schedule, so the milestone proposal path is reachable.
  const mk = await api('POST', '/api/documents', {
    template: 'contract',
    title: 'WS7 E2E — safe to delete',
    payload: {
      homeowner: { name: 'Workspace Seven', address: '77 Workspace Way, Edison NJ', phone: '5550000077', email: 'ws7@example.invalid' },
      payment: { labor_cost_cents: 2800000, materials_cost_cents: 1200000, total_cents: 4000000, schedule: [], method: 'check', notes: '' },
      timeline: { start_date: '2026-04-01' },
      scope_of_work: {
        intro: '', total_cents: 4000000,
        groups: [{ category: 'Interiors', tasks: [
          { task: 'Kitchen gut', description: ['Demo and rebuild'], qty: 'Lump Sum', unit_price_cents: 4000000, amount_cents: 4000000 },
        ] }],
      },
    },
  });
  const doc = mk.json?.document || mk.json;
  if (!doc?.id) { console.log('setup failed:', JSON.stringify(mk.json).slice(0, 300)); process.exit(1); }
  created.push(doc.id);
  if (doc.project_id) createdProjects.push(doc.project_id);
  console.log(`fixture ${doc.doc_number} -> ${doc.id} (project ${doc.project_id})`);

  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  // `{...VIEWPORT}` here instead of `{viewport: VIEWPORT}` silently leaves Playwright on
  // its 1280x720 default: the spread keys are unknown options and get dropped. The first
  // run of this script did exactly that and reported 20 tap-target/font failures that were
  // really the desktop sidebar being measured as if it were a phone. Keep the key.
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript((t) => { try { localStorage.setItem('sunvic.token', t); } catch {} }, TOKEN);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
  const failedWrites = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) failedWrites.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });

  // ─── 1. Document editor: the mirror is gone ───────────────
  line('document editor — mirror removed');
  await page.goto(`${BASE}/documents/${doc.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const tabLabels = await page.locator('[role="tab"]').allTextContents();
  const labels = tabLabels.map((s) => s.trim()).filter(Boolean);
  console.log(`     tabs: ${JSON.stringify(labels)}`);
  ok(!labels.some((l) => /^preview$/i.test(l)), 'no "Preview" (Live mirror) tab remains', labels.join(','));
  ok(labels.some((l) => /^pdf$/i.test(l)), 'PDF tab present');
  ok(labels.some((l) => /^project$/i.test(l)), 'Project tab present');
  ok(labels.some((l) => /^form$/i.test(l)), 'Form editor tab kept');
  ok(labels.some((l) => /^legal$/i.test(l)), 'Legal tab kept');

  // The mirror rendered "click any text to edit inline" as a column subtitle. Its absence
  // anywhere in the DOM is the cheapest proof the component is not mounted.
  const bodyText = await page.locator('body').innerText();
  ok(!/click any text to edit inline/i.test(bodyText), 'mirror subtitle string is gone from the DOM');

  await screenHealth(page, 'doc-editor-mobile-ai');

  // ─── 2. Form and Legal still bind ─────────────────────────
  line('document editor — form + legal still work');
  await tab(page, 'Form').click();
  await page.waitForTimeout(900);
  // The editors nest fields inside Accordion sections that start collapsed, so counting
  // inputs before expanding one measures the accordion, not the form. Scope to
  // button[aria-expanded] — SegmentedTabs carry role="tab", which would otherwise match.
  const fstat = await openEditorFields(page);
  console.log(`     form: ${JSON.stringify(fstat)}`);
  ok(fstat.accordions > 0, 'Form tab renders collapsible sections', `${fstat.accordions}`);
  // A bare `inputs > 0` would pass on the DocAskBar textarea alone, which is present on
  // this tab whether or not a single form field works. Assert the delta the taps caused.
  ok(fstat.clicked > 0, 'Form tab exposes tappable field rows', JSON.stringify(fstat));
  ok(fstat.inputs > fstat.inputsBefore, 'tapping a field row reveals a real editor', `${fstat.inputsBefore} -> ${fstat.inputs}`);
  assertStillOn(page, doc.id, 'form editing');
  await screenHealth(page, 'doc-editor-mobile-form');

  await tab(page, 'Legal').click();
  await page.waitForTimeout(900);
  const legalText = await page.locator('body').innerText();
  ok(/lock|locked/i.test(legalText), 'Legal tab still surfaces the lock affordance');
  await screenHealth(page, 'doc-editor-mobile-legal');

  // ─── 3. Project rail inside the document ──────────────────
  line('document editor — project rail (de-siloing)');
  await tab(page, 'Project').click();
  await page.waitForTimeout(2500);
  const railText = await page.locator('body').innerText();
  ok(/Workspace Seven|77 Workspace Way|Project/i.test(railText), 'Project tab loads the project for this document');

  for (const t of ['Copilot', 'Pipeline', 'Money', 'Milestones']) {
    const el = tab(page, t);
    const found = await el.count() > 0;
    ok(found, `project rail exposes "${t}"`);
    if (found) {
      await el.click();
      await page.waitForTimeout(1100);
      const txt = (await page.locator('body').innerText()).trim();
      // "Real content" = the pane rendered something beyond the tab strip itself.
      ok(txt.length > 200, `"${t}" pane renders content`, `${txt.length} chars`);
      await screenHealth(page, `doc-rail-${t.toLowerCase()}`);
    }
  }

  // ─── 4. Milestones: human in the loop, measured ───────────
  line('milestones — proposal requires a human confirm');
  await tab(page, 'Milestones').click();
  await page.waitForTimeout(1200);

  const before = await api('GET', `/api/documents/${doc.id}`);
  const scheduleBefore = before.json?.document?.payload?.payment?.schedule || [];
  ok(scheduleBefore.length === 0, 'fixture starts with no payment schedule', `${scheduleBefore.length}`);

  const propose = page.getByRole('button', { name: /propose/i }).first();
  ok(await propose.count() > 0, 'Milestones offers a "Propose a schedule" action');
  if (await propose.count() > 0) {
    await propose.click();
    await page.waitForTimeout(1200);

    const afterPropose = await api('GET', `/api/documents/${doc.id}`);
    const schedMid = afterPropose.json?.document?.payload?.payment?.schedule || [];
    // THE claim being tested: proposing must not write. If this fails, "human in the loop"
    // is decoration.
    ok(schedMid.length === 0, 'proposing writes NOTHING to the document until confirmed', `${schedMid.length} rows appeared`);

    const proposalText = await page.locator('body').innerText();
    ok(/100\s*%|100%/.test(proposalText), 'proposal surfaces the percent total for the human to check');

    const confirm = page.getByRole('button', { name: /confirm/i }).first();
    const hasConfirm = await confirm.count() > 0;
    ok(hasConfirm, 'a Confirm control exists');
    if (hasConfirm) ok(await confirm.isEnabled(), 'Confirm is enabled when the split sums to 100%');

    // Break the sum and prove the gate closes.
    const pctInputs = page.locator('input[type="number"]');
    const n = await pctInputs.count();
    if (n > 0) {
      await pctInputs.first().fill('55');
      await pctInputs.first().dispatchEvent('input');
      await page.waitForTimeout(700);
      const confirm2 = page.getByRole('button', { name: /confirm/i }).first();
      const disabled = await confirm2.count() > 0 ? await confirm2.isDisabled() : false;
      ok(disabled, 'Confirm disables when the percentages no longer sum to 100');
      const warn = await page.locator('body').innerText();
      ok(/100/.test(warn), 'the UI says what is wrong with the split');
    } else ok(false, 'proposal rows expose editable percentages', '0 number inputs');

    await screenHealth(page, 'doc-rail-milestone-proposal');
  }

  // Nothing was confirmed, so the document must be byte-identical on the schedule.
  const afterAll = await api('GET', `/api/documents/${doc.id}`);
  const schedEnd = afterAll.json?.document?.payload?.payment?.schedule || [];
  ok(schedEnd.length === 0, 'no schedule was written across the whole milestone sweep', `${schedEnd.length}`);

  // ─── 5. Project page is tabbed ────────────────────────────
  line('project page — tabbed, not dumped');
  if (doc.project_id) {
    await page.goto(`${BASE}/projects/${doc.project_id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    const pLabels = (await page.locator('[role="tab"]').allTextContents()).map((s) => s.trim()).filter(Boolean);
    console.log(`     project tabs: ${JSON.stringify(pLabels)}`);
    for (const t of ['Overview', 'Copilot', 'Pipeline', 'Money', 'Milestones']) {
      ok(pLabels.some((l) => l.toLowerCase() === t.toLowerCase()), `project page exposes "${t}" tab`);
    }
    // Switching must actually change the pane, not just the highlight.
    await tab(page, 'Overview').click();
    await page.waitForTimeout(900);
    const overviewText = (await page.locator('main, body').first().innerText()).slice(0, 4000);
    await tab(page, 'Pipeline').click();
    await page.waitForTimeout(900);
    const pipelineText = (await page.locator('main, body').first().innerText()).slice(0, 4000);
    ok(overviewText !== pipelineText, 'switching a project tab changes the rendered pane');
    await screenHealth(page, 'project-page-mobile');
  } else ok(false, 'fixture document has a project to open');

  // ─── 6. Copilot home is a dashboard ───────────────────────
  line('copilot home — business 360');
  await page.goto(`${BASE}/copilot`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);
  const cLabels = (await page.locator('[role="tab"]').allTextContents()).map((s) => s.trim()).filter(Boolean);
  console.log(`     copilot tabs: ${JSON.stringify(cLabels)}`);
  ok(cLabels.some((l) => /business/i.test(l)), 'copilot exposes a Business tab');
  const copyText = await page.locator('body').innerText();
  ok(/contracted/i.test(copyText), 'business view shows a Contracted KPI');
  ok(/collected/i.test(copyText), 'business view shows a Collected KPI');
  ok(/outstanding/i.test(copyText), 'business view shows an Outstanding KPI');
  ok((await page.locator('svg').count()) > 0, 'business view renders a chart');
  ok(await page.locator('textarea').count() > 0, 'the ask box is still on the home screen');
  await screenHealth(page, 'copilot-mobile-business');

  // ─── 7. Desktop: two columns, PDF/Edit toggle ─────────────
  line('desktop — PDF/Edit toggle replaces the mirror column');
  const dctx = await browser.newContext({ viewport: DESKTOP });
  await dctx.addInitScript((t) => { try { localStorage.setItem('sunvic.token', t); } catch {} }, TOKEN);
  const dp = await dctx.newPage();
  await dp.goto(`${BASE}/documents/${doc.id}`, { waitUntil: 'networkidle' });
  await dp.waitForTimeout(2000);

  const dText = await dp.locator('body').innerText();
  ok(!/Live mirror/i.test(dText), 'desktop no longer renders a "Live mirror" column');
  ok(/PDF preview/i.test(dText), 'desktop keeps the "PDF preview" column');
  ok(/Form editor/i.test(dText), 'desktop keeps the "Form editor" column');
  ok(!/Scroll sync/i.test(dText), 'the dead "Scroll sync" checkbox is gone');

  const pdfToggle = dp.locator('[role="tab"]:has-text("PDF")').first();
  const editToggle = dp.locator('[role="tab"]:has-text("Edit")').first();
  ok(await pdfToggle.count() > 0 && await editToggle.count() > 0, 'PDF column has a [PDF | Edit] toggle');
  if (SHOTS) await dp.screenshot({ path: `${SHOTS}/desktop-pdf.png` });
  if (await editToggle.count() > 0) {
    await editToggle.click();
    await dp.waitForTimeout(1500);
    const editText = await dp.locator('body').innerText();
    ok(/New Jersey|locked|Consumer Fraud|Every field/i.test(editText), 'Edit view explains the lock state instead of silently allowing edits');
    const dstat = await openEditorFields(dp, 1, 6);
    console.log(`     edit view: ${JSON.stringify(dstat)}`);
    ok(dstat.accordions > 0, 'Edit view renders the document as collapsible sections', `${dstat.accordions}`);
    ok(dstat.clicked > 0, 'Edit view exposes tappable field rows', JSON.stringify(dstat));
    ok(dstat.inputs > dstat.inputsBefore, 'Edit view reveals a real editor when a row is clicked', `${dstat.inputsBefore} -> ${dstat.inputs}`);
    assertStillOn(dp, doc.id, 'desktop edit view');
    if (SHOTS) await dp.screenshot({ path: `${SHOTS}/desktop-edit.png` });
    await pdfToggle.click();
    await dp.waitForTimeout(1200);
    ok(await dp.locator('canvas, iframe, .react-pdf__Page').count() > 0, 'toggling back restores the rendered PDF');
  }

  // ─── 7. A trashed project must not masquerade as a live one ─
  //
  // FINDING 32: GET /api/projects/:id and /summary return 200 for a soft-deleted project
  // because neither filters deleted_at, so the rail rendered a deleted project — name,
  // money, pipeline — as current. On production that hit 10 of 17 live documents.
  //
  // Proven by doing it, not by reading the code: trash the fixture's project out from
  // under a live document, reload, and require the UI to say so and to offer the repair.
  line('trashed project — the rail tells the truth');
  if (doc.project_id) {
    const del = await api('DELETE', `/api/projects/${doc.project_id}`); // soft
    ok(del.status < 400, 'fixture project soft-deleted for the test', `${del.status}`);

    const stillReturns = await api('GET', `/api/projects/${doc.project_id}`);
    ok(stillReturns.status === 200 && !!stillReturns.json?.project?.deleted_at,
      'the API still serves the trashed project with deleted_at set (the condition being defended against)',
      `${stillReturns.status}`);

    await page.goto(`${BASE}/documents/${doc.id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await tab(page, 'Project').click();
    await page.waitForTimeout(2600);

    const trashText = await page.locator('body').innerText();
    ok(/in the trash/i.test(trashText), 'the rail says the project is in the trash');
    const restoreBtn = page.getByRole('button', { name: /restore this project/i }).first();
    ok(await restoreBtn.count() > 0, 'the rail offers a Restore action');
    await screenHealth(page, 'doc-rail-trashed-project');

    if (await restoreBtn.count() > 0) {
      await restoreBtn.click();
      await page.waitForTimeout(2200);
      const afterText = await page.locator('body').innerText();
      ok(!/in the trash/i.test(afterText), 'the banner clears once the project is restored');
      const listed = await api('GET', '/api/projects');
      ok((listed.json?.projects || []).some((p) => p.id === doc.project_id),
        'restoring from the rail puts the project back in the projects list');
    }
  }

  line('console health');
  const realErrors = consoleErrors.filter((e) => !/favicon|404 \(Not Found\).*\.png|ResizeObserver|Failed to load resource/i.test(e));
  ok(realErrors.length === 0, 'no uncaught console errors across the sweep', realErrors.slice(0, 4).join(' | '));
  ok(failedWrites.length === 0, 'no failing HTTP requests across the sweep', [...new Set(failedWrites)].slice(0, 5).join(' | '));

  await browser.close();
  await cleanup();

  console.log(`\ne2e-workspace: PASS ${pass} FAIL ${failures.length}`);
  failures.forEach((f) => console.log(`  - ${f}`));
  if (failures.length) process.exit(1);
}

async function cleanup() {
  for (const id of created) {
    await api('DELETE', `/api/documents/${id}`);
    await api('DELETE', `/api/documents/${id}?permanent=1`);
  }
  for (const pid of createdProjects) {
    await api('DELETE', `/api/projects/${pid}?permanent=1`);
  }
}

main().catch(async (e) => {
  console.error('crashed:', e);
  await cleanup();
  process.exit(1);
});
