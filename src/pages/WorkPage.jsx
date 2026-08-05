import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { WorkFilters } from '../components/work/WorkFilters.jsx';
import { TrashView } from '../components/TrashView.jsx';
import { DeleteButton } from '../components/DeleteButton.jsx';

function fmtUSD(cents) {
  return ((Number(cents) || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
const STATUS_STYLES = {
  draft:    'bg-neutral-100 text-neutral-700 border-neutral-200',
  sent:     'bg-blue-50 text-blue-700 border-blue-200',
  signed:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  paid:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  overdue:  'bg-rose-50 text-rose-700 border-rose-200',
  void:     'bg-neutral-50 text-neutral-400 border-neutral-200',
};
function StatusBadge({ status }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold uppercase ${STATUS_STYLES[status] || STATUS_STYLES.draft}`}>
      {status}
    </span>
  );
}

// Map back-compat ?type= values to internal tab ids.
function normalizeType(t) {
  if (t === 'documents') return 'all';
  if (t === 'projects') return 'projects';
  if (['all', 'projects', 'contract', 'invoice', 'trash'].includes(t)) return t;
  return 'all';
}

// Work — unified Projects + Contracts + Invoices in one filterable list, plus Trash.
// Mobile-first: cards on small screens, table on md+. No endless scroll — a capped list.
export function WorkPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const type = normalizeType(searchParams.get('type') || 'all');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const qc = useQueryClient();

  const setType = (t) => {
    setSearchParams((p) => { const n = new URLSearchParams(p); n.set('type', t); return n; }, { replace: true });
  };

  const showProjects = type === 'all' || type === 'projects';
  const showDocs = type === 'all' || type === 'contract' || type === 'invoice';
  const isTrash = type === 'trash';

  const docParams = useMemo(() => {
    const p = {};
    if (type === 'contract' || type === 'invoice') p.template = type;
    if (status) p.status = status;
    if (q) p.q = q;
    return p;
  }, [type, status, q]);

  const docsQ = useQuery({
    queryKey: ['documents', docParams],
    queryFn: () => api.listDocuments(docParams),
    enabled: showDocs && !isTrash,
  });
  const projsQ = useQuery({
    queryKey: ['projects', q ? { q } : {}],
    queryFn: () => api.listProjects(q ? { q } : {}),
    enabled: showProjects && !isTrash,
  });

  const docs = docsQ.data?.documents || [];
  const projects = projsQ.data?.projects || [];
  const loading = (showDocs && docsQ.isLoading) || (showProjects && projsQ.isLoading);

  function refresh() {
    qc.invalidateQueries({ queryKey: ['documents'] });
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['trash'] });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Work</h1>
          <p className="text-sm text-neutral-500">Projects, contracts, and invoices.</p>
        </div>
        <Link
          to="/copilot"
          className="min-h-[44px] px-4 rounded-xl bg-sunvic-500 hover:bg-sunvic-600 text-white text-sm font-semibold grid place-items-center"
        >
          + New with Copilot
        </Link>
      </div>

      <WorkFilters type={type} onType={setType} status={status} onStatus={setStatus} q={q} onQ={setQ} />

      {isTrash ? (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
          <TrashView />
        </div>
      ) : loading ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-neutral-400 text-sm">Loading…</div>
      ) : (
        <div className="space-y-4">
          {/* Projects */}
          {showProjects && projects.length > 0 && (
            <section>
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2 px-1">Projects</div>
              <div className="space-y-2">
                {projects.map((p) => (
                  <div key={p.id} className="relative">
                    <Link
                      to={`/projects/${p.id}`}
                      className="block rounded-xl border border-neutral-200 bg-white p-3 pr-14 active:bg-neutral-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-neutral-900 truncate">{p.name}</div>
                        <span className="text-[10px] uppercase font-semibold text-neutral-500 capitalize">{p.status}</span>
                      </div>
                      <div className="text-xs text-neutral-500 truncate">{p.homeowner_name || '—'} · {p.property_address || ''}</div>
                      <div className="text-xs font-mono font-semibold text-neutral-800 mt-1">{fmtUSD(p.contract_total_cents)}</div>
                    </Link>
                    <div className="absolute top-2 right-2">
                      <DeleteButton what="project" onDelete={async () => { await api.deleteProject(p.id); refresh(); }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Documents */}
          {showDocs && (
            <section>
              {showProjects && <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2 px-1">Documents</div>}
              {docs.length === 0 ? (
                <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-neutral-400 text-sm">
                  No documents match. Create one with the Copilot.
                </div>
              ) : (
                <div className="space-y-2">
                  {docs.map((d) => (
                    <div key={d.id} className="relative">
                      <Link
                        to={`/documents/${d.id}`}
                        className="block rounded-xl border border-neutral-200 bg-white p-3 pr-14 active:bg-neutral-50"
                      >
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <div className="font-mono text-sunvic-600 font-semibold text-sm">{d.doc_number}</div>
                          <StatusBadge status={d.status} />
                        </div>
                        <div className="font-medium text-sm truncate">{d.title || '—'}</div>
                        <div className="text-xs text-neutral-500 truncate">{d.client_name || 'no client'} · {d.template}</div>
                        <div className="flex items-center justify-between text-xs mt-1">
                          <span className="font-mono font-semibold text-neutral-800">{fmtUSD(d.total_cents)}</span>
                          <span className="text-neutral-400">{fmtDate(d.updated_at)}</span>
                        </div>
                      </Link>
                      <div className="absolute top-2 right-2">
                        <DeleteButton what={d.template} onDelete={async () => { await api.deleteDocument(d.id); refresh(); }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {showProjects && projects.length === 0 && docs.length === 0 && !loading && (
            <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-neutral-400 text-sm">
              Nothing here yet. Use the Copilot to create your first contract.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
