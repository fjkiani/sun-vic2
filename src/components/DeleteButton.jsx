import React, { useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog.jsx';

// A trash-icon button that opens a ConfirmDialog and calls `onDelete`.
// `permanent` shows a type-to-confirm dialog; otherwise a simple confirm (move to Trash).
export function DeleteButton({
  onDelete,
  what = 'item',          // e.g. 'contract', 'project'
  permanent = false,
  iconOnly = true,
  className = '',
  stopPropagation = true,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onDelete();
      setOpen(false);
    } catch (e) {
      alert(`Delete failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={(e) => { if (stopPropagation) { e.stopPropagation(); e.preventDefault(); } setOpen(true); }}
        className={`grid place-items-center min-w-[40px] min-h-[40px] rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 ${className}`}
        aria-label={`Delete ${what}`}
        title={permanent ? `Delete ${what} forever` : `Move ${what} to Trash`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
        </svg>
        {!iconOnly && <span className="ml-1 text-sm">Delete</span>}
      </button>
      <ConfirmDialog
        open={open}
        destructive
        busy={busy}
        title={permanent ? `Delete ${what} forever?` : `Move ${what} to Trash?`}
        body={
          permanent
            ? `This permanently deletes this ${what}. This cannot be undone.`
            : `You can restore this ${what} from the Trash later.`
        }
        confirmLabel={permanent ? 'Delete forever' : 'Move to Trash'}
        requireText={permanent ? 'DELETE' : undefined}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
