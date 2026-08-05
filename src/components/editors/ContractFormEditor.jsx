import React, { useState } from 'react';
import { Accordion, AccordionItem } from '../ui/Accordion.jsx';
import { FieldRow, TextField } from '../ui/FieldRow.jsx';
import { MoneyInput, formatUSD } from '../ui/MoneyInput.jsx';
import { CONTRACT_FORM_TABS, blocksFor } from '../doc/docSections.js';
import { scheduleSum, laborMaterialsDrift } from './formMath.js';
import { getScopePreset, DEFAULT_SCOPE_QTY } from '../../../packages/templates/defaults.js';

// Contract form, rebuilt mobile-first.
//
// What changed and why:
//  * `section` prop — the document screen renders one sub-tab at a time on a phone, so a
//    390px screen shows four fields instead of seven stacked sections. Desktop passes
//    null and still gets everything.
//  * Review-first rows — the agent fills the document, so a field's resting state is a
//    readable line, not an input box. Tap to edit.
//  * No 12-column grids. Scope tasks and payment milestones were four inputs side by
//    side; each was ~60px wide on a phone. They now stack.
//  * Money is entered in dollars, never raw cents.
//  * The default scope quantity carried a misspelling of "Lump Sum" that printed on
//    signed contracts. It now comes from DEFAULT_SCOPE_QTY.
//  * The Contractor section wrote `contractor.name` and `contractor.license_no`. Neither
//    path exists in the schema and neither is read by the PDF, so every edit made there
//    was silently discarded. Rebound to `legal_name` / `license_number`.

// ── small helpers ────────────────────────────────────────────

function useSavePath(onSave) {
  return (path, value) => onSave({ [path]: value });
}

function fmtDate(v) {
  if (!v) return '';
  const d = String(v);
  return d.length >= 10 ? d.slice(0, 10) : d;
}

function humanDate(v) {
  const d = fmtDate(v);
  if (!d) return '';
  const parsed = new Date(`${d}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Lock affordance. Previously a bare icon next to a 10px label; now an explicit control
// that only appears once a row is open, so the resting list stays readable.
function LockToggle({ locked, onToggle }) {
  if (!onToggle) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 min-h-[36px] ${
        locked ? 'bg-sunvic-50 text-sunvic-700 border border-sunvic-200' : 'text-neutral-500 border border-neutral-200'
      }`}
    >
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4.5" y="10.5" width="15" height="11" rx="2.5" />
        {locked ? <path d="M8 10.5V7a4 4 0 018 0v3.5" /> : <path d="M8 10.5V7a4 4 0 017.4-2.1" />}
      </svg>
      {locked ? 'Locked — the copilot will not change this' : 'Lock this field'}
    </button>
  );
}

// Rarely-touched fields hide behind this so the common path stays short.
export function Advanced({ children, label = 'Advanced' }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 min-h-[44px] text-left text-xs font-medium text-neutral-500"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {label}
      </button>
      {open && <div className="border-t border-neutral-100">{children}</div>}
    </div>
  );
}

function Card({ children, className = '' }) {
  return <div className={`border border-neutral-200 rounded-xl bg-white ${className}`}>{children}</div>;
}

// ── scope of work ────────────────────────────────────────────

