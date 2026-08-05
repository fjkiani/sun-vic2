import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';

// "Emails sent" dashboard — genuine rows from the email_log table. Each row shows the
// recipient, document, subject, time, and delivery status, with a Resend button that
// re-sends the document email via the existing endpoint.
export function EmailsList() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['emails'],
    queryFn: () => api.listEmails({}),
  });
  const emails = data?.emails || [];

  async function resend(email) {
    if (!email.document_id) return;
    setBusyId(email.id);
    try {
      await api.emailDocument(email.document_id, { to: email.recipient });
      qc.invalidateQueries({ queryKey: ['emails'] });
    } catch (e) {
      alert(`Resend failed: ${e?.message || e}`);
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading) return <div className="p-6 text-center text-neutral-400 text-sm">Loading emails…</div>;
  if (error) return <div className="p-6 text-center text-rose-600 text-sm">{error.message}</div>;
  if (emails.length === 0) {
    return (
      <div className="p-10 text-center text-neutral-400 text-sm">
        No emails sent yet. Open a document and tap Email to send your first one.
      </div>
    );
  }

  return (
    <div className="divide-y divide-neutral-100">
      {emails.map((e) => (
        <div key={e.id} className="px-4 py-3 flex items-center gap-3">
          <div className={`flex-shrink-0 w-9 h-9 rounded-lg grid place-items-center ${
            e.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
          }`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-neutral-900 truncate">{e.recipient}</div>
            <div className="text-xs text-neutral-500 truncate">
              {e.document_id ? (
                <Link to={`/documents/${e.document_id}`} className="text-sunvic-700 hover:underline">
                  {e.doc_number || 'Document'}
                </Link>
              ) : (
                <span>{e.doc_number || 'Document'}</span>
              )}
              {' · '}<span className="capitalize">{e.template || ''}</span>
              {' · '}{new Date(e.created_at).toLocaleString()}
            </div>
            {e.status === 'failed' && e.error && (
              <div className="text-xs text-rose-600 truncate">{e.error}</div>
            )}
          </div>
          <div className="flex-shrink-0 flex items-center gap-2">
            <span className={`text-[10px] font-semibold uppercase rounded px-1.5 py-0.5 ${
              e.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
            }`}>
              {e.status}
            </span>
            {e.document_id && (
              <button
                onClick={() => resend(e)}
                disabled={busyId === e.id}
                className="min-h-[36px] px-3 rounded-lg border border-neutral-300 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                {busyId === e.id ? 'Sending…' : 'Resend'}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
