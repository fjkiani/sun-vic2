import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { ConfirmDialog } from './ConfirmDialog.jsx';

// Trash view: lists trashed documents + projects with Restore / Delete-forever actions.
// Used inside the Work tab. Genuine data only — reads from the live API.
export function TrashView() {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(null); // {kind:'document'|'project', id, label}
  const [busy, setBusy] = useState(false);

  const docsQ = useQuery({
    queryKey: ['trash', 'documents'],
    queryFn: () => api.listDocuments({ trashed: '1' }),
  });
  const projsQ = useQuery({
    queryKey: ['trash', 'projects'],
    queryFn: () => api.listProjects({ trashed: '1' }),
  });

  const docs = docsQ.data?.documents || [];
  const projs = projsQ.data?.projects || [];
  const loading = docsQ.isLoading || projsQ.isLoading;
  const empty = !loading && docs.length === 0 && projs.length === 0;

  function refresh() {
    qc.invalidateQueries({ queryKey: ['trash'] });
    qc.invalidateQueries({ queryKey: ['documents'] });
    qc.invalidateQueries({ queryKey: ['projects'] });
  }

  async function restore(kind, id) {
    setBusy(true);
    try {
      if (kind === 'document') await api.restoreDocument(id);
      else await api.restoreProject(id);
      refresh();
    } catch (e) {
      alert(`Restore failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteForever() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'document') await api.deleteDocument(confirm.id, { permanent: true });
      else await api.deleteProject(confirm.id, { permanent: true });
      setConfirm(null);
      refresh();
    } catch (e) {
      alert(`Delete failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-6 text-center text-neutral-500 text-sm">Loading Trash…</div>;
  if (empty) {
    return (
      <div className="p-10 text-center">
        <div className="text-neutral-400 text-sm">Trash is empty.</div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-neutral-100">
      {projs.map((p) => (
        <TrashRow
          key={`p-${p.id}`}
          label={p.name || 'Untitled project'}
          sub={`Project · ${p.homeowner_name || ''}`}
          onRestore={() => restore('project', p.id)}
          onDelete={() => setConfirm({ kind: 'project', id: p.id, label: p.name || 'this project' })}
          busy={busy}
        />
      ))}
      {docs.map((d) => (
        <TrashRow
          key={`d-${d.id}`}
          label={d.doc_number || d.title || 'Document'}
          sub={`${d.template === 'contract' ? 'Contract' : 'Invoice'} · ${d.client_name || ''}`}
          onRestore={() => restore('document', d.id)}
          onDelete={() => setConfirm({ kind: 'document', id: d.id, label: d.doc_number || 'this document' })}
          busy={busy}
        />
      ))}
      <ConfirmDialog
        open={Boolean(confirm)}
        destructive
        busy={busy}
        title="Delete forever?"
        body={confirm ? `This permanently deletes ${confirm.label}. This cannot be undone.` : ''}
        confirmLabel="Delete forever"
        requireText="DELETE"
        onConfirm={deleteForever}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function TrashRow({ label, sub, onRestore, onDelete, busy }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-neutral-900 truncate">{label}</div>
        <div className="text-xs text-neutral-500 truncate">{sub}</div>
      </div>
      <button
        onClick={onRestore}
        disabled={busy}
        className="min-h-[40px] px-3 rounded-lg border border-neutral-300 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
      >
        Restore
      </button>
      <button
        onClick={onDelete}
        disabled={busy}
        className="min-h-[40px] px-3 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
      >
        Delete
      </button>
    </div>
  );
}
