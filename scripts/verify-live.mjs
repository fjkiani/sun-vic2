import { chromium } from 'playwright';

const BASE = 'https://sun-vic2.vercel.app';
const errors = [];
const consoleMsgs = [];

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

page.on('console', m => consoleMsgs.push({ type: m.type(), text: m.text() }));
page.on('pageerror', e => errors.push(e.message));
page.on('requestfailed', r => errors.push(`REQUEST FAILED: ${r.url()} — ${r.failure()?.errorText}`));

await page.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);

// screenshot
await page.screenshot({ path: '/mnt/results/sunvic_demo/ui_screenshots/10_vercel_live_post_env.png', fullPage: false });
console.log('screenshot saved');

// Try sign-up interaction to see if it initiates a real supabase call now
const emailInput = await page.locator('input[type="email"]').first();
const pwInput = await page.locator('input[type="password"]').first();
if (await emailInput.isVisible() && await pwInput.isVisible()) {
  await emailInput.fill('inspection@example.com');
  await pwInput.fill('inspection-pass-xxx-doesntmatter');
  // Look for a sign-up link and switch
  const signUpLink = page.locator('text=Sign up').first();
  if (await signUpLink.isVisible({ timeout: 2000 }).catch(() => false)) {
    await signUpLink.click();
    await page.waitForTimeout(500);
  }
  const btn = page.locator('button:has-text("Sign")').first();
  if (await btn.isVisible()) {
    await btn.click();
    await page.waitForTimeout(3500);
  }
}

// After the click, take a second screenshot
await page.screenshot({ path: '/mnt/results/sunvic_demo/ui_screenshots/11_vercel_signup_attempt.png' });

console.log('\nErrors:', errors.length);
errors.forEach(e => console.log('  ⚠', e));
console.log('\nConsole logs (last 15):');
consoleMsgs.slice(-15).forEach(m => console.log(`  [${m.type}] ${m.text.slice(0, 250)}`));

await browser.close();
