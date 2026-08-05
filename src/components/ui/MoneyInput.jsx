import React, { useState } from 'react';

// Currency field that speaks dollars to the user and cents to the payload.
//
// Replaces `<input type="number" value={(cents/100).toFixed(2)}>`, which was hostile on
// phones: it shows spinner arrows, rejects partially-typed values like "12." while you're
// still typing, re-formats mid-keystroke, and opens the full keyboard instead of the
// numeric pad. Here the raw keystrokes live in local state until blur, so typing is never
// fought, and only a parsed value is pushed upstream.

export function centsToDollarString(cents) {
  if (cents == null || cents === '') return '';
  return (Number(cents) / 100).toFixed(2);
}

export function parseDollarsToCents(text) {
  if (text == null) return 0;
  const cleaned = String(text).replace(/[^0-9.]/g, '');
  if (cleaned === '' || cleaned === '.') return 0;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function formatUSD(cents) {
  return ((Number(cents) || 0) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export function MoneyInput({
  valueCents,
  onChangeCents,
  placeholder = '0.00',
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
  id,
}) {
  const [draft, setDraft] = useState(null); // non-null only while focused

  const shown = draft !== null ? draft : centsToDollarString(valueCents);

  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">$</span>
      <input
        id={id}
        aria-label={ariaLabel}
        // `decimal` gives the numeric pad with a decimal key and avoids number-spinners.
        inputMode="decimal"
        type="text"
        disabled={disabled}
        value={shown}
        placeholder={placeholder}
        onFocus={() => setDraft(centsToDollarString(valueCents))}
        onChange={(e) => {
          // Allow only digits and a single decimal point while typing.
          const next = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
          setDraft(next);
        }}
        onBlur={() => {
          if (draft !== null) {
            const cents = parseDollarsToCents(draft);
            if (cents !== (Number(valueCents) || 0)) onChangeCents?.(cents);
          }
          setDraft(null);
        }}
        className="w-full min-h-[48px] rounded-xl border border-neutral-300 bg-white pl-7 pr-3 text-base tabular-nums focus:border-sunvic-500 focus:ring-2 focus:ring-sunvic-200 focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-400"
      />
    </div>
  );
}