function TaskCard({ task, groupIdx, taskIdx, groups, onSave }) {
  const [open, setOpen] = useState(false);

  function edit(patch) {
    const next = groups.map((g, gi) =>
      gi !== groupIdx ? g : { ...g, tasks: (g.tasks || []).map((t, ti) => (ti !== taskIdx ? t : { ...t, ...patch })) }
    );
    onSave('scope_of_work.groups', next);
  }
  function remove() {
    const next = groups.map((g, gi) =>
      gi !== groupIdx ? g : { ...g, tasks: (g.tasks || []).filter((_, ti) => ti !== taskIdx) }
    );
    onSave('scope_of_work.groups', next);
  }

  const bullets = Array.isArray(task.description) ? task.description : [];

  return (
    <div className="border border-neutral-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-3 min-h-[56px] text-left active:bg-neutral-50"
      >
        <div className="flex-1 min-w-0">
          <div className={`text-[15px] truncate ${task.task ? 'text-neutral-900' : 'text-neutral-400 italic'}`}>
            {task.task || 'Untitled item'}
          </div>
          <div className="text-xs text-neutral-500 mt-0.5">
            {task.qty || DEFAULT_SCOPE_QTY}
            {bullets.length > 0 ? ` · ${bullets.length} detail${bullets.length === 1 ? '' : 's'}` : ''}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[15px] font-semibold tabular-nums text-neutral-900">
            {formatUSD(task.amount_cents)}
          </div>
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-neutral-100">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium">What is being done</label>
            <TextField
              value={task.task || ''}
              onChange={(v) => edit({ task: v })}
              placeholder="e.g. Kitchen cabinets"
            />
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium">Price</label>
            <p className="text-xs text-neutral-500 mb-1.5 leading-snug">
              What the homeowner pays for this item. Both the unit price and the line total are set together
              because scope items are priced as one fixed amount.
            </p>
            <MoneyInput
              valueCents={task.amount_cents}
              aria-label="Item price"
              onChangeCents={(c) => edit({ amount_cents: c, unit_price_cents: c })}
            />
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium">Details</label>
            <p className="text-xs text-neutral-500 mb-1.5 leading-snug">One line per bullet as it appears on the contract.</p>
            <TextField
              multiline
              rows={4}
              value={bullets.join('\n')}
              onChange={(v) => edit({ description: v.split('\n').filter((x) => x.trim() !== '') })}
              placeholder={'Remove existing cabinets\nInstall new shaker cabinets'}
            />
          </div>

          <Advanced label="Quantity">
            <div className="pt-2">
              <p className="text-xs text-neutral-500 mb-1.5 leading-snug">
                Most jobs are priced as one flat amount, which prints as “{DEFAULT_SCOPE_QTY}”. Change this only
                when the item is genuinely billed per unit (for example “480 sq ft”).
              </p>
              <TextField
                value={task.qty ?? DEFAULT_SCOPE_QTY}
                onChange={(v) => edit({ qty: v })}
                placeholder={DEFAULT_SCOPE_QTY}
              />
            </div>
          </Advanced>

          <button
            type="button"
            onClick={remove}
            className="w-full min-h-[44px] rounded-xl border border-rose-200 text-rose-600 text-sm active:bg-rose-50"
          >
            Remove this item
          </button>
        </div>
      )}
    </div>
  );
}

