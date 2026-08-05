import { useCallback, useState } from 'react';
import { useUndoToast } from '../ui/UndoSnackbar.jsx';

// Swipe-delete policy, in one place so the Work list, project dashboard and any future
// list all behave identically (ITER6 plan, decision 2).
//
//   guarded === false  -> swipe deletes straight to Trash, 5s Undo restores it
//   guarded === true   -> swipe opens a confirm sheet; nothing mutates until confirmed
//
// Both paths are soft deletes: Trash is always the recovery route. Swipe changes speed,
// not reversibility.

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

export function useSwipeDelete({ onChanged } = {}) {
  const toast = useUndoToast();
  const [confirm, setConfirm] = useState(null); // { title, body, confirmLabel, run }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Perform the soft delete and offer undo. `restore` is what the Undo button calls —
  // we genuinely delete first and genuinely restore on undo, rather than deferring the
  // delete behind a timer, so a closed tab can never lose the user's intent.
  const softDelete = useCallback(async ({ label, remove, restore }) => {
    setError('');
    try {
      await remove();
      onChanged?.();
      toast.show(`${label} moved to Trash`, async () => {
        try {
          await restore();
          onChanged?.();
        } catch (e) {
          setError(`Could not restore: ${String(e?.message || e)}`);
        }
      });
    } catch (e) {
      setError(`Could not delete: ${String(e?.message || e)}`);
    }
  }, [onChanged, toast]);

  const requestConfirm = useCallback((cfg) => setConfirm(cfg), []);
  const closeConfirm = useCallback(() => setConfirm(null), []);

  const runConfirmed = useCallback(async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await softDelete(confirm.payload);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }, [confirm, softDelete]);

  return {
    toast,
    confirm,
    busy,
    error,
    clearError: () => setError(''),
    softDelete,
    requestConfirm,
    closeConfirm,
    runConfirmed,
  };
}
