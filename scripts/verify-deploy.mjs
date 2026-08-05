// Verify the deploy through a real browser. Vercel's bot checkpoint answers plain curl
// with 403, but a real engine solves the JS challenge — and the browser path is the one
// that actually matters. Content marker, not bundle hash: two builds of the identical
// commit produce different hashes here, so a hash tells you nothing.
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'https://sun-vic2.vercel.app';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
const r = await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
console.log('status', r?.status(), '| title', await page.title());
await page.waitForTimeout(4000);

const assets = await page.evaluate(() => ({
  css: [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.getAttribute('href')),
  js: [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')),
}));
console.log('assets', JSON.stringify(assets));

// The marker: does the LIVE cascade actually give form controls 16px?
await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
const fonts = await page.evaluate(() =>
  [...document.querySelectorAll('input, textarea, select')]
    .filter((el) => el.getBoundingClientRect().height > 0)
    .map((el) => `${el.tagName.toLowerCase()} ${parseFloat(getComputedStyle(el).fontSize)}px`));
console.log('settings controls:', JSON.stringify(fonts));
console.log('MARKER 16px-everywhere:', fonts.length > 0 && fonts.every((f) => f.endsWith('16px')));

await browser.close();