function GroupBlock({ group, groupIdx, groups, onSave }) {
  const tasks = group.tasks || [];
  const subtotal = tasks.reduce((a, t) => a + (Number(t.amount_cents) || 0), 0);

  function setGroup(patch) {
    onSave('scope_of_work.groups', groups.map((g, gi) => (gi === groupIdx ? { ...g, ...patch } : g)));
  }
  function addTask() {
    setGroup({
      tasks: [...tasks, { task: '', description: [], qty: DEFAULT_SCOPE_QTY, unit_price_cents: 0, amount_cents: 0 }],
    });
  }
  function removeGroup() {
    onSave('scope_of_work.groups', groups.filter((_, gi) => gi !== groupIdx));
  }

  return (
    <Card className="p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <input
          value={group.category || ''}
          onChange={(e) => setGroup({ category: e.target.value })}
          placeholder="Area of the job, e.g. Interiors"
          className="flex-1 min-w-0 min-h-[44px] rounded-xl border border-neutral-300 px-3 text-base font-medium focus:border-sunvic-500 focus:ring-2 focus:ring-sunvic-200 focus:outline-none"
        />
        <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-neutral-700">{formatUSD(subtotal)}</span>
      </div>

      {tasks.length === 0 ? (
        <p className="text-xs text-neutral-500 px-1 py-2">No items in this area yet.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t, ti) => (
            <TaskCard key={ti} task={t} groupIdx={groupIdx} taskIdx={ti} groups={groups} onSave={onSave} />
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={addTask}
          className="flex-1 min-h-[44px] rounded-xl border border-neutral-300 text-sm text-neutral-700 active:bg-neutral-50"
        >
          + Add item
        </button>
        <button
          type="button"
          onClick={removeGroup}
          aria-label="Remove area"
          className="flex-shrink-0 w-11 min-h-[44px] rounded-xl border border-neutral-200 text-neutral-400 active:bg-neutral-50"
        >
          ✕
        </button>
      </div>
    </Card>
  );
}

// ── payment schedule ─────────────────────────────────────────

function ScheduleEditor({ payload, onSave }) {
  const schedule = payload.payment?.schedule || [];
  const totalCents = Number(payload.payment?.total_cents) || 0;
  const sum = scheduleSum(schedule);
  const balanced = Math.abs(sum - 100) < 0.01;

  function update(next) { onSave('payment.schedule', next); }
  function edit(i, patch) { update(schedule.map((r, idx) => (idx === i ? { ...r, ...patch } : r))); }
  function remove(i) { update(schedule.filter((_, idx) => idx !== i)); }
  function add() { update([...schedule, { milestone: '', percent: 0, condition: '' }]); }

  return (
    <div className="space-y-2">
      <div
        className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${
          balanced ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900 border border-amber-200'
        }`}
      >
        <span>{balanced ? 'Schedule adds up' : 'Schedule does not add up'}</span>
        <span className="font-semibold tabular-nums">{sum.toFixed(2)}% of 100%</span>
      </div>

      {schedule.length === 0 && (
        <p className="text-xs text-neutral-500 px-1 py-2">
          No payment milestones yet. Ask the copilot for the standard Sunvic schedule, or add them below.
        </p>
      )}

      {schedule.map((row, i) => (
        <Card key={i} className="p-3 space-y-2.5">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium">Payment name</label>
            <TextField
              value={row.milestone || ''}
              onChange={(v) => edit(i, { milestone: v })}
              placeholder="e.g. Deposit"
            />
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1 min-w-0">
              <label className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium">Percent of total</label>
              <input
                inputMode="decimal"
                type="text"
                value={row.percent ?? ''}
                onChange={(e) => {
                  const clean = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
                  edit(i, { percent: clean === '' ? 0 : Number(clean) });
                }}
                className="w-full min-h-[48px] rounded-xl border border-neutral-300 px-3 text-base tabular-nums focus:border-sunvic-500 focus:ring-2 focus:ring-sunvic-200 focus:outline-none"
              />
            </div>
            <div className="flex-shrink-0 pb-3 text-sm text-neutral-600 tabular-nums">
              = {formatUSD(Math.round((totalCents * (Number(row.percent) || 0)) / 100))}
            </div>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium">When it is due</label>
            <TextField
              value={row.condition || ''}
              onChange={(v) => edit(i, { condition: v })}
              placeholder="e.g. Upon signing this agreement"
            />
          </div>
          <button
            type="button"
            onClick={() => remove(i)}
            className="w-full min-h-[44px] rounded-xl border border-rose-200 text-rose-600 text-sm active:bg-rose-50"
          >
            Remove payment
          </button>
        </Card>
      ))}

      <button
        type="button"
        onClick={add}
        className="w-full min-h-[44px] rounded-xl border border-neutral-300 text-sm text-neutral-700 active:bg-neutral-50"
      >
        + Add payment
      </button>
    </div>
  );
}

// ── blocks ───────────────────────────────────────────────────

function CoverBlock({ payload, locks, set, onToggleLock }) {
  return (
    <Card>
      <FieldRow label="Job number" value={payload.job_no} hint="Your internal reference for this job.">
        <TextField value={payload.job_no || ''} onChange={(v) => set('job_no', v)} />
        <LockToggle locked={!!locks['job_no']} onToggle={onToggleLock && (() => onToggleLock('job_no'))} />
      </FieldRow>
      <FieldRow label="Prepared on" value={humanDate(payload.prepared_on)}>
        <TextField type="date" value={fmtDate(payload.prepared_on)} onChange={(v) => set('prepared_on', v)} />
        <LockToggle locked={!!locks['prepared_on']} onToggle={onToggleLock && (() => onToggleLock('prepared_on'))} />
      </FieldRow>
      <Advanced>
        <FieldRow label="Cover heading" value={payload.for_label} hint="The line that appears under “Prepared for” on the cover page.">
          <TextField value={payload.for_label || ''} onChange={(v) => set('for_label', v)} />
          <LockToggle locked={!!locks['for_label']} onToggle={onToggleLock && (() => onToggleLock('for_label'))} />
        </FieldRow>
        <FieldRow label="Contract type" value={payload.contract_type} hint="Printed on the cover page. Leave as the standard fixed-price wording unless this job is billed differently.">
          <TextField value={payload.contract_type || ''} onChange={(v) => set('contract_type', v)} />
          <LockToggle locked={!!locks['contract_type']} onToggle={onToggleLock && (() => onToggleLock('contract_type'))} />
        </FieldRow>
      </Advanced>
    </Card>
  );
}

function HomeownerBlock({ payload, locks, set, onToggleLock }) {
  const h = payload.homeowner || {};
  return (
    <Card>
      <FieldRow label="Full name" value={h.name} required hint="Exactly as it should appear on the signature page.">
        <TextField value={h.name || ''} onChange={(v) => set('homeowner.name', v)} placeholder="Jane Smith" />
        <LockToggle locked={!!locks['homeowner.name']} onToggle={onToggleLock && (() => onToggleLock('homeowner.name'))} />
      </FieldRow>
      <FieldRow label="Job address" value={h.address} required hint="Where the work happens. This is the address printed on the contract.">
        <TextField multiline rows={2} value={h.address || ''} onChange={(v) => set('homeowner.address', v)} placeholder="12 Maple Ave, Edison, NJ 08817" />
        <LockToggle locked={!!locks['homeowner.address']} onToggle={onToggleLock && (() => onToggleLock('homeowner.address'))} />
      </FieldRow>
      <FieldRow label="Phone" value={h.phone}>
        <TextField type="tel" value={h.phone || ''} onChange={(v) => set('homeowner.phone', v)} />
        <LockToggle locked={!!locks['homeowner.phone']} onToggle={onToggleLock && (() => onToggleLock('homeowner.phone'))} />
      </FieldRow>
      <FieldRow label="Email" value={h.email} hint="Used when you email this document.">
        <TextField type="email" value={h.email || ''} onChange={(v) => set('homeowner.email', v)} />
        <LockToggle locked={!!locks['homeowner.email']} onToggle={onToggleLock && (() => onToggleLock('homeowner.email'))} />
      </FieldRow>
    </Card>
  );
}

function ContractorBlock({ payload, set }) {
  const c = payload.contractor || {};
  return (
    <Card>
      <p className="px-3 pt-3 text-xs text-neutral-500 leading-snug">
        Filled from your business settings. Change these only if this job is issued under different details.
      </p>
      <FieldRow label="Legal name" value={c.legal_name}>
        <TextField value={c.legal_name || ''} onChange={(v) => set('contractor.legal_name', v)} />
      </FieldRow>
      <FieldRow label="License number" value={c.license_number} hint="NJ Home Improvement Contractor registration number.">
        <TextField value={c.license_number || ''} onChange={(v) => set('contractor.license_number', v)} />
      </FieldRow>
      <Advanced>
        <FieldRow label="Address" value={c.address}>
          <TextField multiline rows={2} value={c.address || ''} onChange={(v) => set('contractor.address', v)} />
        </FieldRow>
        <FieldRow label="Phone" value={c.phone}>
          <TextField type="tel" value={c.phone || ''} onChange={(v) => set('contractor.phone', v)} />
        </FieldRow>
        <FieldRow label="Email" value={c.email}>
          <TextField type="email" value={c.email || ''} onChange={(v) => set('contractor.email', v)} />
        </FieldRow>
        <FieldRow label="Website" value={c.website}>
          <TextField value={c.website || ''} onChange={(v) => set('contractor.website', v)} />
        </FieldRow>
      </Advanced>
    </Card>
  );
}

function AgreementBlock({ payload, set }) {
  const a = payload.agreement_summary || {};
  return (
    <Card>
      <FieldRow
        label="Opening paragraph"
        value={a.text ? `${String(a.text).slice(0, 60)}…` : ''}
        hint="The full body of Section A, not a short recap. Standard Sunvic wording is filled in for you."
      >
        <TextField multiline rows={8} value={a.text || ''} onChange={(v) => set('agreement_summary.text', v)} />
      </FieldRow>
      <FieldRow label="Scope recap" value={a.scope_recap} hint="One short paragraph describing the job in plain language.">
        <TextField multiline rows={3} value={a.scope_recap || ''} onChange={(v) => set('agreement_summary.scope_recap', v)} />
      </FieldRow>
      <FieldRow
        label="Time to start"
        value={a.weeks_to_start != null ? `${a.weeks_to_start} weeks after signing` : ''}
        hint="How long after the deposit clears before crews arrive."
      >
        <TextField
          type="number"
          value={a.weeks_to_start ?? ''}
          onChange={(v) => set('agreement_summary.weeks_to_start', Number(v) || 0)}
        />
      </FieldRow>
      <FieldRow
        label="Time to finish"
        value={a.months_to_complete != null ? `${a.months_to_complete} months` : ''}
        hint="Estimated duration once work starts."
      >
        <TextField
          type="number"
          value={a.months_to_complete ?? ''}
          onChange={(v) => set('agreement_summary.months_to_complete', Number(v) || 0)}
        />
      </FieldRow>
    </Card>
  );
}

function ScopeBlock({ payload, set }) {
  const scope = payload.scope_of_work || {};
  const groups = scope.groups || [];
  return (
    <div className="space-y-3">
      <Card>
        <FieldRow label="Scope introduction" value={scope.intro ? `${String(scope.intro).slice(0, 60)}…` : ''} hint="One paragraph summarising everything covered.">
          <TextField multiline rows={4} value={scope.intro || ''} onChange={(v) => set('scope_of_work.intro', v)} />
        </FieldRow>
      </Card>

      {groups.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center">
          <p className="text-sm text-neutral-600">No work areas yet.</p>
          <p className="text-xs text-neutral-500 mt-1">Ask the copilot below to build the scope, or add an area manually.</p>
        </div>
      )}

      {groups.map((g, gi) => (
        <GroupBlock key={gi} group={g} groupIdx={gi} groups={groups} onSave={set} />
      ))}

      <button
        type="button"
        onClick={() => set('scope_of_work.groups', [...groups, { category: '', tasks: [] }])}
        className="w-full min-h-[48px] rounded-xl border border-neutral-300 text-sm font-medium text-neutral-700 active:bg-neutral-50"
      >
        + Add work area
      </button>

      <Advanced label="Start from a preset">
        <div className="p-3">
          <select
            className="w-full min-h-[48px] rounded-xl border border-neutral-300 px-3 text-base"
            defaultValue=""
            onChange={(e) => {
              const id = e.target.value;
              e.target.value = '';
              if (!id) return;
              const preset = getScopePreset(id);
              if (!preset.length) return;
              set('scope_of_work.groups', [...groups, ...preset]);
            }}
          >
            <option value="">Choose a preset…</option>
            <option value="full_addition">Full addition — demo, foundation, framing, finishes</option>
          </select>
        </div>
      </Advanced>
    </div>
  );
}

function PaymentBlock({ payload, set }) {
  const pay = payload.payment || {};
  const labor = Number(pay.labor_cost_cents) || 0;
  const materials = Number(pay.materials_cost_cents) || 0;
  const total = Number(pay.total_cents) || 0;
  const parts = labor + materials;
  const drift = laborMaterialsDrift(pay);
  const mismatch = Math.abs(drift) > 100;

  return (
    <div className="space-y-3">
      <Card>
        <FieldRow label="Contract total" value={total ? formatUSD(total) : ''} required hint="The full price the homeowner pays.">
          <MoneyInput valueCents={total} aria-label="Contract total" onChangeCents={(c) => set('payment.total_cents', c)} />
        </FieldRow>
        <FieldRow label="Labor" value={labor ? formatUSD(labor) : ''} hint="Labor portion of the total. Used for the cost breakdown and for sales-tax treatment.">
          <MoneyInput valueCents={labor} aria-label="Labor cost" onChangeCents={(c) => set('payment.labor_cost_cents', c)} />
        </FieldRow>
        <FieldRow label="Materials" value={materials ? formatUSD(materials) : ''} hint="Materials portion of the total. New Jersey sales tax applies to materials only.">
          <MoneyInput valueCents={materials} aria-label="Materials cost" onChangeCents={(c) => set('payment.materials_cost_cents', c)} />
        </FieldRow>
      </Card>

      {mismatch && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-900">
          Labor plus materials is {formatUSD(parts)}, but the contract total is {formatUSD(total)} — a difference of{' '}
          {formatUSD(Math.abs(parts - total))}.
        </div>
      )}

      <div>
        <h4 className="text-xs uppercase tracking-wide text-neutral-500 font-semibold px-1 mb-2">Payment schedule</h4>
        <ScheduleEditor payload={payload} onSave={set} />
      </div>

      <Card>
        <FieldRow label="How they pay" value={{ check: 'Check', ach: 'Bank transfer (ACH)', card: 'Credit or debit card' }[pay.method] || 'Check'}>
          <select
            value={pay.method || 'check'}
            onChange={(e) => set('payment.method', e.target.value)}
            className="w-full min-h-[48px] rounded-xl border border-neutral-300 px-3 text-base"
          >
            <option value="check">Check</option>
            <option value="ach">Bank transfer (ACH)</option>
            <option value="card">Credit or debit card</option>
          </select>
        </FieldRow>
        <FieldRow label="Payment notes" value={pay.notes}>
          <TextField multiline rows={3} value={pay.notes || ''} onChange={(v) => set('payment.notes', v)} />
        </FieldRow>
      </Card>
    </div>
  );
}

function TimelineBlock({ payload, set }) {
  const t = payload.timeline || {};
  return (
    <Card>
      <FieldRow label="Start date" value={humanDate(t.start_date)} required hint="When crews are expected on site.">
        <TextField type="date" value={fmtDate(t.start_date)} onChange={(v) => set('timeline.start_date', v || null)} />
      </FieldRow>
      <FieldRow label="Substantial completion" value={humanDate(t.substantial_completion_date)} hint="When the home is usable, even if punch-list items remain.">
        <TextField type="date" value={fmtDate(t.substantial_completion_date)} onChange={(v) => set('timeline.substantial_completion_date', v || null)} />
      </FieldRow>
      <FieldRow label="Final completion" value={humanDate(t.final_completion_date)} hint="When everything, including punch list, is done.">
        <TextField type="date" value={fmtDate(t.final_completion_date)} onChange={(v) => set('timeline.final_completion_date', v || null)} />
      </FieldRow>
      <Advanced>
        <FieldRow label="Timeline disclaimer" value={t.disclaimer ? `${String(t.disclaimer).slice(0, 60)}…` : ''} hint="Standard wording about weather and permit delays.">
          <TextField multiline rows={4} value={t.disclaimer || ''} onChange={(v) => set('timeline.disclaimer', v)} />
        </FieldRow>
      </Advanced>
    </Card>
  );
}

// ── shell ────────────────────────────────────────────────────

const BLOCK_ORDER = ['cover', 'homeowner', 'contractor', 'agreement_summary', 'scope_of_work', 'payment', 'timeline'];

export function ContractFormEditor({ doc, onSave, onToggleLock, section = null }) {
  const payload = doc?.payload || {};
  const locks = doc?.locks || {};
  const set = useSavePath(onSave);

  const allowed = blocksFor(CONTRACT_FORM_TABS, section);
  const visible = BLOCK_ORDER.filter((id) => !allowed || allowed.includes(id));

  const scopeGroups = payload.scope_of_work?.groups || [];
  const taskCount = scopeGroups.reduce((a, g) => a + (g.tasks || []).length, 0);
  const sum = scheduleSum(payload.payment?.schedule);
  const scheduleOff = Math.abs(sum - 100) >= 0.01;
  const h = payload.homeowner || {};
  const homeownerIncomplete = !h.name || !h.address;

  const meta = {
    cover: { title: 'Document details', subtitle: payload.job_no ? `Job ${payload.job_no}` : 'No job number' },
    homeowner: {
      title: 'Homeowner',
      subtitle: h.name || 'Name and address needed',
      warn: homeownerIncomplete,
      badge: homeownerIncomplete ? 'Incomplete' : null,
    },
    contractor: { title: 'Your company', subtitle: payload.contractor?.legal_name || '' },
    agreement_summary: { title: 'Agreement summary', subtitle: 'Section A opening language' },
    scope_of_work: {
      title: 'Scope of work',
      subtitle: scopeGroups.length
        ? `${scopeGroups.length} area${scopeGroups.length === 1 ? '' : 's'} · ${taskCount} item${taskCount === 1 ? '' : 's'}`
        : 'Nothing added yet',
      badge: taskCount || null,
    },
    payment: {
      title: 'Payment',
      subtitle: payload.payment?.total_cents ? formatUSD(payload.payment.total_cents) : 'No total set',
      warn: scheduleOff,
      badge: scheduleOff ? `${sum.toFixed(0)}%` : null,
    },
    timeline: { title: 'Timeline', subtitle: humanDate(payload.timeline?.start_date) || 'No start date' },
  };

  function renderBlock(id) {
    switch (id) {
      case 'cover': return <CoverBlock payload={payload} locks={locks} set={set} onToggleLock={onToggleLock} />;
      case 'homeowner': return <HomeownerBlock payload={payload} locks={locks} set={set} onToggleLock={onToggleLock} />;
      case 'contractor': return <ContractorBlock payload={payload} set={set} />;
      case 'agreement_summary': return <AgreementBlock payload={payload} set={set} />;
      case 'scope_of_work': return <ScopeBlock payload={payload} set={set} />;
      case 'payment': return <PaymentBlock payload={payload} set={set} />;
      case 'timeline': return <TimelineBlock payload={payload} set={set} />;
      default: return null;
    }
  }

  return (
    <div className="p-3">
      <Accordion defaultOpen={visible[0] || null}>
        {visible.map((id) => {
          const m = meta[id] || { title: id };
          return (
            <AccordionItem key={id} id={id} title={m.title} subtitle={m.subtitle} badge={m.badge} warn={!!m.warn}>
              {renderBlock(id)}
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
