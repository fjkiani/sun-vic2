// SendPanel — why this document cannot be sent, and what to do about it.
//
// The bug this replaces: `runEmail` read the recipient, and if there wasn't one did
// `{ setTab('form'); return; }` — it switched tab and died. No message, no explanation. Every
// one of the 17 live documents on production hit that branch, because not one of them had a
// homeowner email. The button looked functional and did nothing.
//
// Underneath that, the server was already producing a precise answer. `preflight()` returns
// field-level issues ("Missing a start date", `timeline.start_date`) and POST /email returns
// them as a 409. The UI discarded all of it and showed `alert('Email failed: …')`.
//
// preflight is a pure function, so it runs here in the browser against the live payload. The
// checklist below is the same check the server will apply, evaluated as you type — you can see
// a blocker clear the moment you fix it, and every blocker jumps you to the field that fixes it.

import React, { useMemo, useState } from 'react';
import { preflight } from '../../../packages/validation/guardrails.js';
import { api } from '../../lib/api.js';

function issueLabel(i) {
  return String(i.message || '').replace(/\.$/, '');
}

export function SendPanel({ doc, onJumpToField, onSent, onClose, onSaveField, onBeforeSend }) {
  const initialRecipient =
    doc?.client_email
    || (doc?.template === 'contract' ? doc?.payload?.homeowner?.email : doc?.payload?.bill_to?.recipient_email)
    || '';

  const [recipient, setRecipient] = useState(initialRecipient);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);   // {kind:'sent'|'error', message, issues?}

  // The same gate the server applies, run locally so the list is live.
  const check = useMemo(
    () => preflight(doc, 'email', { recipient }),
    [doc, recipient]
  );

  const recipientIssue = check.blocking.find((i) => i.field === 'recipient');
  const fieldIssues = check.blocking.filter((i) => i.field !== 'recipient');
  const emailLooksValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient.trim());

  async function send() {
    setBusy(true);
    setResult(null);
    try {
      // The server re-runs preflight against the *persisted* document. Edits made in the last
      // few hundred milliseconds are still sitting in the debounced save queue, so a blocker
      // you just cleared would come back as a 409. Flush first.
      await onBeforeSend?.();
      await api.emailDocument(doc.id, { to: recipient.trim() });
      setResult({ kind: 'sent', message: `Sent to ${recipient.trim()}.` });
      onSent?.();
    } catch (e) {
      // Surface what the server actually said instead of flattening it to one line.
      const data = e?.data || {};
      if (data.error === 'resend_key_missing') {
        setResult({
          kind: 'error',
          message: 'Email delivery is not configured on this deployment yet — RESEND_API_KEY is not set in the hosting environment. '
                 + 'The document itself is ready to go; add the key and this will send.',
        });
      } else if (data.error === 'not_ready') {
        setResult({ kind: 'error', message: data.detail || 'Not ready to send.', issues: data.issues || [] });
      } else {
        setResult({ kind: 'error', message: e?.detail || e?.message || String(e) });
      }
    } finally {
      setBusy(false);
    }
  }

  const ready = check.ok && emailLooksValid;

  return (
    <div className="p-3 md:p-4 space-y-3 overflow-y-auto h-full" data-testid="send-panel">
      <div>
        <h3 className="text-sm font-semibold text-neutral-900">Send this {doc.template}</h3>
        <p className="text-xs text-neutral-500 mt-0.5">
          {ready
            ? 'Everything required is filled in.'
            : 'These have to be filled in before it can go out. Tap one to fix it.'}
        </p>
      </div>

      {/* Recipient — the thing that was silently missing on every document. */}
      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium">Send to</span>
        <input
          type="email"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="homeowner@example.com"
          data-testid="send-recipient"
          className={`mt-1 w-full rounded-xl border px-3 min-h-[48px] text-base outline-none focus:ring-2 ${
            recipientIssue || (recipient && !emailLooksValid)
              ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
              : 'border-neutral-300 focus:border-sunvic-500 focus:ring-sunvic-200'
          }`}
        />
        {!initialRecipient && (
          <span className="mt-1 block text-xs text-neutral-500">
            This document has no homeowner email saved.{' '}
            {onSaveField && emailLooksValid && (
              <button
                type="button"
                onClick={() => onSaveField(
                  doc.template === 'contract' ? 'homeowner.email' : 'bill_to.recipient_email',
                  recipient.trim()
                )}
                className="text-sunvic-600 underline font-medium min-h-[32px]"
              >Save it to the document</button>
            )}
          </span>
        )}
        {recipient && !emailLooksValid && (
          <span className="mt-1 block text-xs text-rose-600">That does not look like an email address.</span>
        )}
      </label>

      {/* The blocking checklist. Every row is a jump to the field that clears it. */}
      {fieldIssues.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden" data-testid="send-blockers">
          <div className="px-3 py-2 text-xs font-semibold text-amber-900 border-b border-amber-200">
            {fieldIssues.length} {fieldIssues.length === 1 ? 'thing' : 'things'} missing
          </div>
          <ul>
            {fieldIssues.map((i) => (
              <li key={`${i.code}:${i.field}`} className="border-b border-amber-100 last:border-b-0">
                <button
                  type="button"
                  onClick={() => onJumpToField?.(i.field)}
                  data-testid="send-blocker-row"
                  data-field={i.field}
                  className="w-full text-left px-3 py-2 min-h-[44px] flex items-center gap-2 hover:bg-amber-100 active:bg-amber-100"
                >
                  <span className="flex-1 text-sm text-amber-900">{issueLabel(i)}</span>
                  <span className="text-xs text-amber-700 font-medium flex-shrink-0">Fix →</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ready && !result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Ready to send.
        </div>
      )}

      {result && (
        <div
          data-testid="send-result"
          className={`rounded-xl border px-3 py-2 text-sm ${
            result.kind === 'sent'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <div>{result.message}</div>
          {result.issues?.length > 0 && (
            <ul className="mt-1 list-disc list-inside text-xs">
              {result.issues.map((i) => <li key={`${i.code}:${i.field}`}>{issueLabel(i)}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        {onClose && (
          <button type="button" onClick={onClose}
            className="min-h-[44px] px-4 rounded-xl text-sm text-neutral-600 hover:bg-neutral-100">Close</button>
        )}
        <button
          type="button"
          onClick={send}
          disabled={!ready || busy}
          data-testid="send-submit"
          className="flex-1 min-h-[48px] px-4 rounded-xl bg-sunvic-500 hover:bg-sunvic-600 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? 'Sending…' : ready ? `Send to ${recipient.trim()}` : 'Not ready to send'}
        </button>
      </div>
    </div>
  );
}

export default SendPanel;
