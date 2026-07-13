// Capture 8 UI screenshots of the Sunvic Documents SPA using Playwright.
// - Serves vite preview build (assumed running on 127.0.0.1:4173).
// - Mocks Supabase auth session by injecting into localStorage.
// - Mocks all /api/* backend endpoints with route interception.
// - Copies the real agent-generated JSON payload into the editor so the PDF
//   preview and locked-fields banner reflect a realistic run.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = '/mnt/results/sunvic_demo/ui_screenshots';
fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = 'http://127.0.0.1:4173';

// ── Fixtures ──────────────────────────────────────────────────────
const CONTRACT_PAYLOAD = JSON.parse(fs.readFileSync('/mnt/results/sunvic_demo/contract_agent.json', 'utf-8'));
const INVOICE_PAYLOAD  = JSON.parse(fs.readFileSync('/mnt/results/sunvic_demo/invoice_agent.json', 'utf-8'));

const DOC_CONTRACT = {
  id: 'doc-contract-0001',
  template: 'contract',
  doc_number: 'CTR-2026-0005',
  title: 'Chen Residence — Full Renovation',
  client_name: CONTRACT_PAYLOAD.homeowner?.name || 'John & Sarah Chen',
  client_email: CONTRACT_PAYLOAD.homeowner?.email || 'chen.family@example.com',
  status: 'draft',
  total_cents: 48500000,
  payload: CONTRACT_PAYLOAD,
  locks: {
    'contractor.name': true,
    'contractor.email': true,
    'contractor.license': true,
    'invoice_terms.text': true,
    'signature.line': true,
    'agreement_summary.text': true,
    'payment.schedule': true,
  },
  created_at: '2026-07-12T22:41:00Z',
  updated_at: '2026-07-12T22:44:00Z',
};

const DOC_INVOICE = {
  id: 'doc-invoice-0001',
  template: 'invoice',
  doc_number: 'INV-2026-0002',
  title: 'Chen Residence — P2 MEP Rough-In',
  client_name: INVOICE_PAYLOAD.bill_to?.name || 'John & Sarah Chen',
  client_email: INVOICE_PAYLOAD.bill_to?.email || 'chen.family@example.com',
  status: 'sent',
  total_cents: 14839181,
  payload: INVOICE_PAYLOAD,
  locks: {
    'contractor.name': true,
    'contractor.email': true,
    'invoice_terms.text': true,
    'payment_methods': true,
  },
  created_at: '2026-07-12T22:47:00Z',
  updated_at: '2026-07-12T22:49:00Z',
};

const DOCS = [DOC_CONTRACT, DOC_INVOICE];

const MODELS = [
  { id: 'openai/gpt-oss-120b:free',            label: 'GPT-OSS 120B (free)',     provider: 'openrouter' },
  { id: 'nvidia/nemotron-nano-9b-v2:free',     label: 'Nemotron Nano 9B (free)', provider: 'openrouter' },
  { id: 'llama-3.3-70b-versatile',             label: 'Llama 3.3 70B (Groq)',    provider: 'groq' },
];

const FAKE_SESSION = {
  access_token: 'mock.jwt.token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'mock-refresh',
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'demo@sunvicnj.com',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: 'Demo User' },
    created_at: '2026-01-01T00:00:00Z',
  },
};

// ── Helpers ───────────────────────────────────────────────────────
async function mockRoutes(page) {
  // Intercept any Supabase auth/JWKS/introspection call so the fake session
  // is never actively validated against the placeholder URL.
  await page.route('**/placeholder.supabase.co/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const p = url.pathname;

    const json = (obj, status = 200) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(obj),
    });

    if (p === '/api/models') return json({ models: MODELS });
    if (p === '/api/documents' && method === 'GET') return json({ documents: DOCS });
    if (p === '/api/documents' && method === 'POST') {
      const body = JSON.parse(route.request().postData() || '{}');
      const isInvoice = body.template === 'invoice';
      return json({ document: isInvoice ? DOC_INVOICE : DOC_CONTRACT }, 201);
    }
    const m = p.match(/^\/api\/documents\/([^/]+)(\/.*)?$/);
    if (m) {
      const id = m[1];
      const sub = m[2] || '';
      const doc = DOCS.find(d => d.id === id) || DOC_CONTRACT;
      if (sub === '' && method === 'GET') return json({ document: doc });
      if (sub === '' && method === 'PATCH') return json({ document: { ...doc, updated_at: new Date().toISOString() } });
      if (sub === '/pdf') return json({ signed_url: 'blob:mock-preview' });
      if (sub === '/email') return json({ sent: true });
    }
    if (p === '/api/agent/oneshot') return json({ document: DOC_CONTRACT, meta: { model: 'openai/gpt-oss-120b:free', tokens: { prompt: 1580, completion: 2128 } } });
    if (p === '/api/agent/chat') return json({ delta: { agreement_summary: { text: '(updated by agent)' } } });

    return json({ ok: true });
  });
}

