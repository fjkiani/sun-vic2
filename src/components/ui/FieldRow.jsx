import React, { useState } from 'react';

// The review-first primitive (plan decision 3): the agent fills the document, so the
// default state of a field is a readable summary line, not an input box. Tapping a row
// reveals the editor. Editing is the exception, not the entry point.

export function FieldRow({
  label,
  hint,
  value,                 // display string (already formatted by the caller)
  empty = 'Not set',
  children,              // the editor, rendered only while open
  defaultOpen = false,
  required = false,
  agentAction,           // optional node, e.g. a section-scoped agent button
}) {
  const [open, setOpen] = useState(defaultOpen);
  const filled = value !== undefined && value !== null && String(value).trim() !== '';

  return (
    <div className="border-b border-neutral-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-3 py-3 min-h-[56px] text-left active:bg-neutral-50"
      >
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium">
            {label}
            {required && !filled && <span className="ml-1 text-rose-500 normal-case tracking-normal">· required</span>}
          </div>
          <div className={`text-[15px] mt-0.5 truncate ${filled ? 'text-neutral-900' : 'text-neutral-400 italic'}`}>
            {filled ? value : empty}
          </div>
        </div>
        <svg
          className={`w-4 h-4 flex-shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          {hint && <p className="text-xs text-neutral-500 leading-snug">{hint}</p>}
          {children}
          {agentAction}
        </div>
      )}
    </div>
  );
}

// Plain text input sized for thumbs — 48px min target, 16px text so iOS doesn't zoom.
export function TextField({ value, onChange, placeholder, type = 'text', disabled, multiline = false, rows = 4, ...rest }) {
  const shared =
    'w-full rounded-xl border border-neutral-300 bg-white px-3 text-base focus:border-sunvic-500 focus:ring-2 focus:ring-sunvic-200 focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-400';
  if (multiline) {
    return (
      <textarea
        rows={rows}
        value={value ?? ''}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        className={`${shared} py-2 leading-relaxed`}
        {...rest}
      />
    );
  }
  return (
    <input
      type={type}
      value={value ?? ''}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
      className={`${shared} min-h-[48px]`}
      {...rest}
    />
  );
}
