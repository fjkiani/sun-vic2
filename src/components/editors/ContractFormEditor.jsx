import React from 'react';
import { LockableField } from '../LockableField.jsx';
import { getScopePreset } from '../../../packages/templates/defaults.js';

function centsToDollars(c) {
  if (c == null || c === '') return '';
  return (Number(c) / 100).toFixed(2);
}
function dollarsToCents(d) {
  if (d === '' || d == null) return 0;
  return Math.round(Number(d) * 100);
}

function useSavePath(onSave) {
  return React.useCallback((path, value) => onSave({ [path]: value }), [onSave]);
}

function fmtDate(v) {
  if (!v) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return v;
}

function Row({ children }) {
  return <div className="grid grid-cols-2 gap-2 mb-2">{children}</div>;
}
function FullRow({ children }) {
  return <div className="mb-2">{children}</div>;
}

function Section({ title, children }) {
  return (
    <div className="mb-6 pb-4 border-b border-neutral-200 last:border-b-0">
      <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-3 font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function TaskRow({ groupIdx, taskIdx, task, onSave, onDelete, locked }) {
  const base = `scope_of_work.groups.${groupIdx}.tasks.${taskIdx}`;
  const descText = Array.isArray(task.description) ? task.description.join('\n') : (task.description || '');
  return (
    <div className="border border-neutral-200 rounded p-2 mb-2 bg-neutral-50">
      <div className="grid grid-cols-12 gap-1 mb-1">
        <input
          className="col-span-6 border border-neutral-300 rounded px-2 py-1 text-sm"
          value={task.task || ''}
          disabled={locked}
          placeholder="Task name"
          onChange={(e) => onSave(`${base}.task`, e.target.value)}
        />
        <input
          className="col-span-2 border border-neutral-300 rounded px-2 py-1 text-sm"
          value={task.qty || ''}
          disabled={locked}
          placeholder="Qty"
          onChange={(e) => onSave(`${base}.qty`, e.target.value)}
        />
        <input
          type="number"
          className="col-span-2 border border-neutral-300 rounded px-2 py-1 text-sm text-right"
          value={centsToDollars(task.unit_price_cents)}
          disabled={locked}
          placeholder="Unit $"
          step="0.01"
          onChange={(e) => onSave(`${base}.unit_price_cents`, dollarsToCents(e.target.value))}
        />
        <input
          type="number"
          className="col-span-2 border border-neutral-300 rounded px-2 py-1 text-sm text-right"
          value={centsToDollars(task.amount_cents)}
          disabled={locked}
          placeholder="Amount"
          step="0.01"
          onChange={(e) => onSave(`${base}.amount_cents`, dollarsToCents(e.target.value))}
        />
      </div>
      <textarea
        className="w-full border border-neutral-300 rounded px-2 py-1 text-xs font-mono"
        rows={Math.max(2, descText.split('\n').length)}
        value={descText}
        disabled={locked}
        placeholder="Bullets (one per line)"
        onChange={(e) => onSave(`${base}.description`, e.target.value.split('\n').filter(l => l !== ''))}
      />
      <div className="flex justify-end mt-1">
        <button
          type="button"
          onClick={onDelete}
          disabled={locked}
          className="text-xs text-red-600 hover:underline disabled:opacity-40"
        >
          Remove task
        </button>
      </div>
    </div>
  );
}

function GroupBlock({ group, groupIdx, groupsCount, onSave, doc }) {
  const groups = doc.payload?.scope_of_work?.groups || [];
  const setGroups = (next) => onSave('scope_of_work.groups', next);

  const addTask = () => {
    const next = groups.map((g, i) =>
      i === groupIdx
        ? {
            ...g,
            tasks: [
              ...(g.tasks || []),
              { task: '', description: [], qty: 'Lump Sump', unit_price_cents: 0, amount_cents: 0 },
            ],
          }
        : g
    );
    setGroups(next);
  };

  const deleteTask = (ti) => {
    const next = groups.map((g, i) =>
      i === groupIdx
        ? { ...g, tasks: (g.tasks || []).filter((_, x) => x !== ti) }
        : g
    );
    setGroups(next);
  };

  const deleteGroup = () => {
    const next = groups.filter((_, i) => i !== groupIdx);
    setGroups(next);
  };

  return (
    <div className="border border-neutral-300 rounded-md p-2 mb-3 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <input
          className="flex-1 border-b-2 border-neutral-400 px-1 py-1 text-sm font-semibold uppercase bg-transparent"
          value={group.category || ''}
          placeholder="Category"
          onChange={(e) => onSave(`scope_of_work.groups.${groupIdx}.category`, e.target.value)}
        />
        <button
          type="button"
          onClick={deleteGroup}
          className="text-xs text-red-600 hover:underline"
        >
          Delete group
        </button>
      </div>
      {(group.tasks || []).map((t, ti) => (
        <TaskRow
          key={ti}
          groupIdx={groupIdx}
          taskIdx={ti}
          task={t}
          onSave={onSave}
          onDelete={() => deleteTask(ti)}
        />
      ))}
      <button
        type="button"
        onClick={addTask}
        className="text-xs text-sunvic-700 hover:underline"
      >
        + Add task
      </button>
    </div>
  );
}

function ScheduleTable({ payload, onSave }) {
  const schedule = payload.payment?.schedule || [];
  const setSchedule = (next) => onSave('payment.schedule', next);
  const sum = schedule.reduce((acc, m) => acc + (Number(m.percent) || 0), 0);
  const sumOk = Math.abs(sum - 100) < 0.01;
  const setRow = (idx, patch) => setSchedule(schedule.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  const addRow = () => setSchedule([...schedule, { milestone: '', percent: 0, condition: '' }]);
  const delRow = (idx) => setSchedule(schedule.filter((_, i) => i !== idx));

  return (
    <div>
      {schedule.map((m, i) => (
        <div key={i} className="grid grid-cols-12 gap-1 mb-1">
          <input
            className="col-span-5 border border-neutral-300 rounded px-2 py-1 text-sm"
            value={m.milestone || ''}
            placeholder="Milestone"
            onChange={(e) => setRow(i, { milestone: e.target.value })}
          />
          <input
            type="number"
            className="col-span-2 border border-neutral-300 rounded px-2 py-1 text-sm text-right"
            value={m.percent ?? 0}
            step="0.01"
            onChange={(e) => setRow(i, { percent: Number(e.target.value) })}
          />
          <input
            className="col-span-4 border border-neutral-300 rounded px-2 py-1 text-sm"
            value={m.condition || ''}
            placeholder="Condition"
            onChange={(e) => setRow(i, { condition: e.target.value })}
          />
          <button
            type="button"
            onClick={() => delRow(i)}
            className="col-span-1 text-xs text-red-600"
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between mt-2">
        <button type="button" onClick={addRow} className="text-xs text-sunvic-700 hover:underline">
          + Milestone
        </button>
        <span className={`text-xs font-mono ${sumOk ? 'text-green-700' : 'text-red-600'}`}>
          Sum: {sum.toFixed(2)}% {sumOk ? '✓' : '⚠'}
        </span>
      </div>
    </div>
  );
}

function PresetLibrary({ payload, onSave }) {
  return (
    <div className="mb-3 p-2 rounded bg-sunvic-50 border border-sunvic-200 text-xs">
      <label className="block mb-1 font-semibold text-sunvic-800">Insert preset scope</label>
      <select
        className="border border-neutral-300 rounded px-2 py-1 text-xs w-full"
        defaultValue=""
        onChange={(e) => {
          if (!e.target.value) return;
          if (e.target.value === 'full_addition') {
            const preset = getScopePreset('full_addition');
            const existing = payload?.scope_of_work?.groups || [];
            onSave('scope_of_work.groups', [...existing, ...preset]);
          } else {
            alert('Preset coming soon');
          }
          e.target.value = '';
        }}
      >
        <option value="">— select —</option>
        <option value="full_addition">Full addition (demo/foundation/framing/finishes)</option>
        <option value="bath_remodel">Bathroom remodel (coming soon)</option>
        <option value="kitchen_remodel">Kitchen remodel (coming soon)</option>
      </select>
    </div>
  );
}

export function ContractFormEditor({ doc, onSave, onToggleLock }) {
  const payload = doc?.payload || {};
  const locks = doc?.locks || {};
  const set = useSavePath(onSave);
  const scope = payload.scope_of_work || { groups: [] };
  const groups = scope.groups || [];

  return (
    <div className="p-3 space-y-2">
      <Section title="Cover">
        <Row>
          <LockableField
            label="Job No"
            value={payload.job_no || ''}
            locked={locks['job_no']}
            onToggleLock={() => onToggleLock('job_no')}
            onChange={(v) => set('job_no', v)}
          />
          <LockableField
            label="Prepared On"
            type="date"
            value={fmtDate(payload.prepared_on)}
            locked={locks['prepared_on']}
            onToggleLock={() => onToggleLock('prepared_on')}
            onChange={(v) => set('prepared_on', v)}
          />
        </Row>
        <FullRow>
          <LockableField
            label="For (label)"
            value={payload.for_label || ''}
            locked={locks['for_label']}
            onToggleLock={() => onToggleLock('for_label')}
            onChange={(v) => set('for_label', v)}
          />
        </FullRow>
        <FullRow>
          <LockableField
            label="Contract Type"
            value={payload.contract_type || ''}
            locked={locks['contract_type']}
            onToggleLock={() => onToggleLock('contract_type')}
            onChange={(v) => set('contract_type', v)}
          />
        </FullRow>
      </Section>

      <Section title="Homeowner">
        <LockableField
          label="Name"
          value={payload.homeowner?.name || ''}
          locked={locks['homeowner.name']}
          onToggleLock={() => onToggleLock('homeowner.name')}
          onChange={(v) => set('homeowner.name', v)}
        />
        <LockableField
          label="Address"
          value={payload.homeowner?.address || ''}
          locked={locks['homeowner.address']}
          onToggleLock={() => onToggleLock('homeowner.address')}
          onChange={(v) => set('homeowner.address', v)}
        />
        <Row>
          <LockableField
            label="Phone"
            value={payload.homeowner?.phone || ''}
            locked={locks['homeowner.phone']}
            onToggleLock={() => onToggleLock('homeowner.phone')}
            onChange={(v) => set('homeowner.phone', v)}
          />
          <LockableField
            label="Email"
            value={payload.homeowner?.email || ''}
            locked={locks['homeowner.email']}
            onToggleLock={() => onToggleLock('homeowner.email')}
            onChange={(v) => set('homeowner.email', v)}
          />
        </Row>
      </Section>

      <Section title="Agreement Summary (Section A)">
        <FullRow>
          <label className="text-xs text-neutral-600 block mb-1">Body paragraph</label>
          <textarea
            rows={5}
            className="w-full border border-neutral-300 rounded px-2 py-1 text-sm"
            value={payload.agreement_summary?.text || ''}
            onChange={(e) => set('agreement_summary.text', e.target.value)}
          />
          <p className="text-[10px] text-neutral-500 mt-1">
            Full body of Section A — not a short recap.
          </p>
        </FullRow>
        <Row>
          <LockableField
            label="Weeks to start"
            type="number"
            value={payload.agreement_summary?.weeks_to_start ?? 0}
            onChange={(v) => set('agreement_summary.weeks_to_start', Number(v))}
          />
          <LockableField
            label="Months to complete"
            type="number"
            value={payload.agreement_summary?.months_to_complete ?? 0}
            onChange={(v) => set('agreement_summary.months_to_complete', Number(v))}
          />
        </Row>
      </Section>

      <Section title="Scope of Work">
        <FullRow>
          <label className="text-xs text-neutral-600 block mb-1">Intro</label>
          <textarea
            rows={3}
            className="w-full border border-neutral-300 rounded px-2 py-1 text-sm"
            value={scope.intro || ''}
            onChange={(e) => set('scope_of_work.intro', e.target.value)}
          />
        </FullRow>
        <PresetLibrary payload={payload} onSave={set} />
        {groups.length === 0 && (
          <div className="p-3 text-xs text-neutral-500 border border-dashed border-neutral-300 rounded text-center">
            No scope groups yet. Add one below, use a preset, or ask the agent to generate.
          </div>
        )}
        {groups.map((g, gi) => (
          <GroupBlock
            key={gi}
            group={g}
            groupIdx={gi}
            groupsCount={groups.length}
            onSave={set}
            doc={doc}
          />
        ))}
        <button
          type="button"
          onClick={() => set('scope_of_work.groups', [...groups, { category: 'New category', tasks: [] }])}
          className="text-xs text-sunvic-700 hover:underline"
        >
          + Add group
        </button>
      </Section>

      <Section title="Payment">
        <Row>
          <LockableField
            label="Labor $"
            type="number"
            value={centsToDollars(payload.payment?.labor_cost_cents)}
            onChange={(v) => set('payment.labor_cost_cents', dollarsToCents(v))}
          />
          <LockableField
            label="Materials $"
            type="number"
            value={centsToDollars(payload.payment?.materials_cost_cents)}
            onChange={(v) => set('payment.materials_cost_cents', dollarsToCents(v))}
          />
        </Row>
        <FullRow>
          <LockableField
            label="Total $"
            type="number"
            value={centsToDollars(payload.payment?.total_cents)}
            onChange={(v) => set('payment.total_cents', dollarsToCents(v))}
          />
        </FullRow>
        <label className="text-xs text-neutral-600 block mb-1">Schedule</label>
        <ScheduleTable payload={payload} onSave={set} />
        <div className="mt-2">
          <label className="text-xs text-neutral-600 block mb-1">Method</label>
          <select
            className="w-full border border-neutral-300 rounded px-2 py-1 text-sm"
            value={payload.payment?.method || 'check'}
            onChange={(e) => set('payment.method', e.target.value)}
          >
            <option value="check">Check</option>
            <option value="wire">Wire</option>
            <option value="credit_card">Credit card</option>
          </select>
        </div>
        <FullRow>
          <label className="text-xs text-neutral-600 block mb-1 mt-2">Notes</label>
          <textarea
            rows={2}
            className="w-full border border-neutral-300 rounded px-2 py-1 text-sm"
            value={payload.payment?.notes || ''}
            onChange={(e) => set('payment.notes', e.target.value)}
          />
        </FullRow>
      </Section>

      <Section title="Timeline">
        <Row>
          <LockableField
            label="Start date"
            type="date"
            value={fmtDate(payload.timeline?.start_date)}
            onChange={(v) => set('timeline.start_date', v)}
          />
          <LockableField
            label="Final date"
            type="date"
            value={fmtDate(payload.timeline?.final_completion_date)}
            onChange={(v) => set('timeline.final_completion_date', v)}
          />
        </Row>
        <FullRow>
          <LockableField
            label="Substantial completion"
            type="date"
            value={fmtDate(payload.timeline?.substantial_completion_date)}
            onChange={(v) => set('timeline.substantial_completion_date', v)}
          />
        </FullRow>
        <FullRow>
          <label className="text-xs text-neutral-600 block mb-1">Disclaimer</label>
          <textarea
            rows={2}
            className="w-full border border-neutral-300 rounded px-2 py-1 text-sm"
            value={payload.timeline?.disclaimer || ''}
            onChange={(e) => set('timeline.disclaimer', e.target.value)}
          />
        </FullRow>
      </Section>

      <Section title="Contractor">
        <LockableField
          label="Name"
          value={payload.contractor?.name || ''}
          onChange={(v) => set('contractor.name', v)}
        />
        <Row>
          <LockableField
            label="Phone"
            value={payload.contractor?.phone || ''}
            onChange={(v) => set('contractor.phone', v)}
          />
          <LockableField
            label="Email"
            value={payload.contractor?.email || ''}
            onChange={(v) => set('contractor.email', v)}
          />
        </Row>
        <LockableField
          label="License No"
          value={payload.contractor?.license_no || ''}
          onChange={(v) => set('contractor.license_no', v)}
        />
      </Section>
    </div>
  );
}
