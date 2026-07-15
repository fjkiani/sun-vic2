// Template-driven slot definitions for the thread agent.
//
// Each slot describes:
//   key       — dot-path used by the payload projector
//   label     — short human name shown in the "asking" pill
//   question  — canonical question the agent asks (LLM never composes this)
//   hint      — optional short example shown under the question
//   required  — must be filled before generate_document is legal
//   type      — 'string' | 'address' | 'money' | 'date' | 'int' | 'enum' | 'multi-enum' | 'doc-ref' | 'email' | 'phone'
//   options   — for enum / multi-enum
//   extract   — pure-JS function that tries to pull the value out of a user
//               message (returns the parsed value, or null when unsure)
//
// The extractor pipeline is DELIBERATELY conservative — false negatives are
// fine (agent will just ask), false positives are damaging (wrong data on
// contracts). Prefer null when a match is ambiguous.

const SCOPE_OPTIONS = ['Demolition & Foundation', 'Exteriors', 'Interiors', 'MEP'];

const MILESTONE_OPTIONS = ['Deposit', 'Progress 1', 'Progress 2', 'Progress 3', 'Progress 4', 'Final'];

const PAYMENT_METHOD_OPTIONS = ['check', 'wire', 'credit_card'];

// ─── Extractors ──────────────────────────────────────────

// Homeowner name. Look for "for X", "homeowner X", "client X", "customer X".
// Only accepts 1-4 capitalized words in a row.
function extractHomeownerName(msg) {
  if (!msg) return null;
  const patterns = [
    /\b(?:for|homeowner(?:s)?|client|customer)\s+((?:(?:the\s+)?[A-Z][a-z'’]+(?:\s+(?:and|&)\s+[A-Z][a-z'’]+)?(?:\s+[A-Z][a-z'’]+){0,2}))/,
    /\b((?:[A-Z][a-z'’]+\s+){1,2}[A-Z][a-z'’]+)\s+(?:at|on|of|in)\s+\d/,
  ];
  for (const p of patterns) {
    const m = msg.match(p);
    if (m) {
      let name = m[1].trim().replace(/^the\s+/i, '');
      // Guard: don't accept generic role words alone.
      if (/^(?:the\s+)?(?:homeowner|client|customer|owner)s?$/i.test(name)) continue;
      return name.slice(0, 200);
    }
  }
  return null;
}

// Street address heuristic — needs a number + street name.
function extractAddress(msg) {
  if (!msg) return null;
  // e.g. "123 Oak St", "665 Denver Blvd", "1247 W 5th Avenue"
  const m = msg.match(/\b(\d{1,6}\s+(?:[NSEW]\.?\s+)?[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,4}\s+(?:Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Court|Ct\.?|Way|Place|Pl\.?|Terrace|Ter\.?|Circle|Cir\.?|Highway|Hwy\.?|Route|Rte\.?))\b/i);
  return m ? m[1].trim() : null;
}

// Money: "$65,000", "65k", "$65k", "sixty-five thousand". Returns integer CENTS.
function extractMoney(msg) {
  if (!msg) return null;
  // $65,000 or $65k
  const m1 = msg.match(/\$\s*([\d,]+(?:\.\d+)?)\s*([kK])?\b/);
  if (m1) {
    const num = parseFloat(m1[1].replace(/,/g, ''));
    if (!isNaN(num)) {
      const dollars = m1[2] ? num * 1000 : num;
      return Math.round(dollars * 100);
    }
  }
  // "65k" without $
  const m2 = msg.match(/\b(\d{1,4}(?:\.\d+)?)\s*k\b/i);
  if (m2) {
    const num = parseFloat(m2[1]);
    if (!isNaN(num)) return Math.round(num * 1000 * 100);
  }
  // "budget 65000" / "budget of 65000" — bare number after budget keyword
  const m3 = msg.match(/\bbudget(?:\s+of|\s+is|\s*[:=])?\s+\$?([\d,]+)\b/i);
  if (m3) {
    const num = parseFloat(m3[1].replace(/,/g, ''));
    if (!isNaN(num) && num >= 1000) return Math.round(num * 100);
  }
  return null;
}

// Date: ISO, "July 15th", "next month", "in 2 weeks".
function extractDate(msg) {
  if (!msg) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // ISO YYYY-MM-DD
  const iso = msg.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  // Month DDth, YYYY? — use current year if none
  const monthMap = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
  };
  const named = msg.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i);
  if (named) {
    const mo = monthMap[named[1].toLowerCase()];
    const day = parseInt(named[2], 10);
    let year = named[3] ? parseInt(named[3], 10) : today.getFullYear();
    if (mo != null && day >= 1 && day <= 31) {
      // If the date already passed this year and no year specified, roll to next year.
      let d = new Date(year, mo, day);
      if (!named[3] && d < today) d = new Date(year + 1, mo, day);
      return d.toISOString().slice(0, 10);
    }
  }
  // "next month"
  if (/\bnext\s+month\b/i.test(msg)) {
    const d = new Date(today);
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  }
  // "in N weeks"
  const nw = msg.match(/\bin\s+(\d{1,2})\s+weeks?\b/i);
  if (nw) {
    const d = new Date(today);
    d.setDate(d.getDate() + parseInt(nw[1], 10) * 7);
    return d.toISOString().slice(0, 10);
  }
  // "in N months"
  const nm = msg.match(/\bin\s+(\d{1,2})\s+months?\b/i);
  if (nm) {
    const d = new Date(today);
    d.setMonth(d.getMonth() + parseInt(nm[1], 10));
    return d.toISOString().slice(0, 10);
  }
  return null;
}

// Scope categories from free text keywords. Returns array or null.
function extractScopeCategories(msg) {
  if (!msg) return null;
  const lower = msg.toLowerCase();
  const cats = new Set();
  // Interiors keywords
  if (/\b(kitchen|bath(?:room)?|bedroom|living\s+room|floor(?:ing)?|cabinet|counter|paint|drywall|tile|interior|finish)\b/.test(lower)) {
    cats.add('Interiors');
  }
  // Exteriors keywords
  if (/\b(roof|siding|window|door|deck|patio|driveway|landscape|gutter|facade|exterior|paint\s+outside)\b/.test(lower)) {
    cats.add('Exteriors');
  }
  // MEP keywords
  if (/\b(plumb(?:ing)?|electric(?:al)?|hvac|heating|cooling|ac|air\s+conditioning|water\s+heater|panel|circuit|breaker|duct|vent|boiler|furnace)\b/.test(lower)) {
    cats.add('MEP');
  }
  // Demolition/Foundation
  if (/\b(demo(?:lition)?|gut|foundation|excavat(?:e|ion)|basement\s+dig|underpin|slab|footing)\b/.test(lower)) {
    cats.add('Demolition & Foundation');
  }
  // "full gut" bumps demo (kitchen was already interiors)
  if (/\b(full\s+gut|complete\s+gut|gut\s+reno)\b/.test(lower)) {
    cats.add('Demolition & Foundation');
  }
  return cats.size > 0 ? [...cats] : null;
}

function extractInt(msg, keyword) {
  if (!msg) return null;
  const p = new RegExp(`(\\d{1,3})\\s*${keyword}\\b`, 'i');
  const m = msg.match(p);
  if (m) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n)) return n;
  }
  return null;
}