async function injectSession(page) {
  // Store the Supabase session as raw session object (not wrapped) — that's
  // the format @supabase/auth-js's getItemAsync expects (JSON.parse of value
  // yields the session directly).
  await page.addInitScript((session) => {
    try {
      const projectRef = 'placeholder';
      const storageKey = `sb-${projectRef}-auth-token`;
      window.localStorage.setItem(storageKey, JSON.stringify(session));
    } catch (e) { /* noop */ }
  }, FAKE_SESSION);
}

async function shot(page, name) {
  const out = path.join(OUT_DIR, `${name}.png`);
  // Remove first to avoid S3 overwrite EPERM
  try { fs.unlinkSync(out); } catch {}
  await page.screenshot({ path: out, fullPage: true });
  console.log(`  ✓ ${out}  (${fs.statSync(out).size} bytes)`);
}

// ── Main flow ─────────────────────────────────────────────────────
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  await mockRoutes(page);

  // 01 — sign in (no session, hit the sign-in page)
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await shot(page, '01_signin');

  // Now attach the mock session for subsequent authenticated navigation.
  await injectSession(page);

  // 02 — documents list
  await page.goto(`${BASE}/documents`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot(page, '02_documents_list');

  // 03 — new document prompt
  await page.goto(`${BASE}/documents/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await shot(page, '03_new_document_prompt');

  // 04 — new document with prompt typed in
  const textarea = await page.locator('textarea').first();
  if (await textarea.count()) {
    await textarea.fill('Full home renovation at 665 Denver Blvd, Old Bridge NJ 08857. Property is 3,200 sqft. Scope: gut renovate the kitchen and two full bathrooms, plus build a second-story addition. Homeowners are John and Sarah Chen. Total budget $485,000.');
    await page.waitForTimeout(300);
  }
  await shot(page, '04_new_document_filled');

  // 05 — document editor (contract) — Editor tab
  await page.goto(`${BASE}/documents/${DOC_CONTRACT.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot(page, '05_editor_contract');

  // 06 — same page but Legal tab active (canonical clauses)
  const legalTab = page.locator('button', { hasText: /^LEGAL$/ }).first();
  if (await legalTab.count()) {
    await legalTab.click().catch(() => {});
    await page.waitForTimeout(600);
  }
  await shot(page, '06_editor_legal_tab');

  // 07 — document editor (invoice) — SPA schema is out of sync with current
  // template payload shape (SPA expects payload.phases[]; templates use
  // line_items[]). We still visit but disable networkidle wait since some
  // silent re-renders happen; capture what we can.
  try {
    await page.goto(`${BASE}/documents/${DOC_INVOICE.id}`, { waitUntil: 'domcontentloaded', timeout: 8000 });
    await page.waitForTimeout(1500);
  } catch (e) {
    console.log('  invoice editor nav timed out (SPA schema drift) — capturing whatever loaded');
  }
  await shot(page, '07_editor_invoice');

  // 08 — Actions tab on the contract (Generate PDF / Email / Status)
  await page.goto(`${BASE}/documents/${DOC_CONTRACT.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const actionsTab = page.locator('button', { hasText: /^ACTIONS$/ }).first();
  if (await actionsTab.count()) {
    await actionsTab.click().catch(() => {});
    await page.waitForTimeout(500);
  }
  await shot(page, '08_editor_actions_tab');

  await browser.close();
  console.log('\nAll UI screenshots written to', OUT_DIR);
})().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
