// verify-dashboard — the browser proof for "the dashboard is slop it has no slugs".
//
// Three readings of that complaint, all verified here against production data:
//
//   1. URL-addressable state. A tile you opened has to survive a reload and a
//      shared link, or the dashboard is a toy.
//   2. Plain language. A number nobody can act on is decoration. Every blocker
//      chip has to read like a sentence a contractor would say, not like the
//      payload path it came from (`timeline.start_date`).
//   3. Readable addresses. /documents/<uuid> is not a slug. A document has to be
//      reachable by its document number, and a uuid URL has to correct itself.
//
// And the numbers themselves are cross-checked against the server rather than
// merely being present: whatever the headline claims is recomputed from
// /api/documents?readiness=1 and the two have to agree. A dashboard that renders
// a confident wrong number is worse than one that renders nothing.
//
// No LLM calls, no writes. Read-only against live data.
//
// Usage: node scripts/verify-dashboard.mjs [--base https://sun-vic2.vercel.app] [--shots DIR]

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const BASE = arg('--base', process.env.E2E_BASE || 'https://sun-vic2.vercel.app');
const API = arg('--api', BASE);
const TOKEN = process.env.E2E_TOKEN || 'mock-local-token';
const SHOTS = arg('--shots', '/workspace/shots/dashboard');
const HEADED = args.includes('--headed');
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  ok   ${m}`); } else { fail++; console.log(`  FAIL ${m}`); } };
const note = (m) => console.log(`  ~    ${m}`);

async function apiFetch(pathname) {
  const r = await fetch(`${API}${pathname}`, {
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
  });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: r.status, data, text };
}

const DASH = '[data-testid="dashboard-headline"]';

async function openBusiness(page, query = '') {
  await page.goto(`${BASE}/copilot?tab=business${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(DASH, { timeout: 45_000 });
}

