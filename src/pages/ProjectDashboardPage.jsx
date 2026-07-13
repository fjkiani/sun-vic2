// ProjectDashboardPage — the 360-degree view of a project.
// - Summary card (editable homeowner + property + money stats)
// - Pipeline kanban (contracts + invoices by status)
// - Money chart (billed vs paid by month)
// - Milestone timeline (aligned with actual invoices)

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { ProjectSummaryCard } from '../components/dashboard/ProjectSummaryCard.jsx';
import { PipelineKanban } from '../components/dashboard/PipelineKanban.jsx';
import { MoneyChart } from '../components/dashboard/MoneyChart.jsx';
import { MilestoneTimeline } from '../components/dashboard/MilestoneTimeline.jsx';

export function ProjectDashboardPage() {
  const { id } = useParams();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['project-summary', id],
    queryFn: () => api.getProjectSummary(id),
    refetchOnWindowFocus: true,
  });

  // Local project state — merged with fetched data, allows optimistic inline edits.
  const [localProject, setLocalProject] = useState(null);
  useEffect(() => { if (data?.project) setLocalProject(data.project); }, [data?.project]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const savePatch = useCallback(async (patch) => {
    if (!localProject) return;
    // optimistic
    setLocalProject((p) => ({ ...p, ...patch }));
    setSaving(true);
    setSaveError(null);
    try {
      const result = await api.updateProject(id, patch);
      if (result?.project) setLocalProject(result.project);
    } catch (e) {
      setSaveError(e);
      // refetch to restore truth
      refetch();
    } finally {
      setSaving(false);
    }
  }, [id, localProject, refetch]);

  if (isLoading) return <div className="text-neutral-500">Loading project…</div>;
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

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/projects" className="text-xs text-neutral-500 hover:text-neutral-800">← Projects</Link>
          <div className="text-2xl font-bold text-neutral-900">{localProject.name}</div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {saving && <span className="text-neutral-500">Saving…</span>}
          {saveError && <span className="text-red-600">Save failed: {saveError.message}</span>}
          <Link to="/documents/new" className="px-3 py-1.5 rounded bg-sunvic-500 hover:bg-sunvic-600 text-white text-xs font-semibold">
            + New Document
          </Link>
        </div>
      </div>

      {/* Row 1: summary card (full width) */}
      <ProjectSummaryCard project={localProject} money={data.money} onSave={savePatch} />

      {/* Row 2: kanban (full width, scrollable) */}
      <PipelineKanban pipeline={data.pipeline} />

      {/* Row 3: money chart + milestone timeline side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MoneyChart series={data.series} money={data.money} />
        <MilestoneTimeline milestones={data.milestones} />
      </div>
    </div>
  );
}

export default ProjectDashboardPage;
