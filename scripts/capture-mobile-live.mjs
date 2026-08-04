// Ground-truth mobile screenshot capture against the LIVE deployment.
// Injects a REAL Supabase session into localStorage (no mocked routes, no fake
// session) and drives https://sun-vic2.vercel.app at mobile + a desktop control.
//
// Usage:
//   node scripts/capture-mobile-live.mjs [baseURL] [outDir]
// Requires: /workspace/session.json (real access/refresh token) and a seeded doc id.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'https://sun-vic2.vercel.app';
const OUT = process.argv[3] || '/mnt/results/sunvic_audit/mobile_screenshots';
const SUPABASE_REF = 'xfhiwodulrbbtfcqneqt';
const STORAGE_KEY = `sb-${SUPABASE_REF}-auth-token`;
const SEEDED_DOC = process.env.SV_DOC_ID || 'c8b7808c-b9ad-4120-b391-a5d1d321371a';

const session = JSON.parse(fs.readFileSync(process.env.SV_SESSION || '/workspace/session.json', 'utf8'));

// supabase-js stores the session under this key as a JSON string.
const storageValue = JSON.stringify({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_in: session.expires_in,
  expires_at: session.expires_at || Math.floor(Date.now() / 1000) + (session.expires_in || 3600),
  token_type: session.token_type || 'bearer',
  user: session.user,
});

fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'iphone12', width: 390, height: 844, dsf: 3, isMobile: true },
  { name: 'pixel7', width: 412, height: 915, dsf: 2.6, isMobile: true },
  { name: 'desktop', width: 1440, height: 900, dsf: 2, isMobile: false },
];

const ROUTES = [
  { name: 'signin', path: '/signin', auth: false },
  { name: 'chat_home', path: '/', auth: true },
  { name: 'projects', path: '/projects', auth: true },
  { name: 'documents', path: '/documents', auth: true },
  { name: 'new_document', path: '/documents/new', auth: true },
  { name: 'settings', path: '/settings', auth: true },
  { name: 'editor', path: `/documents/${SEEDED_DOC}`, auth: true },
];

async function overflowReport(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const hasHScroll = de.scrollWidth > de.clientWidth + 1;
    // find elements wider than viewport
    const vw = window.innerWidth;
    const offenders = [];
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > vw + 2 && r.right > vw + 2) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 60),
          w: Math.round(r.width), right: Math.round(r.right),
        });
      }
    });
    // find small tap targets (interactive elements < 44px in either dim)
    const smallTaps = [];
    document.querySelectorAll('button, a, input, [role="button"]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return; // hidden
      if (r.height < 40 || r.width < 40) {
        const label = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 30);
        smallTaps.push({ tag: el.tagName.toLowerCase(), h: Math.round(r.height), w: Math.round(r.width), label });
      }
    });
    return { hasHScroll, scrollWidth: de.scrollWidth, clientWidth: de.clientWidth,
             offenders: offenders.slice(0, 8), smallTaps: smallTaps.slice(0, 12) };
  });
}

const results = [];

const browser = await chromium.launch({ headless: true });
try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.dsf,
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile,
    });
    // Inject session before any page script runs.
    await context.addInitScript(([key, val]) => {
      try { window.localStorage.setItem(key, val); } catch {}
    }, [STORAGE_KEY, storageValue]);

    const page = await context.newPage();

    for (const route of ROUTES) {
      const url = BASE + route.path;
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
      } catch (e) {
        // networkidle can time out on polling apps; fall back to domcontentloaded
        try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch {}
      }
      await page.waitForTimeout(2500); // let React render + data fetch
      const file = path.join(OUT, `${route.name}__${vp.name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      let rep = { error: 'n/a' };
      try { rep = await overflowReport(page); } catch (e) { rep = { error: String(e).slice(0, 100) }; }
      results.push({ route: route.name, vp: vp.name, url, file: path.basename(file), ...rep });
      const flag = rep.hasHScroll ? ' ⚠ H-SCROLL' : '';
      const taps = rep.smallTaps?.length ? ` ⚠ ${rep.smallTaps.length} small-taps` : '';
      console.log(`  ${route.name.padEnd(14)} ${vp.name.padEnd(9)} ${path.basename(file)}${flag}${taps}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(OUT, '_report.json'), JSON.stringify(results, null, 2));
console.log(`\nWrote ${results.length} screenshots + _report.json to ${OUT}`);
// Summary of problems
const problems = results.filter((r) => r.hasHScroll || (r.smallTaps && r.smallTaps.length));
console.log(`\n=== ${problems.length} route/vp combos with issues ===`);
for (const p of problems) {
  console.log(`${p.route} @ ${p.vp}: hscroll=${p.hasHScroll} smallTaps=${(p.smallTaps||[]).length}`);
  if (p.hasHScroll && p.offenders?.length) {
    p.offenders.forEach((o) => console.log(`   overflow: <${o.tag} class="${o.cls}"> w=${o.w} right=${o.right}`));
  }
  (p.smallTaps || []).forEach((t) => console.log(`   small-tap: <${t.tag}> ${t.h}x${t.w} "${t.label}"`));
}
