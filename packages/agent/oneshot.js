// One-shot generator: user prompt → full document payload.
// - Runs classifier to decide contract vs invoice
// - Builds a template-specific system prompt with strict JSON schema
// - Retries once on Zod validation failure with the errors appended
// - Merges the LLM output over defaults + re-applies locked fields on top (defense in depth)

import { getProvider } from './providers/index.js';
import { resolveProviderKey } from '../db/user-keys.js';
import { classifyTemplate } from './classifier.js';
import {
  defaultContractPayload,
  defaultInvoicePayload,
  defaultLocksFor,
} from '../templates/defaults.js';
import { ContractPayload as ContractPayloadSchema, InvoicePayload as InvoicePayloadSchema } from '../schema/documents.js';
import { mergeWithLocks } from '../../netlify/functions/_shared/locks.js';
import { buildFallbackChain, isFallbackableError, clampMaxTokens } from './providers/capabilities.js';
import { composeFromSlots, reconcileWithSlots } from '../templates/compose.js';
import { TAX } from '../config/business.js';

// ────────────────────────────────────────────────────────────
// System prompts (schema-aware — matches current sample-derived schema)
// ────────────────────────────────────────────────────────────

const CONTRACT_SYSTEM = `You are Sunvic Contractors LLC's document assistant. You generate NEW JERSEY home-improvement CONTRACT payloads as strict JSON matching the target schema.

Return ONE JSON object. No prose, no markdown, no code fences.

REQUIRED STRUCTURE OVERVIEW:
- job_no             (string, e.g. "CTR-2026-0001")
- for_label          (string — usually the homeowner name)
- prepared_on        (ISO date string)
- homeowner          { name, address, phone, email }
- agreement_summary  { scope_recap }  — one plain-English paragraph (2-4 sentences) describing the SCOPE only. Do not restate homeowner obligations, subcontractor clauses, or timing — those are canonical and inserted server-side.
- scope_of_work.groups[]  — array of category groups:
    { category: "Demolition & Foundation" | "Exteriors" | "Interiors" | "MEP",
      tasks: [ { task:string, description:[string], qty:string, unit_price_cents:int, amount_cents:int } ] }
- payment                 { labor_cost_cents, materials_cost_cents, total_cents }

RULES:
- Only use the FOUR category values above. Group your tasks accordingly.
- Each task has: task (short name like "Kitchen Cabinets"), description (array of concrete bullet strings, 3-8 items), qty (usually "1" or "Lump Sump"), unit_price_cents, amount_cents.
- All monetary values are integer CENTS (e.g. 34_000_000 for $340,000). Never use dollars.
- payment.total_cents MUST equal payment.labor_cost_cents + payment.materials_cost_cents.
- Sum of all tasks' amount_cents SHOULD roughly equal payment.total_cents but the server does not enforce this — just be realistic.
- New Jersey pricing benchmarks: gut renovation $200-300/sqft, second-story addition $250-500/sqft, kitchen remodel $30-80k, bathroom remodel $15-35k.
- Do NOT invent Sunvic contractor identity, license number, warranty text, permit text, insurance amounts, dispute-resolution steps, right-to-cancel wording, invoice-terms clause, or payment schedule — those fields are canonical and will be overwritten server-side.
- Do NOT invent homeowner details the prompt did not give. Leave missing fields as empty strings.
- Keep agreement_summary.text as plain conversational English. Never quote legal text there.`;

