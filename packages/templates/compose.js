// Deterministic document composer — the production BACKSTOP and MATH AUTHORITY.
//
// Purpose:
//   Given the gathered conversational slots (the same `gathered_slots` object the
//   thread agent maintains) + the canonical default payloads, build a
//   schema-valid contract/invoice payload with GUARANTEED-CORRECT math and NO
//   LLM required. This is what guarantees "executes end to end" even when every
//   LLM provider is rate-limited or down (empirically the current state of the
//   OpenRouter free tier).
//
// Two responsibilities:
//   1. compose{Contract,Invoice}FromSlots() — full deterministic build from
//      slots only (the backstop when no LLM output exists).
//   2. reconcile{Contract,Invoice}WithSlots() — force canonical, user-grounded
//      slot values + correct math ON TOP OF an LLM-produced payload. This is the
//      fix for Bug G (dropped start_date / zero scope total / scope-sum ≠ total)
//      and Bug J (proportional re-allocation across the selected scope
//      categories), and it runs for BOTH the LLM path and the backstop path so
//      the invariants always hold.
//
// Pure + dependency-light: imports only the canonical defaults/schema constants
// (no network, no db) so it is trivially unit-testable.
//
// Money is ALWAYS integer cents. Every function is deterministic.

import {
  defaultContractPayload,
  defaultInvoicePayload,
} from './defaults.js';
import { DEFAULT_PAYMENT_SCHEDULE } from './legal.js';
import { DEFAULT_SCOPE_QTY } from './defaults.js';

// ────────────────────────────────────────────────────────────
// Canonical constants (kept here so the composer is self-sufficient; W5 will
// re-point the identity/tax literals at packages/config/business.js — these
// values are the canonical SUNVIC defaults and must not drift).
// ────────────────────────────────────────────────────────────

const SCOPE_CATEGORIES = ['Demolition & Foundation', 'Exteriors', 'Interiors', 'MEP'];

// Default relative weighting used to distribute the contract total across the
// SELECTED scope categories when the user gave a budget but no per-category
// split. Weights are relative; only the selected subset is normalized (Bug J).
const CATEGORY_WEIGHT = {
  'Demolition & Foundation': 15,
  'Exteriors': 30,
  'Interiors': 40,
  'MEP': 15,
};

// One representative anchor task per category (deterministic, generic, honest —
// a single lump-sum line the homeowner can see, not fabricated line-item detail).
const CATEGORY_ANCHOR_TASK = {
  'Demolition & Foundation': {
    task: 'Demolition & Foundation',
    description: [
      'Site protection, selective demolition, and debris removal',
      'Excavation and foundation work per approved permit drawings',
    ],
  },
  'Exteriors': {
    task: 'Exteriors',
    description: [
      'Framing, roofing, siding, windows and exterior doors',
      'Weatherproofing and exterior finishes per approved drawings',
    ],
  },
  'Interiors': {
    task: 'Interiors',
    description: [
      'Drywall, insulation, painting, flooring and interior doors',
      'Kitchen, bathroom and finish carpentry per approved drawings',
    ],
  },
  'MEP': {
    task: 'MEP (Mechanical / Electrical / Plumbing)',
    description: [
      'Electrical panel, wiring, lighting, switches and outlets',
      'Plumbing rough-in and fixtures; HVAC / mechanical systems',
    ],
  },
};

// Milestone slot label → canonical schedule entry.
const MILESTONE_SLOT_TO_SCHEDULE = {
  'Deposit': DEFAULT_PAYMENT_SCHEDULE[0],       // 15% Due at contract signing
  'Progress 1': DEFAULT_PAYMENT_SCHEDULE[1],    // 20%
  'Progress 2': DEFAULT_PAYMENT_SCHEDULE[2],    // 30%
  'Progress 3': DEFAULT_PAYMENT_SCHEDULE[3],    // 15%
  'Progress 4': DEFAULT_PAYMENT_SCHEDULE[4],    // 15%
  'Final': DEFAULT_PAYMENT_SCHEDULE[5],         // 5%
};

// Contract payment.method slot values → schema enum (check|ach|card).
const PAYMENT_METHOD_MAP = {
  check: 'check',
  wire: 'ach',          // wire transfer → ACH bucket
  credit_card: 'card',
  card: 'card',
  ach: 'ach',
};

const LABOR_FRACTION = 0.7;      // 70% labor / 30% materials split (canonical assumption)
const MATERIALS_FRACTION = 0.3;

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Split a total (integer cents) into N integer-cent parts by weight, with the
 * remainder assigned to the LAST part so parts sum EXACTLY to total.
 * @param {number} totalCents
 * @param {number[]} weights
 * @returns {number[]} integer cents, sum === totalCents
 */
