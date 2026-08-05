// Deterministic start-date extraction from a free-text prompt.
//
// Why this exists: POST /api/documents with a `prompt` and no gathered slots calls
// oneshot() with gatheredSlots = {}. reconcileContractWithSlots then resolves the start
// date as `slots['timeline.start_date'] || out.timeline.start_date || null`, so on that
// path the value comes entirely from the model. A prompt that plainly says
// "Start date March 3 2026" was producing timeline.start_date = null, which then failed
// the required-field preflight and blocked emailing the contract.
//
// Asking the model for the field is necessary but not sufficient — models omit fields.
// This is the deterministic backstop, so the invariant holds without an LLM in the loop.

const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sept: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
};

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Real-calendar validity, so "February 30" is rejected rather than silently rolled over. */
function valid(y, m, d) {
  if (!(y >= 1900 && y <= 2200) || !(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Ordered most-explicit first. Each returns [year, month, day].
const PATTERNS = [
  // 2026-03-03
  [/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, (m) => [+m[1], +m[2], +m[3]]],
  // March 3, 2026 / March 3rd 2026 / Mar 3 2026
  [new RegExp(`\\b(${Object.keys(MONTHS).join('|')})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\,?\\s+(\\d{4})\\b`, 'i'),
    (m) => [+m[3], MONTHS[m[1].toLowerCase()], +m[2]]],
  // 3 March 2026 / 3rd of March 2026
  [new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${Object.keys(MONTHS).join('|')})\\.?\\,?\\s+(\\d{4})\\b`, 'i'),
    (m) => [+m[3], MONTHS[m[2].toLowerCase()], +m[1]]],
  // 3/3/2026 — US month/day/year, which is what a New Jersey contractor writes.
  [/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/, (m) => [+m[3], +m[1], +m[2]]],
];

/**
 * Pull a start date out of a prompt.
 *
 * Prefers a date that appears near start-ish wording ("start", "begin", "commence",
 * "kick off", "break ground"); a prompt often carries several dates and only one of them
 * is the start. Falls back to the first valid date in the text.
 *
 * @param {string} prompt
 * @returns {string|null} ISO YYYY-MM-DD, or null when nothing parses
 */
export function extractStartDate(prompt) {
  if (!prompt || typeof prompt !== 'string') return null;

  const found = [];
  for (const [re, map] of PATTERNS) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    let m;
    while ((m = g.exec(prompt)) !== null) {
      const [y, mo, d] = map(m);
      if (valid(y, mo, d)) found.push({ index: m.index, text: m[0], date: iso(y, mo, d) });
    }
  }
  if (found.length === 0) return null;

  // Prefer whichever parsed date sits closest after start-ish wording.
  const cue = /\b(start(?:s|ing|ed)?|begin(?:s|ning)?|commenc\w*|kick[- ]?off|break(?:ing)? ground)\b/gi;
  let best = null;
  let m;
  while ((m = cue.exec(prompt)) !== null) {
    for (const f of found) {
      const gap = f.index - m.index;
      if (gap >= 0 && gap < 60 && (best === null || gap < best.gap)) best = { gap, date: f.date };
    }
  }
  if (best) return best.date;

  found.sort((a, b) => a.index - b.index);
  return found[0].date;
}