async function main() {
  // ── ground truth from the server, computed the same way the UI must ────────
  const r = await apiFetch('/api/documents?readiness=1');
  const docs = r.data?.documents || r.data || [];
  const rated = docs.filter((d) => d.readiness);
  const blocked = rated.filter((d) => !d.readiness.ok);
  console.log(`server: ${docs.length} documents, ${rated.length} rated, ${blocked.length} blocked`);

  const browser = await chromium.launch({ headless: !HEADED });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript((t) => {
      localStorage.setItem('sunvic.token', t);
      localStorage.setItem('sunvic.auth.token', t);
    }, TOKEN);
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

    // ── 1. the headline is a sentence, and it is the server's number ─────────
    console.log('\n1. headline');
    await openBusiness(page);
    const head = page.locator(DASH);
    const uiBlocked = Number(await head.getAttribute('data-blocked'));
    const uiRated = Number(await head.getAttribute('data-rated'));
    const headText = (await head.innerText()).replace(/\s+/g, ' ').trim();
    note(`"${headText}"`);
    ok(uiRated === rated.length, `headline denominator matches the server (${uiRated} vs ${rated.length})`);
    ok(uiBlocked === blocked.length, `headline numerator matches the server (${uiBlocked} vs ${blocked.length})`);
    // Plain language, not a metric name. "13 of your 17 documents can't be sent yet."
    ok(/can[’']t be sent yet|ready to send/.test(headText), 'headline says what it means in words');
    ok(!/readiness|blocked|payload|_/.test(headText), `headline uses no internal vocabulary (${headText})`);
    ok(new RegExp(`\\b${uiRated}\\b`).test(headText) &&
       (uiBlocked === 0 || new RegExp(`\\b${uiBlocked}\\b`).test(headText)),
       'both numbers appear in the sentence, not just an icon');
    await page.screenshot({ path: `${SHOTS}/01-dashboard.png`, fullPage: true });

    // ── 2. tiles drill through to the documents behind the number ────────────
    console.log('\n2. every number opens');
    const kpis = await page.locator('[data-testid="kpi"]').evaluateAll((els) => els.map((e) => ({
      metric: e.getAttribute('data-metric'),
      count: Number(e.getAttribute('data-count')),
      clickable: e.tagName.toLowerCase() === 'button',
    })));
    note(`tiles: ${kpis.map((k) => `${k.metric}=${k.count}${k.clickable ? '' : ' (inert)'}`).join(', ')}`);
    ok(kpis.length > 0, `dashboard renders KPI tiles (${kpis.length})`);
    // A zero tile that looks clickable and opens an empty panel is a lie about state.
    for (const k of kpis) {
      ok(k.count > 0 ? k.clickable : !k.clickable,
        `${k.metric} (${k.count}) is ${k.count > 0 ? 'clickable' : 'inert'}`);
    }
    const live = kpis.filter((k) => k.count > 0);
    ok(live.length > 0, `at least one tile has something behind it (${live.length})`);

    for (const k of live) {
      await page.locator(`[data-testid="kpi"][data-metric="${k.metric}"]`).click();
      // Sync on the tile itself reporting open, not on the row selector — the previous
      // panel's rows are still in the DOM for a tick and would be counted as this one's.
      await page.waitForSelector(`[data-testid="kpi"][data-metric="${k.metric}"][aria-expanded="true"]`, { timeout: 15_000 }).catch(() => {});
      await page.waitForFunction((m) => new URL(location.href).searchParams.get('metric') === m, k.metric, { timeout: 15_000 }).catch(() => {});
      await page.waitForSelector('[data-testid="drilldown-row"]', { timeout: 15_000 }).catch(() => {});
      const rows = await page.locator('[data-testid="drilldown-row"]').count();
      const url = new URL(page.url());
      ok(url.searchParams.get('metric') === k.metric,
        `${k.metric}: open tile is in the URL (?metric=${url.searchParams.get('metric')})`);
      ok(rows > 0, `${k.metric}: ${rows} document(s) listed behind the number ${k.count}`);
      ok(rows === k.count, `${k.metric}: the list length equals the number on the tile (${rows} vs ${k.count})`);
    }

    // ── 3. a shared link reopens the same panel ──────────────────────────────
    console.log('\n3. ?metric survives a reload');
    const target = live.find((k) => k.metric === 'blocked') || live[0];
    await openBusiness(page, `&metric=${target.metric}`);
    await page.waitForSelector('[data-testid="drilldown-row"]', { timeout: 15_000 }).catch(() => {});
    const reloadedRows = await page.locator('[data-testid="drilldown-row"]').count();
    ok(reloadedRows === target.count,
      `${target.metric} reopened straight from the URL with ${reloadedRows} row(s)`);
    const expanded = await page.locator(`[data-testid="kpi"][data-metric="${target.metric}"]`).getAttribute('aria-expanded');
    ok(expanded === 'true', `the tile itself reads as open (aria-expanded=${expanded})`);

    // ── 4. blocker chips are sentences, not payload paths ────────────────────
    console.log('\n4. chips read like language');
    const chips = await page.locator('[data-testid="blocker-chip"]').evaluateAll((els) => els.map((e) => ({
      field: e.getAttribute('data-field'),
      text: e.textContent.replace(/\s+/g, ' ').trim(),
    })));
    note(`${chips.length} chip(s): ${chips.map((c) => `"${c.text}"`).join(', ')}`);
    ok(chips.length > 0, `blockers are summarised as chips (${chips.length})`);
    // The chip renders "<label>×<n>"; the count suffix is not part of the phrase.
    const stemOf = (t) => t.replace(/\s*[×x*]\s*\d+\s*$/i, '').replace(/\s*\d+\s*$/, '').trim();
    for (const c of chips) {
      const stem = stemOf(c.text);
      // The payload path is what this used to render. It must not survive to the screen.
      ok(!/^[a-z_]+(\.[a-z_]+)+$/.test(stem), `chip is not a raw payload path ("${c.text}")`);
      ok(!/_/.test(stem), `chip has no snake_case ("${c.text}")`);
      ok(stem.length > 3, `chip says something ("${stem}")`);
      // data-field still carries the machine path, so the chip stays debuggable without
      // putting the path on screen.
      ok(!!c.field, `chip keeps its field for debugging (${c.field})`);
    }
    // Chips are a summary of the same blockers the server reported — no invented categories.
    const serverLabels = new Set();
    for (const d of blocked) for (const b of (d.readiness.blockers || [])) serverLabels.add(b.label);
    note(`server distinct labels: ${[...serverLabels].map((s) => `"${s}"`).join(', ')}`);
    for (const c of chips) {
      const stem = stemOf(c.text);
      ok([...serverLabels].some((l) => l.toLowerCase() === stem.toLowerCase()),
        `chip "${stem}" is one the server actually reported`);
    }
    await page.screenshot({ path: `${SHOTS}/02-blocked-drilldown.png`, fullPage: true });

    // ── 5. drill-through lands on the document, by its number ────────────────
    console.log('\n5. drill-through');
    const firstRow = page.locator('[data-testid="drilldown-row"]').first();
    const rowDoc = await firstRow.getAttribute('data-doc');
    await firstRow.click();
    await page.waitForSelector('[data-testid="send-open"]', { timeout: 45_000 });
    note(`landed on ${page.url()}`);
    ok(page.url().includes(`/documents/${rowDoc}`),
      `row for ${rowDoc} opened /documents/${rowDoc} — the document number, not a uuid`);
    ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(page.url()),
      'no uuid in the address bar');

    // ── 6. the document number is a real address, and a uuid corrects itself ──
    console.log('\n6. readable addresses');
    const sample = rated[0] || docs[0];
    await page.goto(`${BASE}/documents/${sample.doc_number}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="send-open"]', { timeout: 45_000 });
    ok(page.url().endsWith(`/documents/${sample.doc_number}`),
      `${sample.doc_number} is directly addressable`);

    await page.goto(`${BASE}/documents/${sample.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="send-open"]', { timeout: 45_000 });
    await page.waitForFunction((n) => location.pathname.endsWith(`/documents/${n}`), sample.doc_number, { timeout: 15_000 })
      .catch(() => {});
    note(`uuid url settled at ${page.url()}`);
    ok(page.url().endsWith(`/documents/${sample.doc_number}`),
      `a uuid URL rewrites itself to ${sample.doc_number}`);

    // A document number that does not exist must 404 cleanly, not crash on a cast.
    const missing = await apiFetch('/api/documents/CTR-9999-9999');
    ok(missing.status === 404, `an unknown document number is a clean 404 (got ${missing.status})`);
    ok(!/22P02|invalid input syntax/i.test(missing.text), 'and not a raw Postgres cast error');

    // ── 7. mobile ────────────────────────────────────────────────────────────
    console.log('\n7. mobile');
    const mctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    });
    await mctx.addInitScript((t) => {
      localStorage.setItem('sunvic.token', t);
      localStorage.setItem('sunvic.auth.token', t);
    }, TOKEN);
    const mp = await mctx.newPage();
    await mp.goto(`${BASE}/copilot?tab=business`, { waitUntil: 'domcontentloaded' });
    await mp.waitForSelector(DASH, { timeout: 45_000 });
    const tile = mp.locator('[data-testid="kpi"]').first();
    const box = await tile.boundingBox();
    ok((box?.height ?? 0) >= 44, `a tile is a real tap target (${Math.round(box?.height ?? 0)}px)`);
    ok((box?.x ?? -1) >= 0 && (box.x + box.width) <= 390 + 1,
      `tile sits inside the viewport (right edge ${Math.round((box?.x ?? 0) + (box?.width ?? 0))}px)`);
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(overflow <= 1, `no horizontal overflow on a phone (${overflow}px)`);
    await mp.screenshot({ path: `${SHOTS}/03-mobile.png`, fullPage: true });
    await mctx.close();

    ok(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await browser.close();
  }

  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
