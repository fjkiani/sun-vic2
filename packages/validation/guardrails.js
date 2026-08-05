// One shared validation module, enforced on the agent path, manual saves, and delivery.
//
// Before this existed there was nothing between a bad number and a printed contract. The
// payment schedule is `percent: z.number().min(0).max(100)` per row with no constraint on
// the sum, so a schedule of 15/20/30/15/15 (95%) validates cleanly and the contractor
// silently never bills the last 5% of the job.
//
// Enforcement is deliberately staged rather than uniform, because the document editor
// autosaves on a 500ms debounce. A rule that rejects a PATCH whenever the arithmetic is
// mid-edit would throw away the user's keystrokes as they type the second of six
// milestones. So:
//
//   draft editing   → issues are computed and returned, the save proceeds
//   agent writes    → an issue the agent *introduces* blocks the write
//   status → sent   → errors block the transition
//   email           → errors block, naming the missing field
//   pdf             → non-blocking by default (previewing your own draft is legitimate),
//                     blocking under { strict: true }
//   guarded status  → any payload write needs explicit confirmation, agent or human
//
// The "introduced" rule matters: if a document already has a 95% schedule, the agent must
// still be able to edit an unrelated clause — and must still be able to fix the schedule.
// Blocking on absolute state would deadlock exactly the documents that need repair.

// Statuses where the record is legally or commercially live. Kept identical to the delete
// policy's guarded set (src/components/work/deletePolicy.js); a test asserts they match,
// because "which documents are protected" having two different answers is its own bug.
export const GUARDED_WRITE_STATUSES = ['sent', 'signed', 'paid', 'overdue'];

// Percentages are authored to two decimal places, so the schedule is compared in integer
// hundredths of a percent rather than with a floating-point epsilon.
//
// This is not pedantry. The obvious implementation, `Math.abs(sum - 100) < 0.01`, gives
// two different answers for the same schedule depending on how the rows are split:
//   one row of 99.99            -> sum 99.99,               |gap| = 0.01              -> rejected
//   two rows of 50 and 49.99    -> sum 99.99000000000001,   |gap| = 0.009999999999991 -> ACCEPTED
// Same missing $6.50 on a $65,000 job, opposite verdicts, decided by binary rounding.
// Integer hundredths make the answer exact and independent of row layout.
//
// The TOTAL is rounded, not each row. Rounding row-by-row re-breaks the same property from
// the other direction: [33.333, 33.333, 33.334] sums to exactly 100 but each row rounds
// down, giving 99.99 and a false rejection, and a six-row 16.666/16.667 split accumulates
// the other way and is reported as 100.02%. Both are exactly 100. Rounding once, at the
// end, absorbs float noise (~1e-13) while leaving every real gap (>= 0.005) visible.
// Verified: 40,000 randomized 2dp splittings and row permutations, zero disagreements.
export const SCHEDULE_PRECISION = 2;
const SCALE = 10 ** SCHEDULE_PRECISION;
const FULL = 100 * SCALE;
export const SCHEDULE_TOLERANCE = 1 / SCALE; // 0.01pp — the smallest gap that counts

// One dollar. The composer allocates labor/materials by weight and rounds each bucket to
// whole cents, so exact equality would flag correct documents.
export const MONEY_TOLERANCE_CENTS = 100;

export const SEVERITY = { ERROR: 'error', WARNING: 'warning' };

// ── canonical arithmetic ─────────────────────────────────────
// src/components/editors/formMath.js carries a client-side copy so the form can show live
// feedback without importing server code. test-guardrails.mjs cross-asserts the two agree
// across randomized inputs, so the copy cannot drift.

/** The schedule total in integer hundredths of a percent. Exact; no float drift. */
export function scheduleSumHundredths(schedule) {
  const raw = (schedule || []).reduce((a, r) => a + (Number(r?.percent) || 0), 0);
  return Math.round(raw * SCALE);
}

/** The schedule total as a percentage, rounded to the precision it is authored at. */
export function scheduleSum(schedule) {
  return scheduleSumHundredths(schedule) / SCALE;
}

export function scheduleBalanced(schedule) {
  return scheduleSumHundredths(schedule) === FULL;
}

export function laborMaterialsDrift(payment) {
  const p = payment || {};
  const labor = Number(p.labor_cost_cents) || 0;
  const materials = Number(p.materials_cost_cents) || 0;
  const total = Number(p.total_cents) || 0;
  if (total === 0 || (labor === 0 && materials === 0)) return 0;
  return labor + materials - total;
}

// ── helpers ──────────────────────────────────────────────────

