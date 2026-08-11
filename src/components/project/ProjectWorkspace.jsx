// ProjectWorkspace — the single, tabbed project surface.
//
// Before this, /projects/:id dumped the summary card, the kanban, the money chart and the
// milestone timeline down one page, so a project with no documents rendered eight empty
// states stacked on top of each other. The same content was unreachable from the document
// editor, so the two screens were siloed: you could look at a contract, or you could look
// at the project it belonged to, never both.
//
// This component owns the panels. ProjectDashboardPage hosts it full-width; the document
// editor hosts the same instance in its Project tab. One implementation, two hosts.

import React, { useState } from 'react';
import { SegmentedTabs } from '../SegmentedTabs.jsx';
import { ProjectSummaryCard } from '../dashboard/ProjectSummaryCard.jsx';
import { PipelineKanban } from '../dashboard/PipelineKanban.jsx';
import { MoneyChart } from '../dashboard/MoneyChart.jsx';
import { ProjectCopilotCard } from '../dashboard/ProjectCopilotCard.jsx';
import { MilestoneWorkflow } from './MilestoneWorkflow.jsx';
import { MoneyStats } from './MoneyStats.jsx';

// The document editor asks for exactly these four, in this order.
export const RAIL_TABS = [
  { id: 'copilot', label: 'Copilot' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'money', label: 'Money' },
  { id: 'milestones', label: 'Milestones' },
];

export const FULL_TABS = [{ id: 'overview', label: 'Overview' }, ...RAIL_TABS];

export function ProjectWorkspace({
  summary,
  onSaveProject,
  onChanged,
  variant = 'full', // 'full' = /projects/:id, 'rail' = embedded in the document editor
  initialTab,
}) {
  const tabs = variant === 'rail' ? RAIL_TABS : FULL_TABS;
  const [tab, setTab] = useState(initialTab || tabs[0].id);

  const project = summary?.project || null;
  const money = summary?.money || null;
  const pipeline = summary?.pipeline || null;
  const series = summary?.series || [];
  const milestones = summary?.milestones || [];
  const documents = summary?.documents || [];
  const latestContractId = summary?.latest_contract_id || null;

  if (!project) return null;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex-shrink-0 pb-3">
        <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 pb-4">
        {tab === 'overview' && (
          <div className="space-y-4">
            <ProjectSummaryCard project={project} money={money} onSave={onSaveProject} />
            <MoneyStats money={money} documents={documents} />
          </div>
        )}

        {tab === 'copilot' && (
          <div className="space-y-3">
            <ProjectCopilotCard project={project} />
          </div>
        )}

        {tab === 'pipeline' && <PipelineKanban pipeline={pipeline} />}

        {tab === 'money' && (
          <div className="space-y-4">
            <MoneyStats money={money} documents={documents} />
            <MoneyChart series={series} money={money} />
          </div>
        )}

        {tab === 'milestones' && (
          <MilestoneWorkflow
            projectId={project.id}
            project={project}
            milestones={milestones}
            contractId={latestContractId}
            money={money}
            onChanged={onChanged}
          />
        )}
      </div>
    </div>
  );
}

export default ProjectWorkspace;