export function allocateByWeight(totalCents, weights) {
  const total = Math.round(num(totalCents));
  const w = weights.map((x) => Math.max(0, num(x)));
  const wsum = w.reduce((a, b) => a + b, 0);
  const n = w.length;
  if (n === 0) return [];
  if (total <= 0) return w.map(() => 0);
  if (wsum <= 0) {
    // even split with remainder on last
    const base = Math.floor(total / n);
    const parts = new Array(n).fill(base);
    parts[n - 1] += total - base * n;
    return parts;
  }
  const parts = w.map((x) => Math.floor((total * x) / wsum));
  const assigned = parts.reduce((a, b) => a + b, 0);
  parts[n - 1] += total - assigned; // remainder → last
  return parts;
}

/** Normalize the scope-categories slot to a subset of the 4 valid categories. */
function normalizeCategories(slotVal) {
  const arr = Array.isArray(slotVal) ? slotVal : (slotVal ? [slotVal] : []);
  const hits = arr
    .map((c) => SCOPE_CATEGORIES.find((v) => v.toLowerCase() === String(c).trim().toLowerCase()))
    .filter(Boolean);
  const uniq = [...new Set(hits)];
  // If nothing valid was provided, fall back to Interiors (most common single-scope job)
  return uniq.length ? uniq : ['Interiors'];
}

/** Map a contract start_date to substantial + final completion dates. */
function deriveTimelineDates(startDate, monthsToComplete) {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(startDate))) {
    return { start: startDate || null, substantial: null, final: null };
  }
  const months = num(monthsToComplete) || 6;
  const start = new Date(startDate + 'T00:00:00Z');
  const substantial = new Date(start);
  substantial.setUTCMonth(substantial.getUTCMonth() + months);
  const finalD = new Date(substantial);
  finalD.setUTCDate(finalD.getUTCDate() + 14); // 2-week punch-list buffer
  return {
    start: startDate,
    substantial: substantial.toISOString().slice(0, 10),
    final: finalD.toISOString().slice(0, 10),
  };
}

// ────────────────────────────────────────────────────────────
// CONTRACT
// ────────────────────────────────────────────────────────────

/**
 * Build scope groups for the selected categories, distributing `totalCents`
 * proportionally so the sum of task amounts === totalCents EXACTLY (Bug J).
 * @returns {{groups:Array, totalCents:number}}
 */
export function buildScopeGroups(categories, totalCents) {
  const cats = normalizeCategories(categories);
  const weights = cats.map((c) => CATEGORY_WEIGHT[c] ?? 25);
  const amounts = allocateByWeight(totalCents, weights);
  const groups = cats.map((cat, i) => {
    const anchor = CATEGORY_ANCHOR_TASK[cat] || { task: cat, description: [] };
    const amt = amounts[i];
    return {
      category: cat,
      tasks: [
        {
          task: anchor.task,
          description: [...anchor.description],
          qty: DEFAULT_SCOPE_QTY,
          unit_price_cents: amt,
          amount_cents: amt,
        },
      ],
    };
  });
  const sum = amounts.reduce((a, b) => a + b, 0);
  return { groups, totalCents: sum };
}

/**
 * Full deterministic contract payload from slots only (the backstop).
 * @param {object} slots gathered_slots (dot-path keys)
 * @param {object} [opts] { jobNo, forLabel }
 */
export function composeContractFromSlots(slots = {}, opts = {}) {
  const homeownerName = slots['homeowner.name'] || '';
  const base = defaultContractPayload({
    homeownerName,
    jobNo: opts.jobNo || '',
    forLabel: opts.forLabel || homeownerName || '',
  });
  return reconcileContractWithSlots(base, slots, opts);
}

/**
 * Force user-grounded slot values + correct math onto a (possibly LLM-built)
 * contract payload. Runs for both LLM + backstop paths.
 *
 * Fixes:
 *   - Bug G: map timeline.start_date (+ derive completion dates) from slot;
 *            set scope_of_work.total_cents; keep payment.total_cents authoritative.
 *   - Bug J: re-allocate scope task amounts across selected categories so their
 *            sum === payment.total_cents exactly.
 *   - payment.method: map slot value check/wire/credit_card → enum check/ach/card.
 *   - labor/materials split kept consistent with total (70/30 unless already set
 *            to a sane pair that sums to total).
 */