function extractEmail(msg) {
  if (!msg) return null;
  const m = msg.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  return m ? m[0] : null;
}

function extractPhone(msg) {
  if (!msg) return null;
  const m = msg.match(/(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}/);
  return m ? m[0].trim() : null;
}

function extractMilestoneLabel(msg) {
  if (!msg) return null;
  const lower = msg.toLowerCase();
  if (/\bdeposit\b/.test(lower)) return 'Deposit';
  if (/\bfinal\b/.test(lower)) return 'Final';
  const p = lower.match(/\bprogress\s*(?:invoice\s*)?(\d)\b/);
  if (p) return `Progress ${p[1]}`;
  const ord = lower.match(/\b(?:first|1st|second|2nd|third|3rd|fourth|4th)\s+(?:progress|milestone|invoice)\b/);
  if (ord) {
    const map = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4 };
    const k = ord[0].split(/\s+/)[0];
    if (map[k]) return `Progress ${map[k]}`;
  }
  return null;
}

function extractPaymentMethod(msg) {
  if (!msg) return null;
  const lower = msg.toLowerCase();
  if (/\bcheck(?:s)?\b/.test(lower)) return 'check';
  if (/\bwire(?:\s+transfer)?\b/.test(lower)) return 'wire';
  if (/\bcredit\s*card\b/.test(lower) || /\bcc\b/.test(lower)) return 'credit_card';
  return null;
}

// ─── Slot arrays ─────────────────────────────────────────

