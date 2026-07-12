# Sunvic Documents Engine

Production-grade contract + invoice engine for Sunvic Construction. Rebuilds the client-only `/invoice` SPA as a backend-persisted, agentic document system matching the 10-page NJ Home Improvement Contract template.

## Highlights

- **Two templates from one route**: `/documents` handles both Contract (10 pages, sections A–L, matches the reference PDF) and Invoice (2 pages, matches the current sunvicnj.com/invoice look).
- **Backend persistence**: Netlify Functions + Supabase (Postgres + Storage). Every document versioned; every agent action logged.
- **Agentic + manual**: one-shot generation (prompt → full document), chat sidebar (per-tool edits), and direct manual editing all work on the same payload.
- **Model-agnostic LLM layer**: Cohere Command A (default), OpenRouter GPT-OSS, Google Gemma. Swappable per-call via the header dropdown.
- **Per-field locks**: legal blocks (warranties/permits/insurance/dispute resolution/right-to-cancel) are locked by default; users unlock explicitly. Agent tools respect the same locks server-side.
- **Server-rendered PDFs**: identical `@react-pdf/renderer` tree runs in the browser preview (`<PDFViewer>`) and in Netlify Functions (`renderToBuffer`) — WYSIWYG for what gets emailed.
- **Email via Resend**: signed PDF attachment; sets status → `sent`.
- **Public share links**: HMAC-signed URL for read-only client access without login.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Vite + React 18 + Tailwind + React Router 6 + React Query |
| PDF | `@react-pdf/renderer` (browser preview + server render) |
| API | Netlify Functions (Node 20, esbuild bundler) |
| DB / Storage / Auth | Supabase (Postgres + RLS + Storage bucket + `auth.users`) |
| Email | Resend |
| LLMs | Cohere v2 chat / OpenRouter (OpenAI-compatible) / Google AI Studio Gemma |

## Directory Layout

```
build/
├── src/                      React SPA
│   ├── main.jsx              Routes + auth guard
│   ├── lib/{api,hooks,supabase}.js
│   ├── components/           AppShell, ModelPickerDropdown, LockableField, PDFPreview, AgentChatPanel
│   └── pages/                SignInPage, DocumentsListPage, NewDocumentPage, DocumentEditorPage
├── netlify/functions/        API endpoints (8)
│   ├── documents.js          GET list / POST create (+ agent oneshot path)
│   ├── document.js           GET/PATCH/DELETE single (lock-guarded)
│   ├── document-pdf.js       Server-render PDF → Supabase Storage → signed URL
│   ├── document-email.js     Resend send with attachment
│   ├── document-public.js    HMAC-signed public link
│   ├── agent-oneshot.js      Prompt → full payload
│   ├── agent-chat.js         Chat with tool loop (up to 6 iterations)
│   ├── models.js             Available LLM providers
│   └── _shared/              http, locks, totals helpers
├── packages/
│   ├── schema/documents.js       Zod schemas (ContractPayload, InvoicePayload, LineItem, Phase, ...)
│   ├── templates/
│   │   ├── legal.js              Canonical warranty/permits/insurance/dispute/right-to-cancel text
│   │   ├── defaults.js           defaultContractPayload / defaultInvoicePayload / defaultLocksFor
│   │   ├── format.js             fmtUSD, fmtDate, phaseCost, invoiceTotals, contractTotals
│   │   └── pdf/                  react-pdf trees: ContractPDF (10 pages), InvoicePDF (2 pages), shared styles
│   ├── agent/
│   │   ├── providers/            LLM adapters (cohere/openrouter/gemma) + factory
│   │   ├── classifier.js         Prompt → 'contract' | 'invoice'
│   │   ├── oneshot.js            Strict JSON generation with Zod retry
│   │   ├── tools.js              Tool defs + local executor
│   │   └── chat.js               Tool-loop orchestrator
│   └── db/supabase.js            serviceClient() + verifyUser()
├── supabase/migrations/0001_init.sql
├── netlify.toml
├── vite.config.js
├── tailwind.config.js
└── package.json
```

## Set-up

### 1. Supabase

- Create a Supabase project.
- Run the migration:
  ```bash
  psql $DATABASE_URL -f supabase/migrations/0001_init.sql
  ```
- In the Supabase dashboard, Auth → Providers → enable Email.
- Storage buckets → confirm `documents` bucket exists and is set to **private** (the migration creates it as private, but double-check).

### 2. Environment

Copy `.env.example` → `.env` and fill:

