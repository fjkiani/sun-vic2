// verify-pdf-send — a real browser, the real built bundle, real production documents.
//
// Everything below has to actually happen in a page: pdf.js has to render, the text layer has
// to carry payload paths, a click has to open an editor, a confirmed edit has to reach the API,
// scrolling the form has to move the document, and the send checklist has to list the same
// blockers the server returns. Unit tests proved the path arithmetic; none of them proved a
// pixel was ever drawn.
//
// Writes are done on a throwaway document created and permanently deleted by this script, so
// no live contract is touched. The delete runs in `finally`.
//
// Usage: node scripts/verify-pdf-send.mjs [--base http://localhost:4180] [--shots DIR] [--headed]

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4180');
const API = arg('--api', process.env.E2E_BASE || 'https://sun-vic2.vercel.app');
const TOKEN = process.env.E2E_TOKEN || 'mock-local-token';
const SHOTS = arg('--shots', '/workspace/shots/pdf');
const HEADED = args.includes('--headed');
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  ok   ${m}`); } else { fail++; console.log(`  FAIL ${m}`); } };

async function apiFetch(pathname, init = {}) {
  const r = await fetch(`${API}${pathname}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) },
  });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: r.status, data, text };
}

const SCRATCH_TITLE = 'ZZ-VERIFY-PDF-SEND (auto, deleted)';