export const SLOTS_CONTRACT = [
  {
    key: 'homeowner.name',
    label: 'Homeowner name',
    question: 'Who is the homeowner? Please give the full name as it should appear on the contract.',
    hint: 'e.g. "Jane Smith" or "John and Jane Smith"',
    required: true,
    type: 'string',
    extract: extractHomeownerName,
  },
  {
    key: 'homeowner.address',
    label: 'Property address',
    question: 'What is the full property address where the work will happen?',
    hint: 'e.g. "123 Oak St, Edison, NJ"',
    required: true,
    type: 'address',
    extract: extractAddress,
  },
  {
    key: 'scope_categories',
    label: 'Scope of work',
    question: 'Which categories does this job cover? You can pick more than one: Demolition & Foundation, Exteriors, Interiors, MEP (plumbing/electrical/HVAC).',
    hint: 'e.g. "Interiors and MEP" for a kitchen with new plumbing.',
    required: true,
    type: 'multi-enum',
    options: SCOPE_OPTIONS,
    extract: extractScopeCategories,
  },
  {
    key: 'payment.total_cents',
    label: 'Budget total',
    question: 'What is the total budget for the job (or a ballpark)?',
    hint: 'e.g. "$65,000" or "around 65k"',
    required: true,
    type: 'money',
    extract: extractMoney,
  },
  {
    key: 'timeline.start_date',
    label: 'Start date',
    question: 'When would you like to start the job?',
    hint: 'e.g. "July 15th", "next month", or "2026-08-01"',
    required: true,
    type: 'date',
    extract: extractDate,
  },
  {
    key: 'agreement_summary.months_to_complete',
    label: 'Months to complete',
    question: 'How many months should the contract allow for completion?',
    hint: 'Default is 6 months.',
    required: false,
    type: 'int',
    extract: (m) => extractInt(m, 'months?'),
  },
  {
    key: 'agreement_summary.weeks_to_start',
    label: 'Weeks to start',
    question: 'How many weeks after signing should work begin?',
    hint: 'Default is 2 weeks.',
    required: false,
    type: 'int',
    extract: (m) => extractInt(m, 'weeks?'),
  },
  {
    key: 'homeowner.phone',
    label: 'Homeowner phone',
    question: 'What is the homeowner\'s phone number? (Optional.)',
    hint: 'e.g. "(732) 555-0123"',
    required: false,
    type: 'phone',
    extract: extractPhone,
  },
  {
    key: 'homeowner.email',
    label: 'Homeowner email',
    question: 'What is the homeowner\'s email? (Needed only if you want me to send them the PDF from chat.)',
    hint: 'e.g. "jane@example.com"',
    required: false,
    type: 'email',
    extract: extractEmail,
  },
  {
    key: 'payment.method',
    label: 'Payment method',
    question: 'Payment method: check, wire, or credit card?',
    hint: 'Default is check.',
    required: false,
    type: 'enum',
    options: PAYMENT_METHOD_OPTIONS,
    extract: extractPaymentMethod,
  },
];

export const SLOTS_INVOICE = [
  {
    key: 'linked_contract_id',
    label: 'Contract this invoice bills against',
    question: 'Which contract should this invoice be tied to? You can name the homeowner or paste a contract number (CTR-YYYY-NNNN).',
    hint: 'e.g. "the Smith contract" or "CTR-2026-0003"',
    required: true,
    type: 'doc-ref',
    extract: (msg) => {
      if (!msg) return null;
      const ref = msg.match(/\bCTR-\d{4}-\d{4}\b/i);
      return ref ? ref[0].toUpperCase() : null;
    },
  },
  {
    key: 'milestone_label',
    label: 'Milestone',
    question: 'Which milestone is this invoice for? Options: Deposit, Progress 1, Progress 2, Progress 3, Progress 4, Final.',
    hint: 'e.g. "Deposit" or "Progress 2"',
    required: true,
    type: 'enum',
    options: MILESTONE_OPTIONS,
    extract: extractMilestoneLabel,
  },
  {
    key: 'invoice_date',
    label: 'Invoice date',
    question: 'What date should the invoice be dated?',
    hint: 'Default is today.',
    required: false,
    type: 'date',
    extract: extractDate,
  },
  {
    key: 'due_date',
    label: 'Due date',
    question: 'When is payment due?',
    hint: 'Default is tomorrow.',
    required: false,
    type: 'date',
    extract: extractDate,
  },
  {
    key: 'bill_to.recipient_email',
    label: 'Client email',
    question: 'What is the client\'s email? (Only needed if you want me to send the PDF from chat.)',
    required: false,
    type: 'email',
    extract: extractEmail,
  },
];

