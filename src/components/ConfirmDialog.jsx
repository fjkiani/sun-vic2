import React, { useState } from 'react';

// Mobile-friendly confirmation dialog. For destructive-permanent actions, set
// `requireText` to a string the user must type to enable the confirm button.
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  requireText, // e.g. 'DELETE'
  onConfirm,
  onCancel,
  busy = false,
}) {
  const [typed, setTyped] = useState('');
  if (!open) return null;
  const needsType = Boolean(requireText);
  const canConfirm = !needsType || typed.trim().toUpperCase() === requireText.toUpperCase();

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={busy ? undefined : onCancel} />
      <div className="relative bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-2xl shadow-xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <h3 className="text-lg font-bold text-neutral-900">{title}</h3>
        {body && <p className="mt-2 text-sm text-neutral-600">{body}</p>}
        {needsType && (
          <div className="mt-3">
            <label className="block text-xs text-neutral-500 mb-1">
              Type <span className="font-mono font-semibold">{requireText}</span> to confirm
            </label>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sunvic-500"
              placeholder={requireText}
              autoFocus
            />
          </div>
        )}
        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 min-h-[44px] rounded-lg border border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm || busy}
            className={`flex-1 min-h-[44px] rounded-lg font-semibold text-white disabled:opacity-50 ${
              destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-sunvic-500 hover:bg-sunvic-600'
            }`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
