#!/usr/bin/env node
/**
 * Mobile UI end-to-end against production, at a real phone viewport.
 *
 * This is the check the unit suites structurally cannot make: the suites assert that
 * components bind to real paths, but they cannot see a page that scrolls sideways, a
 * pane squeezed to a strip, or a save that looks like it worked. The legal-lock defect
 * this iteration found was exactly that shape — HTTP 200, nothing written — so the
 * lock fix is verified here through the interface a user actually touches.
 *
 * Usage: node scripts/e2e-mobile-ui.mjs [--headed]
 */

import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'https://sun-vic2.vercel.app';
const TOKEN = process.env.E2E_TOKEN || 'mock-local-token';
const VIEWPORT = { width: 390, height: 844 }; // iPhone 12/13/14

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

/** Horizontal overflow is the single most common mobile defect — measure, don't eyeball. */
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
    return { overflow, clientWidth: de.clientWidth, offenders };
  });
}

/** Any tap target smaller than ~40px is hard to hit on a phone. */
async function smallTapTargets(page) {
  return page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('button, a[href], [role="button"], input[type="checkbox"]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;         // hidden
      if (getComputedStyle(el).visibility === 'hidden') continue;
      if (r.height < 32) bad.push(`${el.tagName.toLowerCase()} "${(el.textContent || '').trim().slice(0, 24)}" h=${Math.round(r.height)}`);
    }
    return bad.slice(0, 6);
  });
}

const created = [];

