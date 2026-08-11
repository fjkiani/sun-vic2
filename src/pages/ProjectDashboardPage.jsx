// ProjectDashboardPage — one tabbed workspace for a project.
//
// This page used to stack five panels down a single scroll: copilot, summary card, kanban,
// money chart, milestone timeline. On a project with no documents that is eight empty
// states in a row, which is what "$0.00 / $0.00 / $0.00 / $0.00, Document Pipeline 0, no
// money, no milestones" looked like. Everything was visible and nothing was legible.
//
// The panels themselves were fine; the layout was the problem. They now live in
// ProjectWorkspace behind tabs, and the document editor hosts the same component in its
// Project tab, so the two screens stopped being siloed.

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { isUuid, projectIdFromRef } from '../lib/slugs.js';
import { ProjectWorkspace } from '../components/project/ProjectWorkspace.jsx';

function fmtUSD(cents) {
  return ((Number(cents) || 0) / 100).toLocaleString('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  });
}

export function ProjectDashboardPage() {
  // The address is a readable slug — "88-raritan-avenue-highland-park-nj-dce232a6" — so it
  // has to be turned back into an id before anything is fetched. Projects have no number of
  // their own like documents do, so resolution goes through the list. Raw UUID addresses
  // short-circuit and cost nothing extra, which keeps older links fast as well as working.
  const { id: ref } = useParams();
  const needsLookup = !isUuid(ref);
  const { data: projList, isLoading: listLoading } = useQuery({
    queryKey: ['projects', 'slug-resolve'],
    queryFn: () => api.listProjects({}),
    enabled: needsLookup,
    staleTime: 60_000,
  });
  const id = needsLookup ? projectIdFromRef(ref, projList?.projects) : ref;
  const unresolved = needsLookup && !listLoading && !id;

  const { data, isLoading: sumLoading, error, refetch } = useQuery({
    queryKey: ['project-summary', id],
    queryFn: () => api.getProjectSummary(id),
    enabled: !!id,
    refetchOnWindowFocus: true,
  });
  const isLoading = (needsLookup && listLoading) || (!!id && sumLoading);

  // Local project state — merged with fetched data, allows optimistic inline edits.
  const [localProject, setLocalProject] = useState(null);
  useEffect(() => { if (data?.project) setLocalProject(data.project); }, [data?.project]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [restoring, setRestoring] = useState(false);

  const savePatch = useCallback(async (patch) => {
    if (!localProject) return;
    setLocalProject((p) => ({ ...p, ...patch })); // optimistic
    setSaving(true);
    setSaveError(null);
    try {
      const result = await api.updateProject(id, patch);
      if (result?.project) setLocalProject(result.project);
    } catch (e) {
      setSaveError(e);
      refetch(); // restore truth
    } finally {
      setSaving(false);
    }
  }, [id, localProject, refetch]);

  if (isLoading) return <div className="text-neutral-500">Loading project…</div>;
  if (unresolved) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm" data-testid="project-unresolved">
        <div className="font-medium text-neutral-900">No project at this address</div>
        <div className="mt-1 text-neutral-600">
          <code className="bg-neutral-100 px-1 py-0.5 rounded text-xs">{ref}</code> doesn’t match a project you can open.
          It may have been deleted, or the link may be incomplete.
        </div>
        <div className="mt-3">
          <Link to="/work?type=projects" className="text-sunvic-700 underline">← All projects</Link>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
        <div>Failed to load project: {error.message}</div>
        {String(error.detail || '').includes('projects') && (
          <div className="mt-1 text-xs">
            Have you run <code className="bg-red-100 px-1 py-0.5 rounded">0003_projects.sql</code> in the Supabase SQL editor?
          </div>
        )}
        <div className="mt-2">
          <Link to="/projects" className="text-red-800 underline">← Back to projects</Link>
        </div>
      </div>
    );
  }
  if (!data || !localProject) return null;

  const money = data.money;
  const documents = data.documents || [];
  const summaryComplete = !!(money && data.pipeline);
  const summary = { ...data, project: localProject };

  return (
    <div className="space-y-3">
      {/* Header. The contract total lives here rather than in a tile so it is readable
          before you pick a tab — it is the one number a contractor opens this page for. */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <Link to="/projects" className="inline-flex items-center min-h-[44px] text-xs text-neutral-500 hover:text-neutral-800">← Projects</Link>
          <h1 className="text-lg md:text-2xl font-bold text-neutral-900 truncate leading-tight">{localProject.name}</h1>
          <div className="text-xs text-neutral-500 truncate">
            {localProject.homeowner_name || 'No homeowner yet'}
            {documents.length > 0 && <> · {documents.length} document{documents.length === 1 ? '' : 's'}</>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {money && money.contract_total_cents > 0 && (
            <div className="text-right hidden sm:block">
              <div className="text-[10px] uppercase tracking-wide text-neutral-400">Contract</div>
              <div className="font-mono font-bold text-neutral-900">{fmtUSD(money.contract_total_cents)}</div>
            </div>
          )}
          <Link
            to="/documents/new"
            className="inline-flex items-center min-h-[44px] px-4 rounded-lg bg-sunvic-500 hover:bg-sunvic-600 text-white text-sm font-semibold"
          >
            + New
          </Link>
        </div>
      </div>

      {(saving || saveError) && (
        <div className="text-xs">
          {saving && <span className="text-neutral-500">Saving…</span>}
          {saveError && <span className="text-red-600">Save failed — {saveError.message}</span>}
        </div>
      )}

      {!summaryComplete && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          Dashboard aggregates are unavailable. If you just migrated, retry in a few seconds;
          otherwise the summary API is degraded.
        </div>
      )}

      {/*
        GET /api/projects/:id does not filter deleted_at even though GET /api/projects does,
        so this page renders a trashed project as a normal one. Reachable in practice: a
        live document links here from its Project tab, and 10 of 17 live documents on
        production pointed at trashed projects.
      */}
      {localProject.deleted_at && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="text-xs font-semibold text-amber-900">This project is in the trash</div>
          <p className="mt-0.5 text-xs text-amber-800 leading-snug">
            Deleted on {new Date(localProject.deleted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}. Its documents are
            still live, but the project is hidden from your projects list until you restore it.
          </p>
          <button
            type="button"
            disabled={restoring}
            onClick={async () => {
              setRestoring(true);
              try { await api.restoreProject(id); await refetch(); } catch { /* surfaced below */ }
              finally { setRestoring(false); }
            }}
            className="mt-2 inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-semibold"
          >
            {restoring ? 'Restoring…' : 'Restore this project'}
          </button>
        </div>
      )}

      {documents.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-3 text-xs text-neutral-600">
          This project has no documents, so every money figure below is genuinely zero rather
          than missing. Create a contract and the pipeline, money and milestones fill in.
        </div>
      )}

      <ProjectWorkspace
        summary={summary}
        variant="full"
        onSaveProject={savePatch}
        onChanged={refetch}
      />
    </div>
  );
}

export default ProjectDashboardPage;