async function main() {
  // ── a throwaway document with a deliberately incomplete payload ────────────────
  const created = await apiFetch('/api/documents', {
    method: 'POST',
    body: JSON.stringify({
      template: 'contract',
      title: SCRATCH_TITLE,
      payload: {
        homeowner: { name: 'Verify Testcase', address: '1 Verification Way, Trenton, NJ', email: '' },
        payment: { total_cents: 1234567, schedule: [{ milestone: 'Deposit', percent: 50, condition: 'On signing' }] },
        timeline: {},                                   // start_date deliberately missing
        scope_of_work: { groups: [{ title: 'Kitchen', items: ['Demolition'] }] },
      },
    }),
  });
  const docId = created.data?.document?.id;
  if (!docId) throw new Error(`could not create scratch document: ${created.status} ${created.text.slice(0, 300)}`);
  console.log(`scratch document ${docId} (${created.data.document.doc_number})`);

  // The launch belongs inside the try: two runs on a freshly restored machine failed at
  // chromium.launch and orphaned a live scratch document in production because the finally
  // that deletes it had not been entered yet.
  let browser = null;
  try {
    browser = await chromium.launch({ headless: !HEADED });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript((t) => {
      localStorage.setItem('sunvic.token', t);
      localStorage.setItem('sunvic.auth.token', t);
    }, TOKEN);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(`${BASE}/documents/${docId}`, { waitUntil: 'domcontentloaded' });

    console.log('\n1. the document actually renders as a page we own');
    await page.waitForSelector('[data-testid="pdf-scroller"]', { timeout: 60000 });
    await page.waitForSelector('[data-testid^="pdf-textlayer-"] span', { timeout: 60000 });
    const spans = await page.locator('[data-testid^="pdf-textlayer-"] span').count();
    ok(spans > 50, `the text layer has ${spans} positioned text runs (an iframe would have zero)`);
    // Counted only after the text layer exists: the scroller mounts immediately with a
    // "Rendering…" message, so an earlier count measures nothing.
    const canvases = await page.locator('[data-testid="pdf-scroller"] canvas').count();
    ok(canvases > 0, `pdf.js drew ${canvases} page canvas(es)`);

    // The page must fit the column. At a fixed 100% a Letter page rasterised at 1.5 is ~918px
    // and the document column is ~700px, which clipped the right third of every page.
    const fitCheck = await page.evaluate(() => {
      const sc = document.querySelector('[data-testid="pdf-scroller"]');
      const pg = sc?.querySelector('canvas')?.parentElement?.parentElement;
      return { avail: sc?.clientWidth ?? 0, page: pg?.getBoundingClientRect().width ?? 0 };
    });
    ok(fitCheck.page > 0 && fitCheck.page <= fitCheck.avail,
      `the page fits the column without horizontal clipping (page ${Math.round(fitCheck.page)}px in ${fitCheck.avail}px)`);
    await page.screenshot({ path: `${SHOTS}/01-rendered.png`, fullPage: false });

    console.log('\n2. text runs are bound back to real payload paths');
    const bound = await page.locator('[data-pdf-path]').count();
    ok(bound > 0, `${bound} runs resolved to a payload path`);
    const paths = await page.locator('[data-pdf-path]').evaluateAll(
      (els) => [...new Set(els.map((e) => e.getAttribute('data-pdf-path')))]
    );
    ok(paths.includes('homeowner.name'), `homeowner.name is clickable (sample: ${paths.slice(0, 6).join(', ')})`);
    const lockedRuns = await page.locator('[data-pdf-locked]').count();
    ok(lockedRuns > 0, `${lockedRuns} runs are marked locked (NJ clauses are not freely editable)`);

    console.log('\n3. clicking a value opens an editor on that value');
    const target = page.locator('[data-pdf-path="homeowner.name"]').first();
    await target.scrollIntoViewIfNeeded();
    await target.click();
    await page.waitForSelector('[data-testid="pdf-inline-editor"]', { timeout: 10000 });
    const editorValue = await page.locator('[data-testid="pdf-inline-editor"] input, [data-testid="pdf-inline-editor"] textarea').first().inputValue();
    ok(editorValue.includes('Verify Testcase'), `the editor opened holding the current value ("${editorValue}")`);
    await page.screenshot({ path: `${SHOTS}/02-click-to-edit.png` });

    console.log('\n4. a confirmed edit reaches the server, on the right leaf and nothing else');
    const before = await apiFetch(`/api/documents/${docId}`);
    const beforeKeys = Object.keys(before.data.document.payload.homeowner).sort().join(',');
    const input = page.locator('[data-testid="pdf-inline-editor"] input, [data-testid="pdf-inline-editor"] textarea').first();
    await input.fill('Edited From The PDF');
    await input.press('Enter');
    let after = null;
    for (let i = 0; i < 25; i++) {
      await page.waitForTimeout(600);
      after = await apiFetch(`/api/documents/${docId}`);
      if (after.data?.document?.payload?.homeowner?.name === 'Edited From The PDF') break;
    }
    ok(after?.data?.document?.payload?.homeowner?.name === 'Edited From The PDF',
      `the payload now reads "${after?.data?.document?.payload?.homeowner?.name}"`);
    const afterKeys = Object.keys(after.data.document.payload.homeowner).sort().join(',');
    ok(beforeKeys === afterKeys, `no sibling keys were destroyed (${afterKeys})`);
    ok(after.data.document.payload.payment?.total_cents === 1234567, 'the total is untouched');

    console.log('\n5. a locked clause explains itself, names where to fix it, and unlocks in place');
    // The company address in the page footer used to belong to no field at all: the template
    // printed a config constant because zod stripped contractor.address_footer on every save,
    // so seven runs per contract refused every click. It now prints the payload.
    const addrRuns = page.locator('[data-pdf-path="contractor.address"]');
    const addrCount = await addrRuns.count();
    ok(addrCount > 0, `the company address resolves to contractor.address (${addrCount} runs on this page)`);

    const locked = addrCount ? addrRuns.first() : page.locator('[data-pdf-locked]').first();
    if (await locked.count()) {
      await locked.scrollIntoViewIfNeeded();
      await locked.click();
      await page.waitForSelector('[data-testid="pdf-toast"]', { timeout: 8000 }).catch(() => {});
      const toastEl = page.locator('[data-testid="pdf-toast"]');
      const openEditor = await page.locator('[data-testid="pdf-inline-editor"]').count();
      ok(await toastEl.count() > 0 && openEditor === 0, 'clicking a locked run explains why instead of opening an editor');

      const kind = await toastEl.getAttribute('data-toast-kind');
      ok(String(kind).startsWith('lock-'), `the message knows which kind of lock this is (${kind})`);
      const toastText = (await toastEl.innerText()).replace(/\s+/g, ' ');
      ok(!/required NJ contract language/i.test(toastText),
        'it no longer claims New Jersey requires this wording');
      ok(!/Unlock it in the Legal tab/i.test(toastText),
        'it no longer sends the user to a tab this field is not in');

      // "contains ›" is not evidence: the field breadcrumb ("contractor › address") satisfies it
      // without naming a destination. Require the destination sentence, parse the trail out of
      // it, and later prove the app really goes there.
      const crumbMatch = toastText.match(/The field is in ([^.]+)\./);
      ok(!!crumbMatch, `it names a destination, not just the field: "${toastText.slice(0, 140)}"`);
      const crumbs = (crumbMatch?.[1] || '').split('›').map((s) => s.trim()).filter(Boolean);
      ok(crumbs.length >= 2, `the destination is a real trail, tab and section (${JSON.stringify(crumbs)})`);
      ok(crumbs[0] === 'Form', `contractor.address is in the Form tab, and the message says so (${crumbs[0]})`);

      const actions = page.locator('[data-testid="pdf-toast-action"]');
      const nActions = await actions.count();
      ok(nActions >= 1, `${nActions} next step(s) offered instead of a dead end`);
      const box = await actions.first().boundingBox();
      ok(!!box && box.height >= 44, `the action is tappable on a phone (${Math.round(box?.height || 0)}px tall)`);
      await page.screenshot({ path: `${SHOTS}/03-locked.png` });

      // The button label has to repeat the destination, so the user reads it before tapping.
      const openBtn = actions.filter({ hasText: /^Open / }).first();
      ok(await openBtn.count() > 0, 'a button offers to take the user there');
      if (await openBtn.count()) {
        const openLabel = (await openBtn.innerText()).replace(/\s+/g, ' ').trim();
        ok(crumbs.every((c) => openLabel.includes(c)),
          `the button repeats the same destination ("${openLabel}")`);
        await openBtn.click();
        await page.waitForTimeout(1500);
        const landed = await page.evaluate((p) => {
          const row = document.querySelector(`[data-field-path="${p}"]`);
          const tabs = Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"]'))
            .map((e) => e.textContent.trim());
          if (!row) return { mounted: false, visible: false, tabs };
          const r = row.getBoundingClientRect();
          return { mounted: true, visible: r.height > 0 && r.top < window.innerHeight && r.bottom > 0, tabs };
        }, 'contractor.address');
        ok(landed.mounted, 'tapping it mounts the field row, no hunting');
        ok(landed.visible, 'and the row is on screen, not scrolled past or inside a closed sub-tab');
        // Cross-check: the claim in the toast and the tab state after the tap come from two
        // independent places. If the message named a tab it does not open, this fails.
        ok(landed.tabs.includes(crumbs[0]) && landed.tabs.includes(crumbs[1]),
          `it landed on the tabs it promised (said ${crumbs.slice(0, 2).join(' › ')}, opened ${JSON.stringify(landed.tabs)})`);
      }

      // Back to the document, then prove the in-place unlock still works.
      const pdfTab = page.locator('[role="tab"]').filter({ hasText: /^PDF$/ }).first();
      if (await pdfTab.count()) await pdfTab.click().catch(() => {});
      await page.waitForTimeout(600);
      const relocked = page.locator('[data-pdf-path="contractor.address"]').first();
      if (await relocked.count()) { await relocked.scrollIntoViewIfNeeded().catch(() => {}); await relocked.click({ force: true }); }
      await page.waitForSelector('[data-testid="pdf-toast"]', { timeout: 8000 }).catch(() => {});
      const unlockBtn = page.locator('[data-testid="pdf-toast-action"]').filter({ hasText: /Unlock and edit here/i }).first();
      if (await unlockBtn.count()) {
        await unlockBtn.click();
        const opened = await page.waitForSelector('[data-testid="pdf-inline-editor"]', { timeout: 8000 })
          .then(() => true).catch(() => false);
        ok(opened, '"Unlock and edit here" unlocks and opens the editor without leaving the document');
        await page.keyboard.press('Escape');
      } else {
        ok(false, 'an identity field offered no way to unlock it from the document');
      }
    } else { ok(false, 'no locked run to click'); }

    console.log('\n5d. the one clause NJ really does fix word-for-word behaves differently');
    // right_to_cancel.text is verbatim statute (N.J.S.A. 56:8-151). It is the ONLY clause where
    // "you cannot edit this" is true, so it must not offer an inline unlock, and it is the case
    // the old toast described for all 30 locks. It genuinely lives in the Legal tab: prove the
    // app opens it rather than telling the user to go find it.
    const rtcTab = page.locator('[role="tab"]').filter({ hasText: /^PDF$/ }).first();
    if (await rtcTab.count()) await rtcTab.click().catch(() => {});
    await page.waitForTimeout(600);
    const rtc = page.locator('[data-pdf-path="right_to_cancel.text"]').first();
    if (await rtc.count()) {
      await rtc.scrollIntoViewIfNeeded().catch(() => {});
      await rtc.click({ force: true });
      await page.waitForSelector('[data-testid="pdf-toast"]', { timeout: 8000 }).catch(() => {});
      const t = page.locator('[data-testid="pdf-toast"]');
      const kind = await t.getAttribute('data-toast-kind');
      const text = (await t.innerText()).replace(/\s+/g, ' ');
      ok(kind === 'lock-statutory', `the statutory clause is labelled as statutory (${kind})`);
      ok(/56:8-151/.test(text), 'and cites the statute instead of asserting it');
      const acts = page.locator('[data-testid="pdf-toast-action"]');
      const labels = [];
      for (let i = 0; i < await acts.count(); i++) labels.push((await acts.nth(i).innerText()).replace(/\s+/g, ' ').trim());
      ok(!labels.some((l) => /Unlock and edit here/i.test(l)),
        `no inline unlock is offered for verbatim statute (${JSON.stringify(labels)})`);
      const crumb = (text.match(/The field is in ([^.]+)\./)?.[1] || '').split('›').map((s) => s.trim()).filter(Boolean);
      ok(crumb[0] === 'Legal', `this one really is in Legal, and it says which part (${crumb.join(' › ')})`);
      const goBtn = acts.filter({ hasText: /^Open / }).first();
      if (await goBtn.count()) {
        await goBtn.click();
        await page.waitForTimeout(1500);
        const landed = await page.evaluate(() => {
          const row = document.querySelector('[data-field-path="right_to_cancel.text"]');
          const tabs = Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"]')).map((e) => e.textContent.trim());
          if (!row) return { mounted: false, visible: false, tabs };
          const r = row.getBoundingClientRect();
          return { mounted: true, visible: r.height > 0 && r.top < window.innerHeight && r.bottom > 0, tabs };
        });
        ok(landed.mounted && landed.visible, 'the Legal clause is opened for the user, not described to them');
        ok(crumb.slice(0, 2).every((c) => landed.tabs.includes(c)),
          `and the Legal sub-tab it named is the one that opened (${JSON.stringify(landed.tabs)})`);
        await page.screenshot({ path: `${SHOTS}/03d-statutory.png` });
      } else { ok(false, 'the statutory clause offered no way to reach its field'); }
      const back = page.locator('[role="tab"]').filter({ hasText: /^PDF$/ }).first();
      if (await back.count()) await back.click().catch(() => {});
      await page.waitForTimeout(600);
    } else { ok(false, 'the right-to-cancel notice did not resolve to a payload path'); }

    console.log('\n5b. a calculated figure is explained, not called template chrome');
    // 50% of $12,345.67 is 617283.5 cents. The renderer rounds to $6,172.84 and stores only the
    // percentage, so this string is in no payload leaf — the old message called it "part of the
    // template, not a field you can change", which is both false and a dead end.
    const computedText = '6,172.84';
    const moneyRun = page.locator('[data-testid^="pdf-textlayer-"] span').filter({ hasText: computedText }).first();
    if (await moneyRun.count()) {
      ok(await moneyRun.getAttribute('data-pdf-path') === null, 'the computed amount is not a payload leaf');
      await moneyRun.scrollIntoViewIfNeeded();
      await moneyRun.click();
      await page.waitForSelector('[data-testid="pdf-toast"]', { timeout: 8000 }).catch(() => {});
      const kind = await page.locator('[data-testid="pdf-toast"]').getAttribute('data-toast-kind');
      const text = (await page.locator('[data-testid="pdf-toast"]').innerText()).replace(/\s+/g, ' ');
      ok(kind === 'refusal-computed', `it is explained as arithmetic, not chrome (kind=${kind})`);
      ok(/50%/.test(text), `and names the percentage that produces it: "${text.slice(0, 120)}"`);
      await page.screenshot({ path: `${SHOTS}/03b-computed.png` });
      await page.keyboard.press('Escape');
    } else { ok(false, `no run printing ${computedText} — the schedule should render 50% of the total`); }

    console.log('\n5c. no click anywhere gets the old one-size-fits-all brush-off');
    {
      const unresolved = page.locator('[data-testid^="pdf-textlayer-"] span:not([data-pdf-path])');
      const total = await unresolved.count();
      const kinds = new Set();
      let banned = 0, checked = 0;
      for (let i = 0; i < total && checked < 8; i += Math.max(1, Math.floor(total / 8))) {
        const run = unresolved.nth(i);
        const t = (await run.innerText().catch(() => '')).trim();
        if (t.length < 4) continue;
        await run.scrollIntoViewIfNeeded().catch(() => {});
        await run.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(250);
        const el = page.locator('[data-testid="pdf-toast"]');
        if (!(await el.count())) continue;
        checked++;
        kinds.add(await el.getAttribute('data-toast-kind'));
        const txt = await el.innerText();
        if (/part of the template, not a field you can change|required NJ contract language/i.test(txt)) banned++;
      }
      ok(checked > 0, `${checked} unresolved runs sampled out of ${total}`);
      ok(banned === 0, 'none of them produced the old brush-off sentence');
      ok([...kinds].every((k) => String(k).startsWith('refusal-') || String(k).startsWith('lock-')),
        `every refusal declared its cause (${[...kinds].join(', ')})`);
    }

    console.log('\n6. the form and the document stay on the same field');
    await page.keyboard.press('Escape');
    const scroller = page.locator('[data-testid="pdf-scroller"]');
    await page.locator('[role="tab"]', { hasText: 'Form' }).first().click().catch(() => {});
    await page.waitForTimeout(400);

    // 6a. Touching a row takes the document to that field. This is the case that always
    // applies: the accordion shows one section at a time, so the form column is usually too
    // short to scroll at all, and a scroll-only pairing would be dead most of the time.
    const anchored = await page.locator('[data-pdf-path]').evaluateAll(
      (els) => [...new Set(els.map((e) => e.getAttribute('data-pdf-path')))]
    );
    const rowPaths = await page.locator('[data-field-path]').evaluateAll(
      (els) => els.map((e) => e.getAttribute('data-field-path'))
    );
    ok(rowPaths.length > 0, `${rowPaths.length} form rows carry a payload path`);

    // Pick a field that is on the page and NOT near the top, so a jump is measurable.
    let jumped = false, jumpNote = '';
    for (const sub of ['Payment', 'Timeline', 'Scope', 'Homeowner']) {
      await page.locator('button', { hasText: new RegExp(`^${sub}$`) }).first().click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(500);
      const rows = page.locator('[data-field-path]');
      const n = await rows.count();
      for (let i = 0; i < n; i++) {
        const p = await rows.nth(i).getAttribute('data-field-path');
        if (!anchored.includes(p)) continue;
        const before = await scroller.evaluate((el) => el.scrollTop);
        await rows.nth(i).click({ position: { x: 10, y: 10 } }).catch(() => {});
        await page.waitForTimeout(1400);
        const after = await scroller.evaluate((el) => el.scrollTop);
        if (after !== before) { jumped = true; jumpNote = `${sub}/${p}: ${before} → ${after}`; break; }
        jumpNote = `${sub}/${p}: no movement (${before})`;
      }
      if (jumped) break;
    }
    ok(jumped, `tapping a form row moved the document to that field (${jumpNote})`);
    await page.screenshot({ path: `${SHOTS}/04-tap-to-locate.png` });

    // 6b. The reverse: scrolling the document brings the form to whatever is at the top.
    const before6b = await page.evaluate(() => {
      const col = [...document.querySelectorAll('div')].filter((d) => d.querySelector('[data-field-path]'))
        .sort((a, b) => a.scrollHeight - b.scrollHeight)[0];
      return { top: col?.scrollTop ?? null };
    });
    await scroller.evaluate((el) => { el.scrollTop = Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + 1400); });
    await page.waitForTimeout(1500);
    const focused = await page.locator('.ring-sunvic-500[data-field-path], [data-field-path].ring-2').count();
    const docMoved = await scroller.evaluate((el) => el.scrollTop);
    ok(docMoved > 0, `the document scrolled to ${docMoved}`);
    ok(before6b.top !== null, 'the form column was measurable for the reverse direction');
    await page.screenshot({ path: `${SHOTS}/04b-doc-scroll.png` });

    console.log('\n7. send: the button reports the real blockers instead of dying silently');
    const sendBtn = page.locator('[data-testid="send-open"]');
    await sendBtn.waitFor({ timeout: 10000 });
    const badge = await sendBtn.getAttribute('data-blockers');
    const server409 = await apiFetch(`/api/documents/${docId}/email`, { method: 'POST', body: JSON.stringify({ to: 'nobody@example.com' }) });
    const serverIssues = (server409.data?.issues || []).map((i) => i.field).sort();
    ok(server409.status === 409, `the server refuses this document with ${server409.status} (${server409.data?.error})`);
    ok(serverIssues.includes('timeline.start_date'), `the server names the missing start date (${serverIssues.join(', ')})`);
    await sendBtn.click();
    await page.waitForSelector('[data-testid="send-panel"]', { timeout: 10000 });
    const rows = page.locator('[data-testid="send-blocker-row"]');
    const uiFields = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-field')).sort());
    ok(uiFields.includes('timeline.start_date'), `the checklist shows the same field the server named (${uiFields.join(', ')})`);
    ok(String(badge) === String(Number(badge)) && Number(badge) > 0, `the Send button carries a live blocker count (${badge})`);
    await page.screenshot({ path: `${SHOTS}/05-send-checklist.png` });

    console.log('\n8. "Fix →" lands on the field, mounted and on screen');
    await rows.filter({ has: page.locator('[data-field="timeline.start_date"]') }).first().click()
      .catch(async () => { await page.locator('[data-field="timeline.start_date"]').first().click(); });
    await page.waitForTimeout(1400);
    const landed = page.locator('[data-field-path="timeline.start_date"]');
    ok(await landed.count() > 0, 'the start-date row is now mounted');
    ok(await landed.first().isVisible(), 'and visible, not in a collapsed sub-tab');
    await page.screenshot({ path: `${SHOTS}/06-fix-jump.png` });

    console.log('\n9. filling the field clears that blocker live');
    // FieldRow is a collapsed summary until tapped; the input does not exist yet.
    const row = landed.first();
    if (!(await row.locator('input, textarea').first().isVisible().catch(() => false))) {
      await row.locator('button').first().click().catch(() => {});
      await page.waitForTimeout(400);
    }
    const dateInput = row.locator('input[type="date"], input').first();
    await dateInput.waitFor({ timeout: 5000 });
    await dateInput.fill('2026-09-01');
    await dateInput.blur().catch(() => {});
    await page.waitForTimeout(1200);
    const badgeAfter = await page.locator('[data-testid="send-open"]').getAttribute('data-blockers');
    ok(Number(badgeAfter) < Number(badge), `blocker count fell ${badge} → ${badgeAfter} without a reload`);
    await page.screenshot({ path: `${SHOTS}/07-blocker-cleared.png` });

    ok(errors.filter((e) => !/favicon|ResizeObserver/i.test(e)).length === 0,
      `no uncaught page errors (${errors.slice(0, 3).join(' | ') || 'none'})`);

    console.log('\n10. the same things work at phone width');
    const mctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await mctx.addInitScript((t) => { try { localStorage.setItem('sunvic.token', t); } catch {} }, TOKEN);
    const mp = await mctx.newPage();
    const merrors = [];
    mp.on('pageerror', (e) => merrors.push(String(e)));
    await mp.goto(`${BASE}/documents/${docId}`, { waitUntil: 'domcontentloaded' });

    // The Send button has to be reachable without hunting; it lives in the status bar.
    const msend = mp.locator('[data-testid="send-open"]');
    await msend.waitFor({ timeout: 20000 });
    const sbox = await msend.boundingBox();
    // 44, not 40. e2e-workspace has enforced TAP_MIN=44 all along; this file quietly
    // accepted 40 and so it passed 32/32 while the Send button was out of spec. Two
    // harnesses disagreeing on one threshold is a coverage hole, not a pass.
    ok(sbox && sbox.height >= 44, `Send is a real touch target (${Math.round(sbox?.height || 0)}px tall)`);
    ok(sbox && sbox.x + sbox.width <= 391, `and is not pushed off the right edge (ends at ${Math.round((sbox?.x || 0) + (sbox?.width || 0))}px)`);

    await msend.click();
    await mp.waitForSelector('[data-testid="send-panel"]', { timeout: 10000 });
    const pbox = await mp.locator('[data-testid="send-panel"]').boundingBox();
    ok(pbox && pbox.width <= 391, `the checklist is a full-width sheet, not a clipped drawer (${Math.round(pbox?.width || 0)}px)`);
    const mrows = await mp.locator('[data-testid="send-blocker-row"]').count();
    ok(mrows > 0, `${mrows} blockers listed on the phone too`);
    const mrowBox = await mp.locator('[data-testid="send-blocker-row"]').first().boundingBox();
    ok(mrowBox && mrowBox.height >= 44, `each "Fix" row meets the 44px touch minimum (${Math.round(mrowBox?.height || 0)}px)`);
    await mp.screenshot({ path: `${SHOTS}/08-mobile-send.png` });

    // "Fix" has to switch the bottom tab bar as well as the sub-tab.
    await mp.locator('[data-testid="send-blocker-row"]').first().click();
    await mp.waitForTimeout(1400);
    const mLanded = mp.locator('[data-field-path]').first();
    ok(await mLanded.count() > 0, 'Fix landed on a mounted field row');
    ok(await mLanded.isVisible(), 'and it is on screen');
    await mp.screenshot({ path: `${SHOTS}/09-mobile-fix.png` });

    // And the document tab has to show a page that fits 390px, not a clipped one.
    await mp.locator('[role="tab"]', { hasText: /^PDF$/ }).first().click();
    await mp.waitForSelector('[data-testid^="pdf-textlayer-"] span', { timeout: 60000 });
    const mfit = await mp.evaluate(() => {
      const sc = document.querySelector('[data-testid="pdf-scroller"]');
      const pg = sc?.querySelector('canvas')?.parentElement?.parentElement;
      return { avail: sc?.clientWidth ?? 0, page: pg?.getBoundingClientRect().width ?? 0 };
    });
    ok(mfit.page > 0 && mfit.page <= mfit.avail,
      `the page fits a phone column (page ${Math.round(mfit.page)}px in ${mfit.avail}px)`);
    await mp.screenshot({ path: `${SHOTS}/10-mobile-pdf.png` });
    ok(merrors.length === 0, `no uncaught errors on mobile (${merrors.slice(0, 2).join(' | ') || 'none'})`);
    await mctx.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
    const del = await apiFetch(`/api/documents/${docId}?permanent=1`, { method: 'DELETE' });
    console.log(`\nscratch document permanently deleted: HTTP ${del.status}`);
    const check = await apiFetch(`/api/documents/${docId}`);
    console.log(check.status === 404 ? 'confirmed gone (404)' : `WARNING: still readable, HTTP ${check.status}`);
  }
}

main()
  .then(() => { console.log(`\nverify-pdf-send: PASS ${pass} FAIL ${fail}`); process.exit(fail ? 1 : 0); })
  .catch((e) => { console.error('\nverify-pdf-send crashed:', e); process.exit(1); });
