// One-shot generator: user prompt → full document payload.
// - Runs classifier to decide contract vs invoice
// - Builds a template-specific system prompt with strict JSON schema
// - Retries once on Zod validation failure with the errors appended
// - Merges the LLM output over defaults + re-applies locked fields on top (defense in depth)

import { getProvider } from './providers/index.js';
import { classifyTemplate } from './classifier.js';
import {
  defaultContractPayload,
  defaultInvoicePayload,
  defaultLocksFor,
} from '../templates/defaults.js';
import { ContractPayload as ContractPayloadSchema, InvoicePayload as InvoicePayloadSchema } from '../schema/documents.js';
import { mergeWithLocks } from '../../netlify/functions/_shared/locks.js';
import { totalDollarsForInvoice, totalDollarsForContract } from '../../netlify/functions/_shared/totals.js';

const CONTRACT_SYSTEM = `You are Sunvic Construction's document assistant. You generate NEW JERSEY home-improvement CONTRACT payloads as strict JSON.
You MUST return a single JSON object that matches the target schema exactly. Do not add prose, markdown, or explanations.

Rules:
- Include realistic, itemized phases with items[{desc, details?, qty, rate}] that reflect the scope described.
- Use \`sqft\` per phase when the prompt describes square-footage scope.
- payment.schedule must be a 5-milestone breakdown that sums to 100 (default 10 / 30 / 30 / 25 / 5).
- Do NOT invent Sunvic contractor details, licensing, warranty/permit/insurance/dispute/right-to-cancel text — those fields will be overwritten by canonical legal blocks.
- Use realistic New Jersey pricing (home addition $176-$328/sqft, gut renovation $200+/sqft, second-story $200-$500/sqft) when the prompt gives sqft cues.
- If the prompt does not specify homeowner details, leave them null/empty — do NOT fabricate.
- Set timeline dates only when the prompt gives cues. Otherwise leave null.
- \`agreement_summary\` is a 1-2 sentence plain-English recap of the scope. Never quote legal text there.`;

const INVOICE_SYSTEM = `You are Sunvic Construction's document assistant. You generate INVOICE payloads as strict JSON.
You MUST return a single JSON object that matches the target schema exactly. Do not add prose, markdown, or explanations.

Rules:
- phases[] is a list of billing sections; each has items[{desc, details?, qty, rate}].
- Compute nothing yourself — the server will re-total. Just fill the phase/item structure.
- Use realistic New Jersey pricing when the prompt gives cues.
- Never fabricate Sunvic contractor details — those are canonical and will be overwritten.
- If bill_to details are missing from the prompt, leave client_name/address/email null.
- Set invoice_date to today unless the prompt says otherwise. due_date = 15 days later unless the prompt says otherwise.
- tax_rate_percent defaults to 0 unless the prompt requests tax.
- include_cost_analysis defaults to true when the scope is large ($20k+ or renovations); false otherwise.`;

function schemaFor(template) {
  return template === 'contract' ? ContractPayloadSchema : InvoicePayloadSchema;
}

function defaultsFor(template) {
  return template === 'contract' ? defaultContractPayload() : defaultInvoicePayload();
}

function systemFor(template) {
  return template === 'contract' ? CONTRACT_SYSTEM : INVOICE_SYSTEM;
}

function extractJson(text) {
  if (!text) throw new Error('empty LLM response');
  // Strip code fences if present.
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  // Prefer the largest balanced JSON object.
  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace < 0) throw new Error('no JSON object in response');
  return JSON.parse(stripped.slice(firstBrace, lastBrace + 1));
}

/**
 * @param {object} args
 * @param {string} args.prompt
 * @param {'contract'|'invoice'|undefined} [args.template]
 * @param {string} [args.providerId]
 * @param {string} [args.model]
 * @returns {Promise<{template, payload, doc_number, client_name, client_email, total_cents, locks, provider}>}
 */
