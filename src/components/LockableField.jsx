import React from 'react';

// Composite input that shows a lock icon next to the label. When locked, the input is disabled
// and edits are refused. The lock state comes from `locks[path] === true` on the parent doc.
// Parents pass `onToggleLock` to flip a lock; PATCH with { locks: { [path]: bool } } persists it.

const LockIcon = ({ locked }) => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4.5" y="10.5" width="15" height="11" rx="2.5" />
    {locked ? (
      <path d="M8 10.5V7a4 4 0 018 0v3.5" />
    ) : (
      <path d="M8 10.5V7a4 4 0 017.4-2.1" />
    )}
  </svg>
);

export function LockableField({
  label,
  path,
  value,
  onChange,
  locked = false,
  onToggleLock,
  type = 'text',
  as = 'input',
  hint,
  className = '',
  rows,
  min, max, step,
  placeholder,
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-xs uppercase tracking-wide text-neutral-500 font-semibold">{label}</label>
        <button type="button" onClick={onToggleLock}
          title={locked ? `Unlock ${path}` : `Lock ${path}`}
          className={`text-neutral-400 hover:text-sunvic-600 ${locked ? 'text-sunvic-500' : ''}`}>
          <LockIcon locked={locked} />
        </button>
      </div>
      {as === 'textarea' ? (
        <textarea
          value={value ?? ''}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={locked}
          rows={rows || 4}
          placeholder={placeholder}
          className={`w-full rounded-md border ${locked ? 'bg-neutral-100 border-neutral-200 text-neutral-500' : 'border-neutral-300 bg-white'} px-3 py-2 focus:ring-2 focus:ring-sunvic-500 focus:outline-none text-sm`}
        />
      ) : (
        <input
          type={type}
          value={value ?? ''}
          onChange={(e) => onChange?.(type === 'number' ? Number(e.target.value) : e.target.value)}
          disabled={locked}
          placeholder={placeholder}
          {...(type === 'number' ? { min, max, step } : {})}
          className={`w-full rounded-md border ${locked ? 'bg-neutral-100 border-neutral-200 text-neutral-500' : 'border-neutral-300 bg-white'} px-3 py-2 focus:ring-2 focus:ring-sunvic-500 focus:outline-none text-sm`}
        />
      )}
      {hint ? <div className="text-xs text-neutral-500">{hint}</div> : null}
    </div>
  );
}
