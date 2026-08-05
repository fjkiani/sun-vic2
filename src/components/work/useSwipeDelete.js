import { useCallback, useState } from 'react';
import { useUndoToast } from '../ui/UndoSnackbar.jsx';
import { GUARDED_DOC_STATUSES, isDocGuarded, isProjectGuarded } from './deletePolicy.js';

export { GUARDED_DOC_STATUSES, isDocGuarded, isProjectGuarded };

// Swipe-delete policy, in one place so the Work list, project dashboard and any future
// list all behave identically (ITER6 plan, decision 2).
//
//   guarded === false  -> swipe deletes straight to Trash, 5s Undo restores it
//   guarded === true   -> swipe opens a confirm sheet; nothing mutates until confirmed
//
// Both paths are soft deletes: Trash is always the recovery route. Swipe changes speed,
// not reversibility.

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
