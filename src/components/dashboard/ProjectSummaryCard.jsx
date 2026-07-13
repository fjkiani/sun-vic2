// ProjectSummaryCard — homeowner + property summary + high-level money numbers.
// Every text field is inline-editable so users can update from the dashboard.

import React from 'react';
import { InlineEditable } from '../InlineEditable.jsx';

function fmtUSD(cents) {
  return ((Number(cents) || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function ProjectSummaryCard({ project, money, onSave }) {
  const save = (field, value) => onSave({ [field]: value });
  const m = money || {};

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
        <div className="text-xs font-semibold text-neutral-500 uppercase">Project</div>
        <select
          value={project.status}
          onChange={(e) => save('status', e.target.value)}
          className="text-xs border border-neutral-300 rounded px-1.5 py-0.5"
        >
          <option value="active">active</option>
          <option value="on_hold">on hold</option>
          <option value="completed">completed</option>
          <option value="archived">archived</option>
        </select>
      </div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-lg font-bold text-neutral-900 mb-2">
            <InlineEditable value={project.name || ''} onSave={(v) => save('name', v)} placeholder="(project name)" />
          </div>
          <div className="space-y-1 text-sm text-neutral-700">
            <div>
              <span className="text-[10px] uppercase text-neutral-500 mr-2">Homeowner:</span>
              <InlineEditable value={project.homeowner_name || ''} onSave={(v) => save('homeowner_name', v)} placeholder="(name)" />
            </div>
            <div>
              <span className="text-[10px] uppercase text-neutral-500 mr-2">Email:</span>
              <InlineEditable value={project.homeowner_email || ''} onSave={(v) => save('homeowner_email', v)} placeholder="(email)" />
            </div>
            <div>
              <span className="text-[10px] uppercase text-neutral-500 mr-2">Phone:</span>
              <InlineEditable value={project.homeowner_phone || ''} onSave={(v) => save('homeowner_phone', v)} placeholder="(phone)" />
            </div>
            <div>
              <span className="text-[10px] uppercase text-neutral-500 mr-2">Address:</span>
              <InlineEditable value={project.property_address || ''} onSave={(v) => save('property_address', v)} placeholder="(property address)" multiline />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatBox label="Contract total" value={fmtUSD(m.contract_total_cents)} tone="neutral" />
          <StatBox label="Billed" value={fmtUSD(m.billed_cents)} tone="blue" />
          <StatBox label="Paid" value={fmtUSD(m.paid_cents)} tone="green" />
          <StatBox label="Outstanding" value={fmtUSD(m.outstanding_cents)} tone="amber" />
        </div>
      </div>
      {project.notes !== undefined && (
        <div className="px-4 pb-4 -mt-1">
          <div className="text-[10px] uppercase text-neutral-500 mb-1">Notes</div>
          <InlineEditable
            value={project.notes || ''}
            onSave={(v) => save('notes', v)}
            multiline
            placeholder="(add project notes)"
            as="div"
            className="text-sm text-neutral-700 min-h-[2rem]"
          />
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, tone = 'neutral' }) {
  const toneMap = {
    neutral: 'bg-neutral-100 text-neutral-900',
    blue:    'bg-blue-50 text-blue-900',
    green:   'bg-green-50 text-green-900',
    amber:   'bg-amber-50 text-amber-900',
  };
  return (
    <div className={`rounded-lg p-2 ${toneMap[tone] || toneMap.neutral}`}>
      <div className="text-[10px] uppercase opacity-70">{label}</div>
      <div className="font-mono font-bold text-sm mt-0.5">{value}</div>
    </div>
  );
}

export default ProjectSummaryCard;