export function reconcileContractWithSlots(payload, slots = {}, opts = {}) {
  const out = payload ? JSON.parse(JSON.stringify(payload)) : {};

  // ── Identity / homeowner (user-grounded; slots win over LLM guesses) ──
  out.homeowner = out.homeowner || {};
  if (slots['homeowner.name']) out.homeowner.name = slots['homeowner.name'];
  if (slots['homeowner.address']) out.homeowner.address = slots['homeowner.address'];
  if (slots['homeowner.phone']) out.homeowner.phone = slots['homeowner.phone'];
  if (slots['homeowner.email']) out.homeowner.email = slots['homeowner.email'];
  if (out.homeowner.name && (!out.for_label || opts.forceForLabel)) {
    out.for_label = out.homeowner.name;
  }

  // ── Total authority: the user's budget slot is the contract total ──
  const budgetCents = num(slots['payment.total_cents']);
  out.payment = out.payment || {};
  let totalCents = budgetCents > 0
    ? budgetCents
    : num(out.payment.total_cents) || num(out.scope_of_work?.total_cents);
  totalCents = Math.round(totalCents);

  // ── Scope groups: re-allocate across the SELECTED categories (Bug J) ──
  // Deterministic path always rebuilds; LLM path is rebuilt only when its scope
  // is empty OR its task sum doesn't match the total (keeps LLM prose when valid).
  const categories = slots['scope_categories'];
  out.scope_of_work = out.scope_of_work || {};
  const existingGroups = Array.isArray(out.scope_of_work.groups) ? out.scope_of_work.groups : [];
  const existingSum = existingGroups.reduce(
    (s, g) => s + (g.tasks || []).reduce((ts, t) => ts + num(t.amount_cents), 0),
    0,
  );
  const needsRebuild =
    existingGroups.length === 0 ||
    (totalCents > 0 && existingSum !== totalCents) ||
    !!categories; // if user specified categories, ground scope in them

  if (needsRebuild && totalCents > 0) {
    const { groups, totalCents: scopeSum } = buildScopeGroups(categories, totalCents);
    out.scope_of_work.groups = groups;
    out.scope_of_work.total_cents = scopeSum;
    totalCents = scopeSum; // keep everything internally consistent
  } else {
    // keep existing groups, just fix the denormalized scope total
    out.scope_of_work.total_cents = existingSum || totalCents;
    if (existingSum > 0) totalCents = existingSum;
  }

  // ── Payment totals + labor/materials split (must sum to total) ──
  out.payment.total_cents = totalCents;
  const labor = num(out.payment.labor_cost_cents);
  const materials = num(out.payment.materials_cost_cents);
  const splitValid = labor > 0 && materials > 0 && labor + materials === totalCents;
  if (!splitValid) {
    out.payment.labor_cost_cents = Math.round(totalCents * LABOR_FRACTION);
    out.payment.materials_cost_cents = totalCents - out.payment.labor_cost_cents;
  }

  // ── Payment method slot → enum ──
  if (slots['payment.method']) {
    const mapped = PAYMENT_METHOD_MAP[String(slots['payment.method']).toLowerCase()];
    if (mapped) out.payment.method = mapped;
  }
  if (!['check', 'ach', 'card'].includes(out.payment.method)) out.payment.method = 'check';

  // ── Canonical payment schedule (percents/conditions are fixed) ──
  out.payment.schedule = DEFAULT_PAYMENT_SCHEDULE.map((m) => ({ ...m }));

  // ── Timeline (Bug G: map start_date + derive completion dates) ──
  out.timeline = out.timeline || {};
  const monthsToComplete =
    num(slots['agreement_summary.months_to_complete']) ||
    num(out.timeline.months_to_complete) || 6;
  const weeksToStart =
    num(slots['agreement_summary.weeks_to_start']) ||
    num(out.timeline.weeks_to_start) || 2;
  const startSlot = slots['timeline.start_date'] || out.timeline.start_date || null;
  const dates = deriveTimelineDates(startSlot, monthsToComplete);
  out.timeline.start_date = dates.start;
  if (dates.substantial) out.timeline.substantial_completion_date = dates.substantial;
  if (dates.final) out.timeline.final_completion_date = dates.final;
  out.timeline.months_to_complete = monthsToComplete;
  out.timeline.weeks_to_start = weeksToStart;

  // Keep the agreement_summary timing in sync with the timeline.
  out.agreement_summary = out.agreement_summary || {};
  out.agreement_summary.months_to_complete = monthsToComplete;
  out.agreement_summary.weeks_to_start = weeksToStart;

  return out;
}