const INVOICE_SYSTEM = `You are Sunvic Contractors LLC's document assistant. You generate MILESTONE INVOICE payloads as strict JSON matching the target schema.

Return ONE JSON object. No prose, no markdown, no code fences.

REQUIRED STRUCTURE OVERVIEW:
- invoice_number      (string, e.g. "INV-2026-0003")
- invoice_date        (ISO date)
- due_date            (ISO date)
- contract_ref        (string, contract job number)
- milestone_label     (one of: "Deposit Payment", "Progress Payment (1)", "Progress Payment (2)", "Progress Payment (3)", "Progress Payment (4)", "Final Payment")
- milestone_condition (short due-clause phrase — see below)
- status              ("draft" | "sent" | "paid" | "overdue" | "void")
- bill_to             { client_name, property_address, recipient_email, recipient_phone }
- contract            { ref, total_cents }
- milestone           { percent, subtotal_cents, labor_portion_cents, materials_portion_cents }
- line_items[]        { desc, qty, rate_cents, amount_cents }
- prior_payments[]    { label, date, amount_cents }
- tax                 { rate_percent, applies_to: "materials_only"|"total"|"none", amount_cents }
- totals              { subtotal_cents, tax_cents, total_due_cents, remaining_after_cents }

MILESTONE PERCENTAGES (must match one exactly):
- Deposit Payment          15%  — "Due at contract signing"
- Progress Payment (1)     20%  — "Due upon foundation inspection approval"
- Progress Payment (2)     30%  — "Due upon MEP Rough-in inspection approval"
- Progress Payment (3)     15%  — "Due upon Insulation inspection approval"
- Progress Payment (4)     15%  — "Due at signing the final checklist"
- Final Payment            5%   — "Due at final Inspection approval"

MATH RULES:
- All monetary values are integer CENTS.
- milestone.subtotal_cents = round(contract.total_cents * milestone.percent / 100)
- milestone.labor_portion_cents ≈ 70% of subtotal, materials_portion_cents ≈ 30% (unless prompt says otherwise)
- Line items should reflect the actual work covered by the milestone. 3-6 line items typical.
- Sum of line_items[].amount_cents SHOULD equal milestone.subtotal_cents.
- New Jersey tax: rate_percent=${TAX.rate_percent}, applies_to="${TAX.applies_to}" is the default for construction unless the prompt says otherwise.
- tax.amount_cents = round(materials_portion_cents * rate_percent / 100) when applies_to="materials_only"
- totals.subtotal_cents = milestone.subtotal_cents
- totals.tax_cents = tax.amount_cents
- totals.total_due_cents = subtotal + tax
- totals.remaining_after_cents = contract.total_cents - sum(prior_payments) - totals.total_due_cents

DO NOT invent contractor identity, invoice terms clause, or payment methods list — those are canonical.
DO NOT fabricate bill_to details the prompt did not provide.
DO NOT fabricate prior payments the prompt did not describe. Leave prior_payments empty [] if the prompt has no info.
invoice_date defaults to today; due_date = invoice_date + 1 business day (per Sunvic terms) unless prompt says otherwise.`;

function schemaFor(template) {
  return template === 'contract' ? ContractPayloadSchema : InvoicePayloadSchema;
}
function defaultsFor(template, homeownerName) {
  return template === 'contract'
    ? defaultContractPayload({ homeownerName })
    : defaultInvoicePayload({ homeownerName });
}
function systemFor(template) {
  return template === 'contract' ? CONTRACT_SYSTEM : INVOICE_SYSTEM;
}

function extractJson(text) {
  if (!text) throw new Error('empty LLM response');
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const firstBrace = stripped.indexOf('{');
  const lastBrace  = stripped.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace < 0) throw new Error('no JSON object in response');
  return JSON.parse(stripped.slice(firstBrace, lastBrace + 1));
}

// Structural skeleton we hand the LLM so it doesn't have to invent shapes.
function structuralHint(chosenTemplate, defaults) {
  if (chosenTemplate === 'contract') {
    return {
      job_no: defaults.job_no,
      for_label: defaults.for_label,
      prepared_on: defaults.prepared_on,
      homeowner: defaults.homeowner,
      agreement_summary: { scope_recap: '<one plain-English paragraph, 2-4 sentences describing scope only>' },
      scope_of_work: {
        groups: [
          { category: 'Demolition & Foundation',
            tasks: [ { task: '<name>', description: ['<bullet1>', '<bullet2>'], qty: '1', unit_price_cents: 0, amount_cents: 0 } ] },
          { category: 'Exteriors', tasks: ['...same shape...'] },
          { category: 'Interiors', tasks: ['...same shape...'] },
          { category: 'MEP', tasks: ['...same shape...'] },
        ],
      },
      payment: {
        labor_cost_cents: 0,
        materials_cost_cents: 0,
        total_cents: 0,
      },
    };
  }
  return {
    invoice_number: defaults.invoice_number,
    invoice_date: defaults.invoice_date,
    due_date: defaults.due_date,
    contract_ref: '',
    milestone_label: '',
    milestone_condition: '',
    status: 'issued',
    bill_to: defaults.bill_to,
    contract: { ref: '', total_cents: 0 },
    milestone: { percent: 0, subtotal_cents: 0, labor_portion_cents: 0, materials_portion_cents: 0 },
    line_items: ['<3-6 items, each { desc, qty, rate_cents, amount_cents }>'],
    prior_payments: [],
    tax: { rate_percent: TAX.rate_percent, applies_to: TAX.applies_to, amount_cents: 0 },
    totals: { subtotal_cents: 0, tax_cents: 0, total_due_cents: 0, remaining_after_cents: 0 },
  };
}