async function main() {
  // A document to drive the editor against. Direct payload — no LLM spend.
  const mk = await api('POST', '/api/documents', {
    template: 'contract',
    title: 'MOBILE E2E — safe to delete',
    payload: {
      homeowner: { name: 'Mobile Test', address: '7 Mobile Way, Edison NJ', phone: '', email: '' },
      payment: {
        labor_cost_cents: 3395000, materials_cost_cents: 1455000, total_cents: 4850000,
        schedule: [
          { milestone: 'Deposit', percent: 15, condition: '' },
          { milestone: 'Progress 1', percent: 20, condition: '' },
          { milestone: 'Progress 2', percent: 30, condition: '' },
          { milestone: 'Progress 3', percent: 15, condition: '' },
          { milestone: 'Progress 4', percent: 15, condition: '' },
          { milestone: 'Final', percent: 5, condition: '' },
        ],
        method: 'check', notes: '',
      },
      timeline: { start_date: '2026-03-03' },
      scope_of_work: {
        intro: '', total_cents: 4850000,
        groups: [{ category: 'Interiors', tasks: [
          { task: 'Kitchen cabinets', description: ['Shaker cabinets', 'Quartz tops'], qty: 'Lump Sum', unit_price_cents: 2850000, amount_cents: 2850000 },
          { task: 'Bathroom tile', description: ['Floor and surround'], qty: 'Lump Sum', unit_price_cents: 2000000, amount_cents: 2000000 },
        ] }],
      },
    },
  });
  const doc = mk.json?.document || mk.json;
  if (!doc?.id) { console.log('setup failed:', JSON.stringify(mk.json).slice(0, 300)); process.exit(1); }
  created.push(doc.id);
  console.log(`fixture ${doc.doc_number} -> ${doc.id}`);

  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const failedWrites = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failedWrites.push(`${r.status()} ${r.request().method()} ${r.url().split('/').slice(-1)[0].slice(0, 40)}`);
  });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 160)}`));

  // ── every screen at 390px ────────────────────────────────
  line(`screen sweep at ${VIEWPORT.width}px`);
  const routes = ['/copilot', '/work', '/work?type=projects', '/activity', '/chat', '/documents/new', '/settings', `/documents/${doc.id}`];
  for (const route of routes) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(900);
    const { overflow, offenders } = await horizontalOverflow(page);
    ok(overflow <= 1, `${route} — no horizontal scroll`, `overflow ${overflow}px; ${offenders.join(' | ')}`);
    const small = await smallTapTargets(page);
    ok(small.length === 0, `${route} — tap targets >= 32px`, small.join(' | '));
  }

  // ── document editor: sub-tabs and real pane height ───────
  line('document editor — sub-tabs and section height');
  await page.goto(`${BASE}/documents/${doc.id}`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1200);

  // These are role="tab", which overrides the implicit button role — getByRole('button')
  // does not match them. An earlier version of this file made exactly that mistake and
  // reported 22 false failures against a working UI.
  const tabNames = ['AI', 'Form', 'Legal', 'Preview', 'PDF'];
  for (const t of tabNames) {
    const el = page.getByRole('tab', { name: new RegExp(`^${t}$`, 'i') }).first();
    ok(await el.count() > 0, `primary tab "${t}" is present`);
  }

  const gotoTab = async (name) => {
    const b = page.getByRole('tab', { name: new RegExp(`^${name}$`, 'i') }).first();
    if (await b.count() > 0) { await b.click(); await page.waitForTimeout(1400); return true; }
    return false;
  };

  await gotoTab('Form');
  for (const sub of ['Homeowner', 'Scope', 'Payment', 'Timeline']) {
    ok(await page.getByRole('tab', { name: new RegExp(`^${sub}$`, 'i') }).count() > 0, `Form sub-tab "${sub}" renders`);
  }
  const paneH = await page.evaluate(() => {
    let best = 0;
    for (const el of document.querySelectorAll('div')) {
      const r = el.getBoundingClientRect();
      if (r.height > best && r.height < window.innerHeight + 200 && el.scrollHeight > r.height) best = r.height;
    }
    return { pane: Math.round(best), viewport: window.innerHeight };
  });
  ok(paneH.pane > 300, 'scrollable content pane has real height, not a squeezed strip',
    `${paneH.pane}px of ${paneH.viewport}px viewport`);

  await gotoTab('Legal');
  for (const sub of ['Terms', 'Warranty', 'Cancellation', 'Signature']) {
    ok(await page.getByRole('tab', { name: new RegExp(`^${sub}$`, 'i') }).count() > 0, `Legal sub-tab "${sub}" renders`);
  }

  // ── every sub-tab must land on content, not a wall of collapsed headers ──
  // The accordion kept openId in state across a sub-tab swap, so it still pointed at a
  // block from the previous sub-tab and nothing matched. Measured before the fix: 6 of
  // these 8 sub-tabs opened with zero sections expanded, Payment and Signature showing
  // one grey bar and empty space. This is the regression guard.
  line('sub-tabs open on content');
  const openSections = async () => page.evaluate(() =>
    [...document.querySelectorAll('button[aria-expanded]')].filter((b) => b.getAttribute('aria-expanded') === 'true').length);
  for (const [primary, subs] of [['Form', ['Homeowner', 'Scope', 'Payment', 'Timeline']],
                                 ['Legal', ['Terms', 'Warranty', 'Cancellation', 'Signature']]]) {
    await gotoTab(primary);
    for (const sub of subs) {
      const t = page.getByRole('tab', { name: new RegExp(`^${sub}$`, 'i') }).first();
      if (await t.count() === 0) continue;
      await t.click();
      await page.waitForTimeout(900);
      const n = await openSections();
      ok(n > 0, `${primary}/${sub} opens with a section already expanded`, `${n} open`);
    }
  }

  await gotoTab('Legal');

  // ── THE FIX: locked legal blocks must not accept silent edits ──
  line('legal locks — the defect this iteration found');
  const lockChip = page.locator('[aria-label="Unlock this section for editing"]').first();
  ok(await lockChip.count() > 0, 'a locked legal block shows an Unlock control');

  // Open the Warranty sub-tab, where warranties.text is a real textarea.
  const warrantyTab = page.getByRole('tab', { name: /^Warranty$/i }).first();
  if (await warrantyTab.count() > 0) { await warrantyTab.click(); await page.waitForTimeout(1400); }

  // Expand the Warranty block itself. Two traps here, both cost a false failure once:
  // the sub-tab strip is ALSO <button role="tab">, so a plain text filter matches the
  // tab rather than the accordion header; and clicking a header that is already open
  // collapses it. Scope to aria-expanded (only the header carries it) and only click
  // when it reports closed.
  const firstBlock = page.locator('button[aria-expanded]').filter({ hasText: /Warrant/i }).first();
  if (await firstBlock.count() > 0 && (await firstBlock.getAttribute('aria-expanded')) === 'false') {
    await firstBlock.click().catch(() => {});
    await page.waitForTimeout(1000);
  }

  // The intro paragraph says "canonical Sunvic language" on every legal tab, so matching
  // it proves nothing. Assert the per-block amber note, which only renders inside an
  // expanded locked block.
  const readOnlyNote = page.getByText(/read-only so it cannot be changed by\s+accident/i).first();
  ok(await readOnlyNote.count() > 0, 'locked block explains why it is read-only');

  // A locked body may hold a textarea, a text input, or radios — accept any field.
  const gated = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[aria-disabled="true"]')]
      .find((n) => n.querySelector('textarea, input, [role="radio"]'));
    if (!el) return { found: false, disabledNodes: document.querySelectorAll('[aria-disabled="true"]').length };
    const cs = getComputedStyle(el);
    return { found: true, pointerEvents: cs.pointerEvents, opacity: cs.opacity };
  });
  ok(gated.found && gated.pointerEvents === 'none',
    'locked fields are non-interactive, so an edit cannot be silently dropped',
    JSON.stringify(gated));

  // Unlock, then assert BOTH the server state and the same chip's label.
  // The chip previously never flipped because the PATCH carrying the concurrency token
  // was answered 412 by the CDN, so the client discarded a write that had in fact landed.
  const chip = page.locator('[aria-label*="lock this section"]').first();
  const chipBefore = (await chip.innerText().catch(() => '')).trim();
  const locksBefore = (await api('GET', `/api/documents/${doc.id}`)).json?.document?.locks || {};
  await chip.click();
  await page.waitForTimeout(3500); // debounced autosave + refetch
  const locksAfter = (await api('GET', `/api/documents/${doc.id}`)).json?.document?.locks || {};
  const flipped = Object.keys({ ...locksBefore, ...locksAfter }).filter((k) => locksBefore[k] !== locksAfter[k]);
  ok(flipped.length > 0, 'tapping Unlock actually clears the lock server-side', JSON.stringify(flipped));

  const chipAfter = (await chip.innerText().catch(() => '')).trim();
  ok(/unlocked/i.test(chipAfter),
    'the chip re-renders to the re-lock state, so the tap is not silently lost',
    `${JSON.stringify(chipBefore)} -> ${JSON.stringify(chipAfter)}`);

  // And no failed writes anywhere in that exchange.
  ok(!failedWrites.some((f) => /41[28]|409/.test(f)),
    'no rejected write during the unlock exchange', failedWrites.slice(0, 3).join(' | '));

  // ── agent reachable on mobile ────────────────────────────
  line('agent on mobile');
  const askBar = page.locator('[aria-label="Send to copilot"]').first();
  ok(await askBar.count() > 0, 'the scoped ask bar is reachable on a phone');
  const sectionAgent = page.locator('[aria-label^="Ask the copilot about"]').first();
  ok(await sectionAgent.count() > 0, 'per-section agent buttons render in section headers');

  // ── swipe to delete on the Work list ─────────────────────
  line('swipe to delete');
  await page.goto(`${BASE}/work?type=documents`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1500);
  const row = page.getByText('MOBILE E2E — safe to delete').first();
  if (await row.count() > 0) {
    await row.scrollIntoViewIfNeeded();          // an off-screen box cannot be touched
    await page.waitForTimeout(400);
    const box = await row.boundingBox();
    if (box && box.y >= 0 && box.y < VIEWPORT.height) {
      // Real touch, not mouse: the row listens to pointer events and sits inside an
      // <a href>, so a mouse drag reads as a click and navigates instead of swiping.
      const cdp = await ctx.newCDPSession(page);
      const y = box.y + box.height / 2;
      const x0 = box.x + box.width - 24;
      const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', {
        type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
      });
      await touch('touchStart', x0);
      for (let i = 20; i <= 220; i += 20) { await touch('touchMove', x0 - i); await page.waitForTimeout(35); }
      await touch('touchEnd', x0 - 220);
      await page.waitForTimeout(1500);
      ok(page.url().includes('/work'), 'swiping does not navigate away', page.url());
      const undo = page.getByText(/undo/i).first();
      ok(await undo.count() > 0, 'swiping a draft left offers Undo');
      if (await undo.count() > 0) {
        await undo.click();
        await page.waitForTimeout(1800);
        const live = (await api('GET', '/api/documents')).json;
        const list = live?.documents || live || [];
        ok(Array.isArray(list) && list.some((x) => x.id === doc.id), 'Undo restores the document');
      }
    } else ok(false, 'could not bring the row on-screen to swipe', JSON.stringify(box));
  } else ok(false, 'fixture row not found in the Work list');

  line('console health');
  const realErrors = consoleErrors.filter((e) => !/favicon|404 \(Not Found\).*\.png|ResizeObserver/i.test(e));
  ok(realErrors.length === 0, 'no uncaught console errors across the sweep', realErrors.slice(0, 4).join(' | '));
  ok(failedWrites.length === 0, 'no failing HTTP requests across the sweep', [...new Set(failedWrites)].slice(0, 5).join(' | '));

  await browser.close();

  for (const id of created) {
    await api('DELETE', `/api/documents/${id}`);
    await api('DELETE', `/api/documents/${id}?permanent=1`);
  }
  console.log(`\ne2e-mobile-ui: PASS ${pass} FAIL ${failures.length}`);
  failures.forEach((f) => console.log(`  - ${f}`));
  if (failures.length) process.exit(1);
}

main().catch(async (e) => {
  console.error('crashed:', e);
  for (const id of created) {
    await api('DELETE', `/api/documents/${id}`);
    await api('DELETE', `/api/documents/${id}?permanent=1`);
  }
  process.exit(1);
});