// ────────────────────────────────────────────────────────────
// INVOICE
// ────────────────────────────────────────────────────────────

/**
 * Resolve the canonical milestone schedule entry for a milestone slot value.
 * Accepts slot labels ("Deposit", "Progress 2", "Final") and schedule labels
 * ("Deposit Payment", "Progress Payment (2)", ...).
 */
export function resolveMilestone(milestoneSlot) {
  if (!milestoneSlot) return null;
  const s = String(milestoneSlot).trim();
  if (MILESTONE_SLOT_TO_SCHEDULE[s]) return MILESTONE_SLOT_TO_SCHEDULE[s];
  // try schedule labels
  const bySchedule = DEFAULT_PAYMENT_SCHEDULE.find(
    (m) => m.milestone.toLowerCase() === s.toLowerCase(),
  );
  if (bySchedule) return bySchedule;
  // "Progress N"
  const pm = s.match(/progress\D*(\d)/i);
  if (pm) return MILESTONE_SLOT_TO_SCHEDULE[`Progress ${pm[1]}`] || null;
  if (/deposit/i.test(s)) return MILESTONE_SLOT_TO_SCHEDULE['Deposit'];
  if (/final/i.test(s)) return MILESTONE_SLOT_TO_SCHEDULE['Final'];
  return null;
}

/** Map a milestone slot label to the invoice's human milestone_label. */
function milestoneDisplayLabel(schedEntry) {
  return schedEntry ? schedEntry.milestone : '';
}

/**
 * Compute all invoice money from a contract total + milestone percent + tax
 * settings. Pure. Returns an object of integer-cent fields.
 * @param {object} p { contractTotalCents, percent, taxRatePercent, taxAppliesTo, priorPaymentsCents }
 */
export function computeInvoiceMath({
  contractTotalCents,
  percent,
  taxRatePercent = 6.625,
  taxAppliesTo = 'materials_only',
  priorPaymentsCents = 0,
}) {
  const total = Math.round(num(contractTotalCents));
  const pct = num(percent);
  const subtotal = Math.round((total * pct) / 100);
  const laborPortion = Math.round(subtotal * LABOR_FRACTION);
  const materialsPortion = subtotal - laborPortion;

  let taxBase = 0;
  if (taxAppliesTo === 'materials_only') taxBase = materialsPortion;
  else if (taxAppliesTo === 'total') taxBase = subtotal;
  else taxBase = 0; // 'none'
  const taxCents = Math.round((taxBase * num(taxRatePercent)) / 100);

  const totalDue = subtotal + taxCents;
  const remainingAfter = Math.max(0, total - num(priorPaymentsCents) - totalDue);

  return {
    subtotal_cents: subtotal,
    labor_portion_cents: laborPortion,
    materials_portion_cents: materialsPortion,
    tax_cents: taxCents,
    total_due_cents: totalDue,
    remaining_after_cents: remainingAfter,
  };
}

/**
 * Full deterministic invoice payload from slots + a resolved contract total.
 * @param {object} slots gathered_slots
 * @param {object} ctx { contractTotalCents, contractRef, billTo? , docNumber? }
 */
export function composeInvoiceFromSlots(slots = {}, ctx = {}) {
  const base = defaultInvoicePayload({ homeownerName: ctx?.billTo?.client_name || '' });
  return reconcileInvoiceWithSlots(base, slots, ctx);
}

/**
 * Force user-grounded slot values + correct milestone math onto a (possibly
 * LLM-built) invoice payload. Runs for both LLM + backstop paths.
 *
 * The invoice's milestone math is ANCHORED on the linked contract total
 * (ctx.contractTotalCents) — this closes the real gap where the agent path
 * never fed the linked contract total to the generator, so the LLM had to
 * guess. When a contract total is available it is authoritative.
 */