/**
 * Generate a document payload from a natural-language prompt.
 */
export async function oneshot(args) {
  return _runOneshot(args);
}

export const generateOneshot = oneshot;

// Build the canonical-legal patch that is force-merged on top of any LLM output
// so the model can never corrupt the fixed legal/identity blocks.
function canonicalPatchFor(template, defaults, merged) {
  return {
    contractor: defaults.contractor,
    ...(template === 'contract' ? {
      warranties: defaults.warranties,
      permits: defaults.permits,
      insurance: defaults.insurance,
      dispute_resolution: defaults.dispute_resolution,
      right_to_cancel: defaults.right_to_cancel,
      material_selection: defaults.material_selection,
      change_orders: defaults.change_orders,
      unforeseen: defaults.unforeseen,
      invoice_terms: defaults.invoice_terms,
      signature: defaults.signature,
      // agreement_summary.text is canonical; scope_recap is the LLM's paragraph.
      agreement_summary: {
        text: defaults.agreement_summary.text,
        scope_recap: (merged?.agreement_summary && merged.agreement_summary.scope_recap) || '',
        weeks_to_start: merged?.agreement_summary?.weeks_to_start ?? defaults.agreement_summary.weeks_to_start,
        months_to_complete: merged?.agreement_summary?.months_to_complete ?? defaults.agreement_summary.months_to_complete,
      },
      payment: { ...(merged?.payment || {}), schedule: defaults.payment.schedule },
    } : {
      invoice_terms: defaults.invoice_terms,
      payment_methods: defaults.payment_methods,
    }),
  };
}

// Merge + canonical-patch + coerce + schema-parse an LLM candidate.
// Returns { ok, data } or { ok:false, error }.
function mergeAndValidate(template, defaults, schema, candidate) {
  const merged = deepMerge(defaults, candidate);
  const canonicalPatch = canonicalPatchFor(template, defaults, merged);
  const { out: safeMerged } = mergeWithLocks(merged, canonicalPatch, {});
  const repaired = coerceKnownFields(safeMerged, template);
  const parsed = schema.safeParse(repaired);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: parsed.error };
}

/**
 * Attempt generation with ONE provider+model. Two internal retries on invalid
 * JSON / schema failure (re-prompting with the errors). Throws a tagged Error on
 * provider/transport failure (so the chain can decide to fall back) and returns
 * { payload } on success. A schema failure after retries is NON-fallbackable
 * (our prompt/repair issue), so it throws a plain error.
 */
async function attemptWithProvider({ providerId, model, apiKey, template, defaults, schema, system, userPrompt }) {
  const provider = getProvider(providerId, { model, apiKey });
  let attempt = 0;
  let candidate = null;
  let lastZodError = null;
  let raw = null;
  let fullPromptForLLM = userPrompt;

  while (attempt < 2) {
    // Clamp requested output tokens to what this provider+model accepts (Bug E).
    const maxTokens = clampMaxTokens(8000, providerId, model);
    // provider.generate throws on transport/HTTP error → propagates to caller (chain).
    const { text, raw: rawResp } = await provider.generate({
      system,
      prompt: fullPromptForLLM,
      temperature: 0.2,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    });
    raw = rawResp;
    if (process.env.SUNVIC_DEBUG_LLM) {
      console.error('[oneshot debug]', providerId, model, 'attempt', attempt, 'finish=', rawResp?.choices?.[0]?.finish_reason, 'len=', (text || '').length);
    }
    try {
      candidate = extractJson(text);
    } catch (e) {
      lastZodError = e;
      fullPromptForLLM = `${userPrompt}\n\nPrevious attempt returned invalid JSON. Return ONLY a JSON object with no additional text.`;
      attempt++;
      continue;
    }
    const res = mergeAndValidate(template, defaults, schema, candidate);
    if (res.ok) {
      return { payload: res.data, provider: provider.id, raw };
    }
    lastZodError = res.error;
    fullPromptForLLM = [
      userPrompt,
      '',
      'Your previous JSON FAILED schema validation. Errors (first 10):',
      JSON.stringify(res.error.issues.slice(0, 10), null, 2),
      'Fix the errors and return the corrected JSON object.',
    ].join('\n');
    attempt++;
  }

  // Last-ditch: force a merge of whatever we have with defaults filling gaps.
  if (candidate) {
    const res = mergeAndValidate(template, defaults, schema, candidate);
    if (res.ok) return { payload: res.data, provider: provider.id, raw };
  }
  const err = new Error(`schema_validation_failed:${providerId}:${model || ''}`);
  err.zod = lastZodError;
  err.nonFallbackable = true; // our issue, not the provider's — but chain may still try others
  throw err;
}

