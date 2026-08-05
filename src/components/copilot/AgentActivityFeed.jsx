import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';

// "What the agent has done / what needs review" — a genuine feed of the most recent
// documents (the agent's tangible output), newest first. Each row routes to the AI-first
// document screen. Drafts are surfaced as needing review.
export function AgentActivityFeed({ limit = 6 }) {
  const { data, isLoading } = useQuery({
    queryKey: ['documents', 'recent'],
    queryFn: () => api.listDocuments({}),
  });
  const docs = (data?.documents || []).slice(0, limit);

  if (isLoading) return <div className="text-sm text-neutral-400 py-4 text-center">Loading recent work…</div>;
  if (docs.length === 0) {
    return (
      <div className="text-sm text-neutral-400 py-6 text-center">
        Nothing yet. Ask the copilot to create your first contract or invoice above.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {docs.map((d) => {
        const total = ((Number(d.total_cents) || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
        const needsReview = d.status === 'draft';
        return (
          <Link
            key={d.id}
            to={`/documents/${d.id}`}
            className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 hover:border-sunvic-400 transition-colors"
          >
            <div className={`flex-shrink-0 w-2 h-2 rounded-full ${needsReview ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-neutral-900 truncate">
                {d.doc_number || d.title} <span className="text-neutral-400 font-normal">· {d.client_name || '—'}</span>
              </div>
              <div className="text-xs text-neutral-500 capitalize">
                {d.template} · {d.status}{d.total_cents ? ` · ${total}` : ''}
              </div>
            </div>
            {needsReview && (
              <span className="flex-shrink-0 text-[10px] font-semibold uppercase text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
                Review
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
