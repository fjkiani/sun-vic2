// probe-lock-toast — print, verbatim, everything the app tells a user when they tap a locked
// clause in the rendered document. Not a test: no assertions, no pass/fail. It exists because
// section 5 of verify-pdf-send asserted only that the toast contains "›", and "contractor ›
// address" satisfies that without ever naming the tab the field actually lives in. The user's
// complaint was precisely "it doesnt even show where" — so read the real strings first, then
// write assertions against them.
//
// Usage: node scripts/probe-lock-toast.mjs [--base https://sun-vic2.vercel.app]

import { chromium } from 'playwright';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const BASE = arg('--base', 'https://sun-vic2.vercel.app');
const API = arg('--api', process.env.E2E_BASE || BASE);
const TOKEN = process.env.E2E_TOKEN || 'mock-local-token';

async function apiFetch(pathname, init = {}) {
  const r = await fetch(`${API}${pathname}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) },
  });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: r.status, data, text };
}

async function dumpToast(page, label) {
  const t = page.locator('[data-testid="pdf-toast"]');
  if (!(await t.count())) { console.log(`  ${label}: NO TOAST`); return null; }
  const kind = await t.getAttribute('data-toast-kind');
  const text = (await t.innerText()).replace(/\s+/g, ' ').trim();
  const actions = page.locator('[data-testid="pdf-toast-action"]');
  const n = await actions.count();
  const labels = [];
  for (let i = 0; i < n; i++) labels.push((await actions.nth(i).innerText()).replace(/\s+/g, ' ').trim());
  console.log(`  ${label}`);
  console.log(`    kind    : ${kind}`);
  console.log(`    text    : ${text}`);
  console.log(`    actions : ${JSON.stringify(labels)}`);
  return { kind, text, labels };
}

async function main() {
  const created = await apiFetch('/api/documents', {
    method: 'POST',
    body: JSON.stringify({
      template: 'contract',
      title: 'ZZ-PROBE-LOCK-TOAST (auto, deleted)',
      payload: {
        homeowner: { name: 'Probe Toast', address: '1 Probe Way, Trenton, NJ', email: '' },
        payment: { total_cents: 1234567, schedule: [{ milestone: 'Deposit', percent: 50, condition: 'On signing' }] },
        timeline: {},
        scope_of_work: { groups: [{ title: 'Kitchen', items: ['Demolition'] }] },
      },
    }),
  });
  const docId = created.data?.document?.id;
  if (!docId) throw new Error(`create failed: ${created.status} ${created.text.slice(0, 300)}`);
  console.log(`scratch ${docId} (${created.data.document.doc_number})\n`);

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript((t) => {
      localStorage.setItem('sunvic.token', t);
      localStorage.setItem('sunvic.auth.token', t);
    }, TOKEN);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/documents/${docId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="pdf-scroller"]', { timeout: 60000 });
    await page.waitForSelector('[data-testid^="pdf-textlayer-"] span', { timeout: 60000 });
    await page.waitForTimeout(2500);

    // Which locked paths are actually visible in the rendered text layer?
    const lockedPaths = await page.evaluate(() => {
      const out = {};
      document.querySelectorAll('[data-pdf-locked="1"]').forEach((el) => {
        const p = el.getAttribute('data-pdf-path') || '(none)';
        out[p] = (out[p] || 0) + 1;
      });
      return out;
    });
    console.log('locked runs by path:');
    Object.entries(lockedPaths).sort((a, b) => b[1] - a[1]).forEach(([p, n]) => console.log(`  ${n.toString().padStart(3)}  ${p}`));
    console.log('');

    for (const path of Object.keys(lockedPaths)) {
      if (path === '(none)') continue;
      const run = page.locator(`[data-pdf-path="${path}"]`).first();
      await run.scrollIntoViewIfNeeded().catch(() => {});
      await run.click({ force: true }).catch(() => {});
      await page.waitForSelector('[data-testid="pdf-toast"]', { timeout: 6000 }).catch(() => {});
      await dumpToast(page, `TAP ${path}`);
      const dismiss = page.locator('[data-testid="pdf-toast-dismiss"]');
      if (await dismiss.count()) await dismiss.first().click().catch(() => {});
      await page.waitForTimeout(250);
    }

    // What does the destination action actually do? Click the non-unlock action on the first
    // statutory lock and report where the app lands.
    const statutory = page.locator('[data-pdf-path="right_to_cancel.text"]').first();
    if (await statutory.count()) {
      console.log('\nfollow the destination action for right_to_cancel.text:');
      await statutory.scrollIntoViewIfNeeded().catch(() => {});
      await statutory.click({ force: true });
      await page.waitForSelector('[data-testid="pdf-toast"]', { timeout: 6000 }).catch(() => {});
      const info = await dumpToast(page, '  toast');
      const nav = page.locator('[data-testid="pdf-toast-action"]').filter({ hasNotText: /Unlock and edit here/i }).first();
      if (await nav.count()) {
        const navLabel = (await nav.innerText()).replace(/\s+/g, ' ').trim();
        await nav.click();
        await page.waitForTimeout(1800);
        const landed = await page.evaluate(() => {
          const row = document.querySelector('[data-field-path="right_to_cancel.text"]');
          const activeTabs = Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"]'))
            .map((e) => e.textContent.trim());
          let visible = false, box = null;
          if (row) {
            const r = row.getBoundingClientRect();
            box = { top: Math.round(r.top), height: Math.round(r.height) };
            visible = r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
          }
          return { mounted: !!row, visible, box, activeTabs };
        });
        console.log(`    clicked "${navLabel}" → ${JSON.stringify(landed)}`);
      } else {
        console.log(`    no destination action offered (actions=${JSON.stringify(info?.labels)})`);
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    const del = await apiFetch(`/api/documents/${docId}?permanent=1`, { method: 'DELETE' });
    console.log(`\nscratch deleted: HTTP ${del.status}`);
  }
}

main().catch(async (e) => { console.error('probe crashed:', e); process.exitCode = 1; });