/**
 * Generate a document payload from a natural-language prompt.
 *
 * Resilience model (this is the "executes end to end / production ready" core):
 *   1. Try the caller's chosen provider, then the shared fallback chain
 *      (capabilities.buildFallbackChain), skipping providers with no key.
 *   2. On a FALLBACKABLE provider error (429/5xx/402/quota/Cohere-422-hallucinated
 *      etc.) advance to the next candidate. On a schema failure, also advance.
 *   3. If EVERY provider fails, build the payload DETERMINISTICALLY from the
 *      gathered slots (compose.js) — a document is ALWAYS produced.
 *   4. ALWAYS run slot reconciliation (compose.reconcileWithSlots) on the final
 *      payload — LLM or deterministic — so Bug G (start_date / scope total) and
 *      Bug J (scope-sum === total) invariants hold on every path.
 *
 * @param {object} a
 * @param {string} a.prompt
 * @param {'contract'|'invoice'} [a.template]
 * @param {string} [a.providerId]
 * @param {string} [a.model]
 * @param {string} [a.homeownerName]
 * @param {string} a.userId
 * @param {object} [a.gatheredSlots] dot-path gathered_slots (drives reconciliation + backstop)
 * @param {object} [a.invoiceContext] { contractTotalCents, contractRef, billTo }
 */