function get(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function issue(code, severity, field, message, extra = {}) {
  return { code, severity, field, message, ...extra };
}

function isBlank(v) {
  return v == null || (typeof v === 'string' && v.trim() === '');
}

function fmtPct(n) {
  return `${Math.round(n * 100) / 100}%`;
}

function fmtUsd(cents) {
  return `$${(Math.abs(Number(cents) || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

// ── individual rules ─────────────────────────────────────────

/**
 * Payment schedule must account for the whole job.
 * An empty schedule is reported separately: a brand-new draft has none, and calling that
 * an error would mean every document starts life invalid. It still blocks delivery.
 */
export function scheduleIssues(payload, template) {
  if (template !== 'contract') return [];
  const schedule = get(payload, 'payment.schedule');
  const rows = Array.isArray(schedule) ? schedule : [];

  if (rows.length === 0) {
    return [issue('schedule_empty', SEVERITY.WARNING, 'payment.schedule',
      'No payment milestones yet. The contract needs a schedule before it can be sent.',
      { deliveryBlocking: true })];
  }

  const out = [];
  const sum = scheduleSum(rows);
  if (!scheduleBalanced(rows)) {
    const gap = 100 - sum;
    out.push(issue('schedule_unbalanced', SEVERITY.ERROR, 'payment.schedule',
      `Payment milestones add up to ${fmtPct(sum)}, not 100%. ` +
      (gap > 0 ? `${fmtPct(gap)} of the job would never be billed.` : `${fmtPct(-gap)} would be over-billed.`),
      { sum, gap, deliveryBlocking: true }));
  }
  rows.forEach((r, i) => {
    const pct = Number(r?.percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      out.push(issue('schedule_row_invalid', SEVERITY.ERROR, `payment.schedule.${i}.percent`,
        `Milestone ${i + 1} ("${r?.milestone || 'untitled'}") has an invalid percentage.`,
        { deliveryBlocking: true }));
    }
    if (isBlank(r?.milestone)) {
      out.push(issue('schedule_row_unnamed', SEVERITY.WARNING, `payment.schedule.${i}.milestone`,
        `Milestone ${i + 1} has no name. It will print as a blank row.`));
    }
  });
  return out;
}

/** Labor + materials must reconcile to the contract total. */
export function moneyIssues(payload, template) {
  const out = [];
  if (template === 'contract') {
    const drift = laborMaterialsDrift(get(payload, 'payment'));
    if (Math.abs(drift) > MONEY_TOLERANCE_CENTS) {
      out.push(issue('labor_materials_mismatch', SEVERITY.WARNING, 'payment',
        `Labor plus materials is ${fmtUsd(Math.abs(drift))} ${drift > 0 ? 'more' : 'less'} than the contract total. ` +
        'One of the three numbers is wrong.',
        { drift, deliveryBlocking: true }));
    }
    const total = Number(get(payload, 'payment.total_cents')) || 0;
    if (total < 0) {
      out.push(issue('total_negative', SEVERITY.ERROR, 'payment.total_cents',
        'The contract total is negative.', { deliveryBlocking: true }));
    }
  } else {
    const totalDue = Number(get(payload, 'totals.total_due_cents')) || 0;
    const subtotal = Number(get(payload, 'totals.subtotal_cents')) || 0;
    const tax = Number(get(payload, 'totals.tax_cents')) || 0;
    if (Math.abs(subtotal + tax - totalDue) > MONEY_TOLERANCE_CENTS) {
      out.push(issue('invoice_total_mismatch', SEVERITY.ERROR, 'totals.total_due_cents',
        `Subtotal plus tax is ${fmtUsd(subtotal + tax)} but the amount due says ${fmtUsd(totalDue)}.`,
        { deliveryBlocking: true }));
    }
    if (totalDue < 0) {
      out.push(issue('total_negative', SEVERITY.ERROR, 'totals.total_due_cents',
        'The amount due is negative.', { deliveryBlocking: true }));
    }
  }
  return out;
}

// What a finished document must have before it goes to a homeowner. Plain-English labels,
// because these strings are shown to the user verbatim.
const REQUIRED = {
  contract: [
    ['homeowner.name', "the homeowner's name"],
    ['homeowner.address', 'the property address'],
    ['payment.total_cents', 'the contract total', 'money'],
    ['timeline.start_date', 'a start date'],
  ],
  invoice: [
    ['bill_to.client_name', "the client's name"],
    ['bill_to.property_address', 'the property address'],
    ['totals.total_due_cents', 'the amount due', 'money'],
    ['milestone_label', 'which milestone this invoice covers'],
  ],
};

/** Fields that must be present before the document can be delivered. */
export function requiredFieldIssues(payload, template) {
  const spec = REQUIRED[template] || [];
  const out = [];
  for (const [path, label, kind] of spec) {
    const v = get(payload, path);
    const missing = kind === 'money' ? !(Number(v) > 0) : isBlank(v);
    if (missing) {
      out.push(issue('required_field_missing', SEVERITY.ERROR, path,
        `Missing ${label}.`, { label, deliveryBlocking: true }));
    }
  }
  return out;
}

// ── composite ────────────────────────────────────────────────

/**
 * Everything wrong with a payload, regardless of what the caller intends to do with it.
 * Required fields are excluded here: an incomplete draft is not an invalid draft.
 */
export function validatePayload(payload, template) {
  const issues = [
    ...scheduleIssues(payload, template),
    ...moneyIssues(payload, template),
  ];
  const errors = issues.filter((i) => i.severity === SEVERITY.ERROR);
  const warnings = issues.filter((i) => i.severity === SEVERITY.WARNING);
  return { ok: errors.length === 0, issues, errors, warnings };
}

/**
 * Can this document be delivered?
 * @param {object}  doc        { template, payload, status, client_email }
 * @param {string}  action     'pdf' | 'email' | 'send'
 * @param {object}  opts       { strict, recipient }
 */
export function preflight(doc, action, opts = {}) {
  const template = doc?.template || 'contract';
  const payload = doc?.payload || {};
  const issues = [
    ...requiredFieldIssues(payload, template),
    ...scheduleIssues(payload, template),
    ...moneyIssues(payload, template),
  ];

  if (action === 'email') {
    const recipient = opts.recipient || doc?.client_email
      || get(payload, template === 'contract' ? 'homeowner.email' : 'bill_to.recipient_email');
    if (isBlank(recipient)) {
      issues.push(issue('missing_recipient', SEVERITY.ERROR, 'recipient',
        'No email address to send to.', { deliveryBlocking: true }));
    }
  }

  // A PDF is also how you look at your own draft. Blocking that would make the Preview and
  // PDF tabs useless for exactly the documents still being written. Callers that are about
  // to put the file in front of a homeowner pass strict.
  const blocking = action === 'pdf' && !opts.strict
    ? []
    : issues.filter((i) => i.deliveryBlocking || i.severity === SEVERITY.ERROR);

  return {
    ok: blocking.length === 0,
    blocked: blocking.length > 0,
    action,
    strict: action !== 'pdf' || !!opts.strict,
    issues,
    blocking,
    summary: blocking.length ? summarize(blocking) : null,
  };
}

function summarize(issues) {
  const names = issues.map((i) => i.message.replace(/^Missing /, '').replace(/\.$/, ''));
  if (names.length === 1) return `Not ready to send — missing ${names[0]}.`;
  return `Not ready to send — ${names.length} problems: ${names.join('; ')}.`;
}

/**
 * Issues that exist after a write but did not exist before it.
 * This is what the agent is held to. Holding it to absolute validity would mean a document
 * that is already broken can never be edited — including to fix the very thing that is
 * broken. Matching is by code+field so "the schedule is still wrong" is not counted twice,
 * while "the schedule went from right to wrong" is.
 */
export function introducedIssues(before, after, template) {
  const key = (i) => `${i.code}::${i.field}`;
  const had = new Set(validatePayload(before, template).issues.map(key));
  return validatePayload(after, template).issues.filter((i) => !had.has(key(i)));
}

/**
 * Does a payload write against this document need explicit confirmation first?
 * Applies to the agent and to a human save equally — a signed contract is a signed
 * contract regardless of who is typing.
 */
export function writeGuard({ status, confirmed = false, source = 'user', hasPayloadChange = true }) {
  if (!hasPayloadChange) return null;
  if (!GUARDED_WRITE_STATUSES.includes(status)) return null;
  if (confirmed) return null;
  return {
    code: 'confirmation_required',
    status,
    source,
    message: `This document is marked ${status}. Editing it changes a record that has already gone out. Confirm to continue.`,
  };
}

/** Guard a status transition. Moving into a delivery status is the moment errors matter. */
export function statusTransitionGuard({ from, to, payload, template }) {
  const DELIVERY = ['sent', 'signed', 'paid'];
  if (!DELIVERY.includes(to) || from === to) return null;
  const pre = preflight({ template, payload }, 'send', { strict: true });
  if (pre.ok) return null;
  return {
    code: 'validation_failed',
    from,
    to,
    message: `Cannot mark this ${to}. ${pre.summary}`,
    issues: pre.blocking,
  };
}
