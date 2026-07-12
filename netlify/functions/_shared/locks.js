// Lock-guard: rejects writes to locked payload paths.
// Path syntax matches JSON pointer without the leading '/': "contractor.legal_name", "warranties.text".

export function isLocked(locks, path) {
  return !!(locks && locks[path] === true);
}

// Given a proposed patch (partial payload), return the list of locked paths it tries to touch.
// If any: caller should refuse the write.
export function violatedLocks(currentPayload, patch, locks, base = '') {
  const violations = [];
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    if (base && isLocked(locks, base)) violations.push(base);
    return violations;
  }
  for (const [k, v] of Object.entries(patch)) {
    const p = base ? `${base}.${k}` : k;
    const cur = currentPayload ? currentPayload[k] : undefined;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      violations.push(...violatedLocks(cur, v, locks, p));
    } else if (isLocked(locks, p)) {
      violations.push(p);
    }
  }
  return violations;
}

// Deep-merge patch into target (immutable), skipping any locked paths.
// Returns the merged payload and the list of skipped paths.
export function mergeWithLocks(target, patch, locks, base = '') {
  const out = { ...(target || {}) };
  const skipped = [];
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return { out: patch, skipped };
  for (const [k, v] of Object.entries(patch)) {
    const p = base ? `${base}.${k}` : k;
    if (isLocked(locks, p)) {
      skipped.push(p);
      continue;
    }
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const nested = mergeWithLocks(out[k] || {}, v, locks, p);
      out[k] = nested.out;
      skipped.push(...nested.skipped);
    } else {
      out[k] = v;
    }
  }
  return { out, skipped };
}
