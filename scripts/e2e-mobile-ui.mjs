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

  // ── THE FIX: locked legal blocks must not accept silent edits ──
  line('legal locks — the defect this iteration found');
  const lockChip = page.locator('[aria-label="Unlock this section for editing"]').first();
  ok(await lockChip.count() > 0, 'a locked legal block shows an Unlock control');

  // Open the Warranty sub-tab where warranties.text lives.
  const warrantyTab = page.getByRole('tab', { name: /^Warranty$/i }).first();
  if (await warrantyTab.count() > 0) { await warrantyTab.click(); await page.waitForTimeout(600); }

  // Expand the first legal block.
  const firstBlock = page.locator('button').filter({ hasText: /Warrant/i })
    .filter({ hasNot: page.locator('[aria-label*="Unlock"]') }).first();
  if (await firstBlock.count() > 0) { await firstBlock.click().catch(() => {}); await page.waitForTimeout(900); }

  const readOnlyNote = page.getByText(/canonical Sunvic language/i).first();
  ok(await readOnlyNote.count() > 0, 'locked block explains why it is read-only');

  const gated = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[aria-disabled="true"]')]
      .find((n) => n.querySelector('textarea, input'));
    if (!el) return null;
    return { pointerEvents: getComputedStyle(el).pointerEvents, opacity: getComputedStyle(el).opacity };
  });
  ok(gated && gated.pointerEvents === 'none',
    'locked fields are non-interactive, so an edit cannot be silently dropped',
    JSON.stringify(gated));

  // Now unlock and prove the same field becomes writable and PERSISTS.
  const before = (await api('GET', `/api/documents/${doc.id}`)).json?.document?.locks?.['warranties.text'];
  const unlockBtn = page.locator('[aria-label="Unlock this section for editing"]').first();
  if (await unlockBtn.count() > 0) {
    await unlockBtn.click();
    await page.waitForTimeout(2500); // debounced autosave
  }
  const after = (await api('GET', `/api/documents/${doc.id}`)).json?.document?.locks?.['warranties.text'];
  ok(before === true && after !== true, 'tapping Unlock actually clears the lock server-side',
    `locks['warranties.text'] ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);

  // Assert a positive signal, not merely the absence of one.
  const relock = await page.locator('[aria-label*="lock this section"]').first().innerText().catch(() => '');
  ok(/unlocked/i.test(relock), 'after unlocking, the chip shows the re-lock affordance', JSON.stringify(relock));

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
    const box = await row.boundingBox();
    if (box) {
      // Leftward drag past the arm threshold.
      await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
      await page.mouse.down();
      for (let x = 0; x <= 200; x += 25) {
        await page.mouse.move(box.x + box.width - 20 - x, box.y + box.height / 2);
        await page.waitForTimeout(30);
      }
      await page.mouse.up();
      await page.waitForTimeout(1200);
      const undo = page.getByText(/undo/i).first();
      ok(await undo.count() > 0, 'swiping a draft left offers Undo');
      if (await undo.count() > 0) {
        await undo.click();
        await page.waitForTimeout(1500);
        const live = (await api('GET', '/api/documents')).json;
        const list = live?.documents || live || [];
        ok(Array.isArray(list) && list.some((d) => d.id === doc.id), 'Undo restores the document');
      }
    } else ok(false, 'could not locate the row to swipe');
  } else ok(false, 'fixture row not found in the Work list');

  line('console health');
  const realErrors = consoleErrors.filter((e) => !/favicon|404 \(Not Found\).*\.png|ResizeObserver/i.test(e));
  ok(realErrors.length === 0, 'no uncaught console errors across the sweep', realErrors.slice(0, 4).join(' | '));

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
