import React, { useEffect } from 'react';

// Mobile-native modal surface. Used for confirms, field editors and section-scoped agent
// prompts so we never push the user to another screen for a small decision.

export function BottomSheet({ open, onClose, title, subtitle, children, footer, maxHeight = '85dvh' }) {
  // Lock background scroll and wire Escape while the sheet owns the screen.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div
        className="absolute inset-0 bg-black/40 animate-[fadeIn_150ms_ease-out]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
        className="relative w-full md:max-w-lg bg-white rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col animate-[sheetUp_200ms_cubic-bezier(0.2,0,0,1)]"
        style={{ maxHeight }}
      >
        {/* Grab handle — signals the sheet is dismissible. */}
        <div className="flex-shrink-0 pt-2 pb-1 flex justify-center md:hidden">
          <div className="h-1 w-10 rounded-full bg-neutral-300" />
        </div>

        {(title || subtitle) && (
          <div className="flex-shrink-0 px-4 pb-3 pt-1 border-b border-neutral-200">
            {title && <div className="text-base font-semibold text-neutral-900">{title}</div>}
            {subtitle && <div className="text-xs text-neutral-500 mt-0.5">{subtitle}</div>}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">{children}</div>

        {footer && (
          <div
            className="flex-shrink-0 px-4 pt-3 border-t border-neutral-200"
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// Confirm sheet used for destructive actions on records that are legally meaningful
// (signed / sent / paid). Deliberately requires a deliberate tap, not a gesture.
export function ConfirmSheet({ open, onClose, title, body, confirmLabel = 'Delete', onConfirm, tone = 'danger', busy = false }) {
  const toneClass = tone === 'danger'
    ? 'bg-rose-600 hover:bg-rose-700'
    : 'bg-sunvic-500 hover:bg-sunvic-600';
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <p className="text-sm text-neutral-600 leading-relaxed">{body}</p>
      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`w-full min-h-[48px] rounded-xl text-white text-sm font-semibold disabled:opacity-50 ${toneClass}`}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="w-full min-h-[48px] rounded-xl border border-neutral-300 text-neutral-700 text-sm font-semibold"
        >
          Cancel
        </button>
      </div>
    </BottomSheet>
  );
}