export async function oneshot({ prompt, template, providerId = 'cohere', model }) {
  return _runOneshot({ prompt, template, providerId, model });
}

// Alias for pre-existing callers that import `generateOneshot`.
export const generateOneshot = oneshot;

async function _runOneshot({ prompt, template, providerId = 'cohere', model }) {
  if (!prompt || typeof prompt !== 'string') throw new Error('prompt required');

  const chosenTemplate = template || (await classifyTemplate(prompt, { providerId }));
  const provider = getProvider(providerId, { model });
  const defaults = defaultsFor(chosenTemplate);
  const schema = schemaFor(chosenTemplate);
  const system = systemFor(chosenTemplate);

  const userPrompt = [
    `Generate a ${chosenTemplate} payload for the following request. Return ONLY JSON.`,
    '',
    'REQUEST:',
    prompt.trim(),
    '',
    'DEFAULT PAYLOAD (for structure reference — you may override any non-legal field):',
    JSON.stringify(chosenTemplate === 'contract'
      ? { ...defaults, warranties: undefined, permits: undefined, insurance: undefined, dispute_resolution: undefined, right_to_cancel: undefined, contractor: undefined }
      : { ...defaults, contractor: undefined },
    null, 2),
  ].join('\n');

  let attempt = 0;
  let candidate = null;
  let lastError = null;
  let fullPromptForLLM = userPrompt;

  while (attempt < 2) {
    const { text } = await provider.generate({
      system,
      prompt: fullPromptForLLM,
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    });
    try {
      candidate = extractJson(text);
    } catch (e) {
      lastError = e;
      fullPromptForLLM = `${userPrompt}\n\nPrevious attempt returned invalid JSON. Return ONLY a JSON object.`;
      attempt++;
      continue;
    }

    // Merge over defaults, but let the LLM's values override where present.
    const merged = deepMerge(defaults, candidate);
    // Re-apply canonical legal + contractor blocks on top so the LLM cannot corrupt them.
    // We use mergeWithLocks with empty locks so it acts as a plain deep-merge; enforcement
    // of the locks against future user/agent edits happens elsewhere (document.js PATCH, tools.js).
    const canonicalPatch = {
      contractor: defaults.contractor,
      ...(chosenTemplate === 'contract' ? {
        warranties: defaults.warranties,
        permits: defaults.permits,
        insurance: defaults.insurance,
        dispute_resolution: defaults.dispute_resolution,
        right_to_cancel: defaults.right_to_cancel,
      } : {}),
    };
    const { out: safeMerged } = mergeWithLocks(merged, canonicalPatch, {});

    const parsed = schema.safeParse(safeMerged);
    if (parsed.success) {
      candidate = parsed.data;
      lastError = null;
      break;
    }
    lastError = parsed.error;
    fullPromptForLLM = [
      userPrompt,
      '',
      'Your previous JSON FAILED schema validation. Errors:',
      JSON.stringify(parsed.error.issues.slice(0, 8), null, 2),
      'Fix the errors and return the full JSON again.',
    ].join('\n');
    attempt++;
  }

  if (lastError && !candidate) {
    throw new Error(`oneshot generation failed after 2 attempts: ${lastError.message || lastError}`);
  }

  // Compute totals now so callers get authoritative numbers.
  const totalDollars = chosenTemplate === 'contract'
    ? totalDollarsForContract(candidate)
    : totalDollarsForInvoice(candidate);

  return {
    template: chosenTemplate,
    payload: candidate,
    doc_number: null, // assigned by DB on insert
    client_name:  chosenTemplate === 'contract' ? candidate.homeowner?.name  : candidate.bill_to?.client_name,
    client_email: chosenTemplate === 'contract' ? candidate.homeowner?.email : candidate.bill_to?.recipient_email,
    total_cents: Math.round(totalDollars * 100),
    locks: defaultLocksFor(chosenTemplate),
    provider: provider.id,
  };
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