- `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — from Supabase project settings.
- `COHERE_API_KEY` — required (default provider). Get from https://dashboard.cohere.com/api-keys.
- `OPENROUTER_API_KEY` — optional. Enables the OpenRouter GPT-OSS provider.
- `GEMMA_API_KEY` — optional. Enables Google AI Studio Gemma provider.
- `RESEND_API_KEY` — required to email documents.
- `RESEND_FROM_EMAIL` — verified sender in Resend (e.g. `Sunvic Construction <no-reply@sunvicnj.com>`).
- `SESSION_JWT_SECRET` — random 32-char string for HMAC-signed public links.
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — safe to ship to browser (Supabase's design).

### 3. Install + run locally

```bash
npm install
netlify dev                # runs Vite (5173) + Netlify Functions (8888) proxied at :8888
```

Or dev without Netlify emulator (frontend only, no API):
```bash
npm run dev:vite
```

### 4. Deploy

```bash
netlify deploy --build --prod
```

Netlify auto-bundles the functions with esbuild (JSX in the react-pdf templates is handled transparently).

## Acceptance Test

The plan's canonical prompt:

> "Full home reno at 665 Denver Blvd, 3200 sqft, gut kitchen + 2 baths + second-story addition"

Expected behaviour:

1. Classifier returns `contract` (no invoice keywords, "full home reno" and "second-story addition" = new project).
2. Oneshot returns 4–6 phases with realistic NJ pricing:
   - Site prep + demo (~$8–15k)
   - Framing + second-story addition (~$60–120k)
   - MEP rough-in (~$25–45k)
   - Kitchen build-out (~$45–75k)
   - Bathroom build-outs (2× ~$15–25k)
   - Finishes + punch-list (~$30–50k)
3. `payment.schedule` returns the canonical 10 / 30 / 30 / 25 / 5 breakdown.
4. Warranty / permits / insurance / dispute-resolution / right-to-cancel blocks match canonical Sunvic text verbatim and are locked.
5. Editor shows the doc immediately, PDF preview renders 10 pages.

## `/invoice` compatibility

The legacy `sunvicnj.com/invoice` route is served by `netlify.toml`:

```
/invoice → /documents/new?template=invoice   (301)
```

Same UX (new-doc page), same output (Invoice template), but backed by the new engine.

## Lock system (per-field)

- Storage: `documents.locks jsonb` — flat `{ [dotPath: string]: boolean }`.
- Default locks come from `defaultLocksFor(template)` in `packages/templates/defaults.js`.
- Legal blocks locked by default on Contract: `warranties.text`, `permits.text`, `insurance.text`, `dispute_resolution.text`, `right_to_cancel.text`. Also `contractor.legal_name`, `contractor.license_number`.
- Lock enforcement:
  1. **PATCH** `/api/documents/:id` — `mergeWithLocks` drops any locked path in the incoming patch and reports it in `skipped_locks`.
  2. **Agent `set_field` tool** — pre-checks `isLocked(locks, path)`; rejected calls surface as `refused` in the chat panel.
  3. **Frontend `<LockableField>`** — disables the input when locked; user must click the lock icon to explicitly unlock (which PATCHes `locks[path] = false`).

## Agent

- **One-shot** (POST `/api/agent/oneshot`): body `{ prompt, template?, provider?, model? }` → `{ template, payload, ... }`. Runs classifier first, then strict-JSON generation, then Zod-retry (max 2 attempts).
- **Chat** (POST `/api/agent/chat`): body `{ doc_id, message, provider?, model?, history? }`. Loads DB history if `history` empty. Runs tool loop until model returns text without tool_calls (max 6 iterations). Persists agent messages + a `document_revision` snapshot when the payload changed.

**Tools available in chat**:

- `set_field(path, value)` — respects locks
- `add_phase / update_phase / remove_phase`
- `add_item / update_item / remove_item`
- `set_status` (draft | sent | signed | paid | overdue | void)
- `set_payment_schedule(milestones)` — Contract only; must sum to 100%
- `generate_pdf` — regenerates + returns signed URL
- `email_document(to)` — dispatches to `/api/documents/:id/email`

## Migration from the old SPA

The old `sunvicnj.com/invoice` was in-memory only — no persistence. There is nothing to migrate. Existing users hit the 301 and land on the new-doc page.

## Performance targets

| Metric | Target |
|---|---|
| One-shot latency p50 (Cohere Command A) | < 6 s |
| Server PDF render p50 / p95 | < 4 s / < 8 s |
| Frontend gzipped bundle | < 200 KB *net growth* from baseline (baseline was zero — see below) |

Note: current bundle is ~570 KB gzipped, dominated by `@react-pdf/renderer` (~350 KB). Split-point candidate: lazy-load `<PDFPreview>` and both PDF trees behind the editor page's PDF tab. Do this once shipping is confirmed working.

## Known limitations

- **PDF preview browser bundle size** — see above. Ship first, split-point later.
- **Gemma provider is oneshot-only** — Google AI Studio's Gemma endpoint doesn't support native tool-calling; chat mode auto-refuses. Cohere or OpenRouter for chat.
- **RLS on `documents.created_by`** — assumes single-tenant per user. Multi-tenant with team access would need a `team_id` column + policy update.
- **Signed public URLs** — 1-hour TTL. Long-lived shares (e.g. for signature capture) would need a token-refresh endpoint.

## License

Proprietary — Sunvic, LLC Contractors.