async function _runOneshot({ prompt, template, providerId = 'cohere', model, homeownerName, userId, gatheredSlots = {}, invoiceContext = {} }) {
  if (!prompt || typeof prompt !== 'string') throw new Error('prompt required');

  const chosenTemplate = template || (await classifyTemplate(prompt, { providerId, userId }));
  const defaults = defaultsFor(chosenTemplate, homeownerName);
  const schema = schemaFor(chosenTemplate);
  const system = systemFor(chosenTemplate);

  const skeleton = structuralHint(chosenTemplate, defaults);
  const userPrompt = [
    `Generate a ${chosenTemplate} payload for the following request. Return ONLY the JSON object — no prose, no markdown.`,
    '',
    'REQUEST:',
    prompt.trim(),
    '',
    'STRUCTURAL SKELETON (fill in real values matching the schema):',
    JSON.stringify(skeleton, null, 2),
  ].join('\n');

  // Resolve keys up-front so we can filter the fallback chain to providers we can
  // actually call, and pass the right key to each provider.
  const keyCache = new Map();
  async function keyFor(pid) {
    if (keyCache.has(pid)) return keyCache.get(pid);
    let k = null;
    try { k = await resolveProviderKey(userId, pid); } catch { k = null; }
    keyCache.set(pid, k);
    return k;
  }
  // Pre-resolve keys for every provider that could appear in the chain.
  const candidateProviderIds = new Set([providerId, 'cohere', 'openrouter', 'gemma']);
  await Promise.all([...candidateProviderIds].map((pid) => keyFor(pid)));
  const hasKey = (pid) => !!keyCache.get(pid);

  const chain = buildFallbackChain({ providerId, model }, hasKey);

  let generated = null;   // { payload, provider, raw }
  let usedProvider = null;
  const failures = [];

  for (const cand of chain) {
    const apiKey = keyCache.get(cand.providerId);
    if (!apiKey) { failures.push(`${cand.providerId}:no_key`); continue; }
    try {
      const res = await attemptWithProvider({
        providerId: cand.providerId,
        model: cand.model,
        apiKey,
        template: chosenTemplate,
        defaults,
        schema,
        system,
        userPrompt,
      });
      generated = res;
      usedProvider = cand.providerId;
      break;
    } catch (e) {
      failures.push(`${cand.providerId}:${cand.model || ''}:${(e && e.message) || e}`);
      // Fallbackable provider error OR our schema failure → try next candidate.
      if (isFallbackableError(e) || e?.nonFallbackable) continue;
      // A genuinely non-retryable, non-schema error (e.g. plain 400 bad request
      // that isn't quota) — still try the deterministic backstop rather than
      // surfacing a hard failure, but record it.
      continue;
    }
  }

  // ── Deterministic backstop: every provider failed. Build from slots. ──
  let source = 'llm';
  if (!generated) {
    source = 'deterministic';
    const backstop = composeFromSlots(chosenTemplate, gatheredSlots, invoiceContext);
    // Fill any remaining gaps with defaults, then schema-validate.
    const merged = deepMerge(defaults, backstop);
    const canonicalPatch = canonicalPatchFor(chosenTemplate, defaults, merged);
    const { out: safeMerged } = mergeWithLocks(merged, canonicalPatch, {});
    const parsed = schema.safeParse(coerceKnownFields(safeMerged, chosenTemplate));
    if (!parsed.success) {
      throw new Error(`deterministic backstop failed schema validation: ${JSON.stringify(parsed.error.issues.slice(0, 5))} | provider_failures=${failures.join(' | ')}`);
    }
    generated = { payload: parsed.data, provider: 'deterministic', raw: null };
    usedProvider = 'deterministic';
  }

  // ── ALWAYS reconcile with gathered slots (Bug G + Bug J on every path) ──
  let finalPayload = reconcileWithSlots(chosenTemplate, generated.payload, gatheredSlots, invoiceContext);
  // Re-validate after reconciliation (reconciliation only sets schema-valid fields,
  // but validate to guarantee the contract with callers).
  const reparsed = schema.safeParse(finalPayload);
  if (reparsed.success) {
    finalPayload = reparsed.data;
  }

  const totalCents = chosenTemplate === 'contract'
    ? (finalPayload.payment?.total_cents || 0)
    : (finalPayload.totals?.total_due_cents || 0);

  return {
    template: chosenTemplate,
    payload: finalPayload,
    doc_number: null,
    client_name:  chosenTemplate === 'contract' ? finalPayload.homeowner?.name  : finalPayload.bill_to?.client_name,
    client_email: chosenTemplate === 'contract' ? finalPayload.homeowner?.email : finalPayload.bill_to?.recipient_email,
    total_cents: totalCents,
    locks: defaultLocksFor(chosenTemplate),
    provider: usedProvider,
    source,               // 'llm' | 'deterministic' — surfaced for observability
    provider_failures: failures,
    raw: generated.raw,
  };
}

// Coerce common LLM slip-ups into schema-compliant values BEFORE final parse.
// This is a last-mile repair, not a bypass — it only fixes documented equivalences.
function coerceKnownFields(payload, template) {
  const out = JSON.parse(JSON.stringify(payload)); // deep clone
  if (template === 'invoice') {
    // status: schema uses draft|sent|paid|overdue|void — LLM often emits "issued"
    if (out.status === 'issued') out.status = 'sent';
    if (out.status === 'unpaid') out.status = 'sent';
    if (out.status === 'due')    out.status = 'sent';
    // tax.applies_to: schema uses materials_only|total|none — LLM often emits "materials"
    if (out.tax?.applies_to === 'materials')   out.tax.applies_to = 'materials_only';
    if (out.tax?.applies_to === 'materials-only') out.tax.applies_to = 'materials_only';
  }
  return out;
}

function deepMerge(base, overlay) {
  if (Array.isArray(overlay)) return overlay;
  if (overlay === null || overlay === undefined) return base;
  if (typeof overlay !== 'object') return overlay;
  const out = Array.isArray(base) ? [...base] : { ...(base || {}) };
  for (const [k, v] of Object.entries(overlay)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof base?.[k] === 'object' && base[k] !== null) {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