export function reconcileInvoiceWithSlots(payload, slots = {}, ctx = {}) {
  const out = payload ? JSON.parse(JSON.stringify(payload)) : {};

  // ── Milestone (canonical percent + condition) ──
  // Primary source is the gathered slot (real production path); ctx.milestone and
  // the payload's existing label are accepted as defensive fallbacks.
  const sched = resolveMilestone(slots['milestone_label'] || ctx.milestone || out.milestone_label);
  if (sched) {
    out.milestone_label = milestoneDisplayLabel(sched);
    out.milestone_condition = sched.condition;
  }
  const percent = sched ? sched.percent : num(out.milestone?.percent);

  // ── Contract reference + total (contract total is authoritative if provided) ──
  out.contract = out.contract || {};
  const contractTotal =
    num(ctx.contractTotalCents) > 0
      ? num(ctx.contractTotalCents)
      : num(out.contract.total_cents);
  out.contract.total_cents = Math.round(contractTotal);
  if (ctx.contractRef) {
    out.contract_ref = ctx.contractRef;
    out.contract.ref = ctx.contractRef;
  } else if (slots['linked_contract_id']) {
    out.contract_ref = slots['linked_contract_id'];
    out.contract.ref = slots['linked_contract_id'];
  }

  // ── bill_to (user-grounded) ──
  out.bill_to = out.bill_to || {};
  if (ctx.billTo) {
    out.bill_to.client_name = ctx.billTo.client_name ?? out.bill_to.client_name;
    out.bill_to.property_address = ctx.billTo.property_address ?? out.bill_to.property_address;
    out.bill_to.recipient_email = ctx.billTo.recipient_email ?? out.bill_to.recipient_email;
    out.bill_to.recipient_phone = ctx.billTo.recipient_phone ?? out.bill_to.recipient_phone;
  }
  if (slots['bill_to.recipient_email']) out.bill_to.recipient_email = slots['bill_to.recipient_email'];

  // ── Dates ──
  if (slots['invoice_date']) out.invoice_date = slots['invoice_date'];
  if (slots['due_date']) out.due_date = slots['due_date'];

  // ── Tax settings (canonical NJ default unless payload overrides) ──
  out.tax = out.tax || {};
  const taxRate = num(out.tax.rate_percent) || 6.625;
  const taxAppliesTo = out.tax.applies_to || 'materials_only';
  out.tax.rate_percent = taxRate;
  out.tax.applies_to = taxAppliesTo;

  // ── Prior payments (sum) ──
  const priorSum = (Array.isArray(out.prior_payments) ? out.prior_payments : [])
    .reduce((s, p) => s + num(p.amount_cents), 0);

  // ── Compute all money deterministically (Bug K/L/G math authority) ──
  const math = computeInvoiceMath({
    contractTotalCents: out.contract.total_cents,
    percent,
    taxRatePercent: taxRate,
    taxAppliesTo,
    priorPaymentsCents: priorSum,
  });

  out.milestone = out.milestone || {};
  out.milestone.percent = percent;
  out.milestone.subtotal_cents = math.subtotal_cents;
  out.milestone.labor_portion_cents = math.labor_portion_cents;
  out.milestone.materials_portion_cents = math.materials_portion_cents;

  out.tax.amount_cents = math.tax_cents;

  out.totals = out.totals || {};
  out.totals.subtotal_cents = math.subtotal_cents;
  out.totals.tax_cents = math.tax_cents;
  out.totals.total_due_cents = math.total_due_cents;
  out.totals.remaining_after_cents = math.remaining_after_cents;

  // ── Line items: ensure at least one honest line summarizing the milestone,
  //    and make line-item amounts sum to the subtotal (no fabricated detail). ──
  const li = Array.isArray(out.line_items) ? out.line_items.filter((x) => x && x.desc) : [];
  const liSum = li.reduce((s, x) => s + num(x.amount_cents), 0);
  if (li.length === 0 || liSum !== math.subtotal_cents) {
    out.line_items = [
      {
        desc: `${out.milestone_label || 'Milestone'} — ${percent}% of contract value` +
          (out.contract_ref ? ` (${out.contract_ref})` : ''),
        qty: 1,
        rate_cents: math.subtotal_cents,
        amount_cents: math.subtotal_cents,
      },
    ];
  }

  // ── Status coercion (schema enum) ──
  if (out.status === 'issued' || out.status === 'unpaid' || out.status === 'due') out.status = 'sent';
  if (!['draft', 'sent', 'paid', 'overdue', 'void'].includes(out.status)) out.status = 'draft';

  return out;
}

// ────────────────────────────────────────────────────────────
// Unified entry points
// ────────────────────────────────────────────────────────────

/** Deterministic backstop: full payload from slots only. */
export function composeFromSlots(template, slots, ctx = {}) {
  return template === 'invoice'
    ? composeInvoiceFromSlots(slots, ctx)
    : composeContractFromSlots(slots, ctx);
}

/** Reconciliation: force slot values + correct math onto any payload. */
export function reconcileWithSlots(template, payload, slots, ctx = {}) {
  return template === 'invoice'
    ? reconcileInvoiceWithSlots(payload, slots, ctx)
    : reconcileContractWithSlots(payload, slots, ctx);
}
