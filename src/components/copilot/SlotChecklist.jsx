import React from 'react';
import { slotDefsFor } from '../../../packages/agent/thread-slots.js';

// SlotChecklist — the conversation's progress, made visible.
//
// The complaint was "this doesn't even have a proper flow". Part of that was reading order
// (fixed in CopilotPage), but the deeper part is that a slot-filling agent asking one question
// at a time is INVISIBLE state. You answer "Jane Smith", the agent asks the next thing, and you
// have no idea whether you are two questions from a contract or twelve, or whether the address
// you typed three turns ago was actually understood.
//
// The server already tracks this: `thread.gathered_slots` is persisted before the LLM turn and
// returned on every response, and `packages/agent/thread-slots.js` is pure JS with no Node
// imports, so the same definitions that drive the agent drive this list. Nothing is duplicated
// or re-derived — if the agent's required set changes, this changes with it.
//
// Deliberately mirrors SendPanel's checklist (amber = outstanding, emerald = clear) because it
// is the same idea in a different place: here is what is missing, here is what it is waiting on.

function displayValue(def, v) {
  if (v == null || v === '') return '';
  if (def.type === 'money') {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    // Cents → dollars. Keep cents when they exist rather than rounding them away.
    return (n / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: Number.isInteger(n / 100) ? 0 : 2,
      maximumFractionDigits: 2,
    });
  }
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

function isFilled(v) {
  return !(v == null || v === '' || (Array.isArray(v) && v.length === 0));
}

export function SlotChecklist({ thread, className = '' }) {
  const template = thread?.template;
  const gathered = thread?.gathered_slots || {};
  const pending = thread?.pending_slot || null;

  // No template chosen yet means the agent has not worked out what you are asking for. An
  // empty checklist claiming "0 of 5" would be a lie about state that does not exist.
  if (!template) return null;

  const required = slotDefsFor(template).filter((d) => d.required);
  if (required.length === 0) return null;

  const done = required.filter((d) => isFilled(gathered[d.key]));
  const complete = done.length === required.length;

  return (
    <div
      className={`rounded-xl border overflow-hidden ${
        complete ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
      } ${className}`}
      data-testid="slot-checklist"
      data-template={template}
      data-filled={done.length}
      data-required={required.length}
    >
      <div
        className={`px-3 py-2 text-xs font-semibold border-b ${
          complete
            ? 'text-emerald-900 border-emerald-200'
            : 'text-amber-900 border-amber-200'
        }`}
      >
        {complete
          ? `Everything needed for the ${template} — drafting it now`
          : `${done.length} of ${required.length} things needed for the ${template}`}
      </div>
      <ul>
        {required.map((d) => {
          const v = gathered[d.key];
          const filled = isFilled(v);
          const waiting = !filled && pending === d.key;
          return (
            <li
              key={d.key}
              data-testid="slot-row"
              data-slot={d.key}
              data-filled={filled ? '1' : undefined}
              data-waiting={waiting ? '1' : undefined}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm border-b last:border-b-0 ${
                complete ? 'border-emerald-100' : 'border-amber-100'
              } ${waiting ? 'bg-white/70' : ''}`}
            >
              <span
                aria-hidden="true"
                className={`flex-shrink-0 w-4 text-center ${
                  filled ? 'text-emerald-600' : waiting ? 'text-sunvic-600' : 'text-neutral-400'
                }`}
              >
                {filled ? '✓' : waiting ? '→' : '○'}
              </span>
              <span
                className={`flex-shrink-0 ${
                  filled ? 'text-neutral-500' : 'text-neutral-800 font-medium'
                }`}
              >
                {d.label}
              </span>
              {filled ? (
                <span className="ml-auto min-w-0 truncate text-right text-neutral-700">
                  {displayValue(d, v)}
                </span>
              ) : waiting ? (
                <span className="ml-auto flex-shrink-0 text-xs font-medium text-sunvic-700">
                  answering now
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default SlotChecklist;
