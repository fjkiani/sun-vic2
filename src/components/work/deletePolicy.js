// Who gets the fast path and who gets asked first. React-free so the policy can be
// asserted directly by scripts/test-swipe-policy.mjs.

// A document is guarded once it has left the building.
export const GUARDED_DOC_STATUSES = ['sent', 'signed', 'paid', 'overdue'];

export function isDocGuarded(doc) {
  return GUARDED_DOC_STATUSES.includes(String(doc?.status || '').toLowerCase());
}

// A project has no draft state, so we guard on whether money is attached to it.
// An empty scratch project deletes instantly with undo; one carrying contract value
// asks first.
export function isProjectGuarded(project) {
  return Number(project?.contract_total_cents || 0) > 0;
}