export const ALL_SLOT_KEYS = [
  ...SLOTS_CONTRACT.map((s) => s.key),
  ...SLOTS_INVOICE.map((s) => s.key),
];

// De-dup — some keys are shared conceptually (none currently, but future-proof).
export function slotDefsFor(template) {
  return template === 'contract' ? SLOTS_CONTRACT : SLOTS_INVOICE;
}

export function slotByKey(template, key) {
  return slotDefsFor(template).find((s) => s.key === key) || null;
}

// Convert a filled gathered_slots object into a human-readable prompt fragment
// that the oneshot generator can consume.
export function slotsToOneshotPrompt(template, gathered) {
  const defs = slotDefsFor(template);
  const lines = [];
  for (const def of defs) {
    const v = gathered[def.key];
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    let label = def.label;
    let value;
    if (def.type === 'money') {
      value = `$${(v / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    } else if (Array.isArray(v)) {
      value = v.join(', ');
    } else {
      value = String(v);
    }
    lines.push(`- ${label}: ${value}`);
  }
  return lines.join('\n');
}

// Given the current gathered slots + a whole thread's user messages, run all
// extractors that haven't produced a value yet and try to fill them in.
export function autoFillSlots(template, gathered, userTexts) {
  const defs = slotDefsFor(template);
  const combined = (userTexts || []).filter(Boolean).join('\n');
  if (!combined) return { patch: {}, newlyFilled: [] };
  const patch = {};
  const newlyFilled = [];
  for (const def of defs) {
    if (!def.extract) continue;
    const current = gathered[def.key];
    if (current != null && current !== '' && !(Array.isArray(current) && current.length === 0)) continue;
    let value;
    try { value = def.extract(combined); } catch { value = null; }
    if (value != null && value !== '') {
      patch[def.key] = value;
      newlyFilled.push(def.key);
    }
  }
  return { patch, newlyFilled };
}

// Return the highest-priority still-missing REQUIRED slot, or null if all filled.
export function nextRequiredSlot(template, gathered) {
  const defs = slotDefsFor(template);
  for (const def of defs) {
    if (!def.required) continue;
    const v = gathered[def.key];
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) return def;
  }
  return null;
}

// Return the list of missing required slots (all of them).
export function missingRequiredSlots(template, gathered) {
  const defs = slotDefsFor(template);
  return defs.filter((def) => {
    if (!def.required) return false;
    const v = gathered[def.key];
    return v == null || v === '' || (Array.isArray(v) && v.length === 0);
  });
}

// Coerce a value to the declared slot type. Returns { ok, value, error? }.
export function coerceSlotValue(def, raw) {
  if (raw == null || raw === '') return { ok: false, error: 'empty' };
  switch (def.type) {
    case 'string':
    case 'address':
    case 'phone':
    case 'email':
      return { ok: true, value: String(raw).trim() };
    case 'money': {
      if (typeof raw === 'number') return { ok: true, value: Math.round(raw) };
      const parsed = extractMoney(String(raw)) ?? extractMoney(`$${raw}`);
      return parsed != null
        ? { ok: true, value: parsed }
        : { ok: false, error: 'not_money' };
    }
    case 'date': {
      const s = String(raw).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: true, value: s };
      const parsed = extractDate(s);
      return parsed
        ? { ok: true, value: parsed }
        : { ok: false, error: 'not_date' };
    }
    case 'int': {
      const n = parseInt(String(raw), 10);
      return !isNaN(n) ? { ok: true, value: n } : { ok: false, error: 'not_int' };
    }
    case 'enum': {
      const s = String(raw).trim();
      const hit = def.options.find((o) => o.toLowerCase() === s.toLowerCase());
      return hit ? { ok: true, value: hit } : { ok: false, error: 'not_in_options' };
    }
    case 'multi-enum': {
      const arr = Array.isArray(raw) ? raw : String(raw).split(/[,;]|\band\b/i);
      const cleaned = arr.map((s) => String(s).trim()).filter(Boolean);
      const hits = cleaned
        .map((s) => def.options.find((o) => o.toLowerCase() === s.toLowerCase()))
        .filter(Boolean);
      return hits.length
        ? { ok: true, value: [...new Set(hits)] }
        : { ok: false, error: 'no_valid_options' };
    }
    case 'doc-ref':
      return { ok: true, value: String(raw).trim() };
    default:
      return { ok: true, value: raw };
  }
}
