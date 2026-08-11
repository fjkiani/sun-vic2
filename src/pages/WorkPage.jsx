import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { WorkFilters } from '../components/work/WorkFilters.jsx';
import { TrashView } from '../components/TrashView.jsx';
import { DocumentRow, ProjectRow } from '../components/work/WorkRows.jsx';
import { useSwipeDelete, isDocGuarded, isProjectGuarded } from '../components/work/useSwipeDelete.js';
import { ConfirmSheet } from '../components/ui/BottomSheet.jsx';
import { formatUSD } from '../components/ui/MoneyInput.jsx';

// Map back-compat ?type= values to internal tab ids.
function normalizeType(t) {
  if (t === 'documents') return 'all';
  if (['all', 'projects', 'contract', 'invoice', 'trash'].includes(t)) return t;
  return 'all';
}

// Work — unified Projects + Contracts + Invoices in one filterable list, plus Trash.
// Mobile-first: swipeable cards, no table, no endless scroll.
export function WorkPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const type = normalizeType(searchParams.get('type') || 'all');
  // Status lives in the URL alongside type, so a filtered view is linkable and survives a
  // reload or a back button. It used to be local state, which meant "show me the drafts" was
  // a thing you could see but never send to anyone or return to.
  const status = searchParams.get('status') || '';
  const [q, setQ] = useState('');
  const qc = useQueryClient();

  const setParam = (key, val) => {
    setSearchParams((p) => {
      const n = new URLSearchParams(p);
      if (val) n.set(key, val); else n.delete(key);
      return n;
    }, { replace: true });
  };
  const setType = (t) => setParam('type', t);
  const setStatus = (s) => setParam('status', s);

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

  const swipe = useSwipeDelete({ onChanged: refresh });

  function docPayload(d) {
    return {
      label: d.doc_number || 'Document',
      remove: () => api.deleteDocument(d.id),
      restore: () => api.restoreDocument(d.id),
    };
  }
  function projectPayload(p) {
    return {
      label: p.name || 'Project',
      remove: () => api.deleteProject(p.id),
      restore: () => api.restoreProject(p.id),
    };
  }

  function onDocSwipe(d, guarded) {
    const payload = docPayload(d);
    if (!guarded && !isDocGuarded(d)) return swipe.softDelete(payload);
    return swipe.requestConfirm({
      title: `Move ${d.doc_number} to Trash?`,
      body: `This ${d.template} is marked ${d.status} — it has already gone out to the homeowner. It moves to Trash and stays restorable, but the issued copy is unaffected.`,
      confirmLabel: 'Move to Trash',
      payload,
    });
  }

  function onProjectSwipe(p, guarded) {
    const payload = projectPayload(p);
    if (!guarded && !isProjectGuarded(p)) return swipe.softDelete(payload);
    return swipe.requestConfirm({
      title: `Move ${p.name} to Trash?`,
      body: `This project carries ${formatUSD(p.contract_total_cents)} in contract value. It moves to Trash and stays restorable.`,
      confirmLabel: 'Move to Trash',
      payload,
    });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-neutral-900">Work</h1>
          <p className="text-sm text-neutral-500">Projects, contracts, and invoices.</p>
        </div>
        <Link
          to="/copilot"
          className="min-h-[44px] px-4 rounded-xl bg-sunvic-500 hover:bg-sunvic-600 text-white text-sm font-semibold grid place-items-center flex-shrink-0"
        >
          <span className="hidden sm:inline">+ New with Copilot</span>
          <span className="sm:hidden">+ New</span>
        </Link>
      </div>

      <WorkFilters type={type} onType={setType} status={status} onStatus={setStatus} q={q} onQ={setQ} />

      {swipe.error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 flex items-center justify-between gap-3">
          <span>{swipe.error}</span>
          <button onClick={swipe.clearError} className="text-xs font-semibold underline">Dismiss</button>
        </div>
      )}

      {isTrash ? (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
          <TrashView />
        </div>
      ) : loading ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-neutral-400 text-sm">Loading…</div>
      ) : (
        <div className="space-y-5">
          {showProjects && projects.length > 0 && (
            <section>
              <SectionHeading>Projects</SectionHeading>
              <div className="space-y-2">
                {projects.map((p) => (
                  <ProjectRow key={p.id} project={p} onSwipe={onProjectSwipe} />
                ))}
              </div>
            </section>
          )}

          {showDocs && (
            <section>
              {showProjects && <SectionHeading>Documents</SectionHeading>}
              {docs.length === 0 ? (
                <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-neutral-400 text-sm">
                  No documents match. Create one with the Copilot.
                </div>
              ) : (
                <div className="space-y-2">
                  {docs.map((d) => (
                    <DocumentRow key={d.id} doc={d} onSwipe={onDocSwipe} />
                  ))}
                </div>
              )}
            </section>
          )}

          {(docs.length > 0 || projects.length > 0) && (
            <p className="md:hidden text-center text-[11px] text-neutral-400 pt-1">
              Swipe a card left to delete. Issued documents ask first.
            </p>
          )}

          {showProjects && projects.length === 0 && docs.length === 0 && !loading && (
            <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-neutral-400 text-sm">
              Nothing here yet. Use the Copilot to create your first contract.
            </div>
          )}
        </div>
      )}

      <ConfirmSheet
        open={!!swipe.confirm}
        onClose={swipe.closeConfirm}
        title={swipe.confirm?.title || ''}
        body={swipe.confirm?.body || ''}
        confirmLabel={swipe.confirm?.confirmLabel || 'Move to Trash'}
        onConfirm={swipe.runConfirmed}
        busy={swipe.busy}
      />
      {swipe.toast.node}
    </div>
  );
}

function SectionHeading({ children }) {
  return (
    <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2 px-1">{children}</div>
  );
}
