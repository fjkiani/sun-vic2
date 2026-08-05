import React from 'react';
import { Link } from 'react-router-dom';

// A human-in-the-loop review card for a document the agent created or updated. Shows a
// summary and routes the user to the AI-first document screen to review / take next steps.
export function ReviewCard({ doc }) {
  const total = ((Number(doc.total_cents) || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  return (
    <Link
      to={`/documents/${doc.id}`}
      className="flex items-center gap-3 rounded-xl border border-sunvic-200 bg-sunvic-50 p-3 hover:bg-sunvic-100 transition-colors"
    >
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-sunvic-500 text-white grid place-items-center">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-neutral-900 truncate">
          {doc.doc_number || doc.title || 'Document'} ready for review
        </div>
        <div className="text-xs text-neutral-500 capitalize">
          {doc.template} · {doc.status}{doc.total_cents ? ` · ${total}` : ''}
        </div>
      </div>
      <div className="flex-shrink-0 text-sunvic-600 text-sm font-semibold">Review →</div>
    </Link>
  );
}
