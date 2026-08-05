import React, { useCallback, useEffect, useRef, useState } from 'react';

// Undo affordance for swipe-delete. The delete itself already happened (soft delete to
// Trash, always recoverable), so Undo simply calls restore — there is no deferred-commit
// timer that could silently drop the action if the tab closes.

export function UndoSnackbar({
  open,
  message,
  actionLabel = 'Undo',
  onAction,
  onDismiss,
  duration = 5000,
}) {
  const [remaining, setRemaining] = useState(duration);
  const startedRef = useRef(0);

  useEffect(() => {
    if (!open) return undefined;
    startedRef.current = Date.now();
    setRemaining(duration);
    const tick = window.setInterval(() => {
      const left = duration - (Date.now() - startedRef.current);
      setRemaining(left);
      if (left <= 0) {
        window.clearInterval(tick);
        onDismiss?.();
      }
    }, 100);
    return () => window.clearInterval(tick);
  }, [open, duration, onDismiss]);

  if (!open) return null;

  const pct = Math.max(0, Math.min(100, (remaining / duration) * 100));

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 z-50 md:left-auto md:right-4 md:w-96"
      style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' }}
    >
      <div className="rounded-xl bg-neutral-900 text-white shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex-1 text-sm truncate">{message}</span>
          <button
            type="button"
            onClick={onAction}
            className="flex-shrink-0 text-sm font-semibold text-amber-300 hover:text-amber-200 min-h-[44px] px-2 -my-2"
          >
            {actionLabel}
          </button>
        </div>
        <div className="h-0.5 bg-white/20">
          <div className="h-full bg-amber-300 transition-[width] duration-100 ease-linear" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

// Small state helper so callers don't re-implement the open/message/undo plumbing.
export function useUndoToast() {
  const [state, setState] = useState(null); // { message, onUndo }

  const show = useCallback((message, onUndo) => setState({ message, onUndo }), []);
  const hide = useCallback(() => setState(null), []);

  const node = (
    <UndoSnackbar
      open={!!state}
      message={state?.message || ''}
      onAction={async () => {
        const fn = state?.onUndo;
        setState(null);
        try { await fn?.(); } catch { /* caller surfaces its own errors */ }
      }}
      onDismiss={hide}
    />
  );

  return { show, hide, node };
}
