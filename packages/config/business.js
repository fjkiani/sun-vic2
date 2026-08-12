// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for business configuration.
//
// Historically the SUNVIC contractor identity (legal name, address, license,
// phone, email, website), the NJ tax rate, the insurance amount, and the
// right-to-cancel window were hardcoded in several places:
//   - packages/templates/legal.js  (SUNVIC_CONTRACTOR, INSURANCE_TEXT)
//   - packages/schema/documents.js (ContractorInfo defaults, tax.rate_percent)
//   - packages/templates/defaults.js (invoice tax.rate_percent)
//   - packages/agent/oneshot.js    (tax rate in prompt + skeleton)
//   - packages/agent/thread-agent.js (NJ pricing guidance)
//   - netlify/functions/document-email.js (footer license/phone)
//
// This module consolidates the STRUCTURED business constants into one place.
// Every value is overridable via an environment variable; when no env var is
// set the value is the canonical SUNVIC default, so output is byte-for-byte
// identical to the previous behavior. This is a single-contractor product, so
// this is intentionally a config module, not a multi-tenant data model.
//
// NOTE: the long-form legal PROSE in legal.js (warranty text, unforeseen-
// conditions text, etc.) contains the company name inline as legal boilerplate
// and is intentionally left verbatim — it is legal text, not configuration.
// ─────────────────────────────────────────────────────────────────────────────

function envStr(name, fallback) {
  const v = process.env[name];
  return (typeof v === 'string' && v.trim() !== '') ? v : fallback;
}
function envNum(name, fallback) {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ─── Contractor identity ─────────────────────────────────────────────────────
export const CONTRACTOR = Object.freeze({
  legal_name:     envStr('BUSINESS_LEGAL_NAME', 'SUNVIC CONTRACTORS LLC'),
  address:        envStr('BUSINESS_ADDRESS', '6 Stone Ridge Rd.- Old Bridge - NJ - 08857'),
  // Optional *override* for the compact one-line address in the page footer. It used to carry
  // its own default — a second, differently-punctuated spelling of the same street address —
  // which meant one document printed the company address two ways and only one of them was
  // editable. Empty by default: the footer now falls back to `address`, so there is exactly one
  // address to change. Set BUSINESS_ADDRESS_FOOTER only if the footer must genuinely differ.
  address_footer: envStr('BUSINESS_ADDRESS_FOOTER', ''),
  phone:          envStr('BUSINESS_PHONE', '+1 (732) 824-9203'),
  email:          envStr('BUSINESS_EMAIL', 'Contact@sunvicnj.com'),
  license_number: envStr('BUSINESS_LICENSE_NUMBER', '13VH12429600'),
  website:        envStr('BUSINESS_WEBSITE', 'www.sunvicnj.com'),
});

// Digits-only phone for tel: links, e.g. "+17328249203".
export const CONTRACTOR_PHONE_TEL = '+' + CONTRACTOR.phone.replace(/[^\d]/g, '');

// ─── Tax (New Jersey) ────────────────────────────────────────────────────────
// applies_to ∈ { 'materials_only', 'total', 'none' }
export const TAX = Object.freeze({
  rate_percent: envNum('BUSINESS_TAX_RATE_PERCENT', 6.625),
  applies_to:   envStr('BUSINESS_TAX_APPLIES_TO', 'materials_only'),
});

// ─── Insurance ───────────────────────────────────────────────────────────────
export const INSURANCE = Object.freeze({
  per_occurrence_cents: envNum('BUSINESS_INSURANCE_PER_OCCURRENCE_CENTS', 50000000), // $500,000
});
// Human-readable insurance amount, e.g. "$500,000".
export const INSURANCE_AMOUNT_LABEL =
  '$' + Math.round(INSURANCE.per_occurrence_cents / 100).toLocaleString('en-US');

// ─── Right-to-cancel window (NJ statutory 3 business days) ────────────────────
export const RIGHT_TO_CANCEL = Object.freeze({
  business_days: envNum('BUSINESS_RIGHT_TO_CANCEL_DAYS', 3),
});

// ─── Public site URL (used for email logo + links) ───────────────────────────
export const PUBLIC_SITE_URL = envStr('PUBLIC_SITE_URL', 'https://sunvicnj.com');

// Back-compat shape matching the old legal.js SUNVIC_CONTRACTOR export.
export const SUNVIC_CONTRACTOR = CONTRACTOR;

export default {
  CONTRACTOR,
  CONTRACTOR_PHONE_TEL,
  TAX,
  INSURANCE,
  INSURANCE_AMOUNT_LABEL,
  RIGHT_TO_CANCEL,
  PUBLIC_SITE_URL,
  SUNVIC_CONTRACTOR,
};
