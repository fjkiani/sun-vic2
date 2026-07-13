import React from 'react';
import { InlineEditable } from './InlineEditable.jsx';

function fmtCurrency(cents) {
  if (cents == null || cents === '') return '';
  const dollars = Number(cents) / 100;
  return dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function parseCurrency(text) {
  if (!text) return 0;
  const cleaned = String(text).replace(/[^0-9.\-]/g, '');
  const dollars = Number(cleaned) || 0;
  return Math.round(dollars * 100);
}

function SectionHeader({ letter, title }) {
  return (
    <div className="mt-6 mb-3 border-b-2 border-neutral-900 pb-1">
      <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
        {letter && <span className="mr-2">SECTION {letter}.</span>}
        {title}
      </h2>
    </div>
  );
}

function Field({ label, path, value, onSave, locked, multiline = false, className = '' }) {
  return (
    <div className={`mb-1 ${className}`}>
      {label && <span className="text-[10px] uppercase text-neutral-500 mr-2">{label}:</span>}
      <InlineEditable
        value={value || ''}
        placeholder={`(${label || 'text'})`}
        multiline={multiline}
        locked={locked}
        onSave={(v) => onSave(path, v)}
        as="span"
      />
    </div>
  );
}

function HeaderBlock({ payload, save, locks }) {
  return (
    <div className="grid grid-cols-2 gap-6 mb-4 pb-4 border-b border-neutral-300">
      <div>
        <div className="text-lg font-bold uppercase">Sunvic Home Remodeling</div>
        <div className="text-xs text-neutral-700">
          <Field label="Address" path="contractor.address_line_1" value={payload.contractor?.address_line_1} onSave={save} locked={locks['contractor.address_line_1']} />
          <Field label="Address 2" path="contractor.address_line_2" value={payload.contractor?.address_line_2} onSave={save} locked={locks['contractor.address_line_2']} />
          <Field label="Phone" path="contractor.phone" value={payload.contractor?.phone} onSave={save} locked={locks['contractor.phone']} />
          <Field label="Email" path="contractor.email" value={payload.contractor?.email} onSave={save} locked={locks['contractor.email']} />
          <Field label="License" path="contractor.license_no" value={payload.contractor?.license_no} onSave={save} locked={locks['contractor.license_no']} />
        </div>
      </div>
      <div>
        <div className="text-xs text-neutral-700">
          <Field label="Job No" path="job_no" value={payload.job_no} onSave={save} locked={locks['job_no']} />
          <Field label="Prepared On" path="prepared_on" value={payload.prepared_on} onSave={save} locked={locks['prepared_on']} />
          <Field label="Contract" path="contract_type" value={payload.contract_type} onSave={save} locked={locks['contract_type']} />
        </div>
        <div className="mt-3 border-t border-neutral-300 pt-2">
          <div className="text-[10px] uppercase text-neutral-500 mb-1">Homeowner</div>
          <Field path="homeowner.name" value={payload.homeowner?.name} onSave={save} locked={locks['homeowner.name']} className="font-semibold" />
          <Field path="homeowner.address" value={payload.homeowner?.address} onSave={save} locked={locks['homeowner.address']} />
          <Field label="Phone" path="homeowner.phone" value={payload.homeowner?.phone} onSave={save} locked={locks['homeowner.phone']} />
          <Field label="Email" path="homeowner.email" value={payload.homeowner?.email} onSave={save} locked={locks['homeowner.email']} />
        </div>
      </div>
    </div>
  );
}

function ScopeBlock({ payload, save, locks }) {
  const scope = payload.scope_of_work || {};
  const groups = scope.groups || [];

  const setGroups = (next) => save('scope_of_work.groups', next);

  const addGroup = () => setGroups([...groups, { category: 'New Category', tasks: [] }]);
  const deleteGroup = (gi) => setGroups(groups.filter((_, i) => i !== gi));
  const addTask = (gi) =>
    setGroups(groups.map((g, i) => i === gi ? { ...g, tasks: [...(g.tasks || []), { task: 'New task', description: [], qty: 'Lump Sump', unit_price_cents: 0, amount_cents: 0 }] } : g));
  const deleteTask = (gi, ti) =>
    setGroups(groups.map((g, i) => i === gi ? { ...g, tasks: (g.tasks || []).filter((_, x) => x !== ti) } : g));
  const addBullet = (gi, ti) =>
    setGroups(groups.map((g, i) => i === gi ? {
      ...g,
      tasks: g.tasks.map((t, x) => x === ti ? { ...t, description: [...(t.description || []), 'New bullet'] } : t)
    } : g));
  const deleteBullet = (gi, ti, di) =>
    setGroups(groups.map((g, i) => i === gi ? {
      ...g,
      tasks: g.tasks.map((t, x) => x === ti ? { ...t, description: (t.description || []).filter((_, y) => y !== di) } : t)
    } : g));

  return (
    <div>
      <SectionHeader letter="B" title="Scope of Work" />
      <div className="mb-3 text-xs">
        <InlineEditable
          value={scope.intro || ''}
          onSave={(v) => save('scope_of_work.intro', v)}
          multiline
          placeholder="(intro paragraph)"
          as="p"
          className="text-neutral-700 leading-relaxed"
        />
      </div>

      {groups.length === 0 && (
        <div className="border-2 border-dashed border-neutral-300 rounded p-6 text-center text-xs text-neutral-500 my-4">
          No scope groups yet. Use the form on the left, insert a preset, or ask the agent to generate.
        </div>
      )}

      {groups.length > 0 && (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b-2 border-neutral-800 bg-neutral-100">
              <th className="text-left p-1 w-1/2">Task</th>
              <th className="text-left p-1 w-1/6">Qty</th>
              <th className="text-right p-1 w-1/6">Unit $</th>
              <th className="text-right p-1 w-1/6">Amount</th>
              <th className="w-6"></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => (
              <React.Fragment key={gi}>
                <tr className="bg-neutral-200 group">
                  <td colSpan={5} className="p-1 font-semibold uppercase text-xs">
                    <InlineEditable
                      value={g.category || ''}
                      onSave={(v) => save(`scope_of_work.groups.${gi}.category`, v)}
                      placeholder="(category)"
                    />
                    <button
                      onClick={() => deleteGroup(gi)}
                      className="ml-2 text-red-600 text-[10px] opacity-0 group-hover:opacity-100"
                      title="Delete group"
                    >
                      × group
                    </button>
                    <button
                      onClick={() => addTask(gi)}
                      className="ml-2 text-sunvic-700 text-[10px] opacity-0 group-hover:opacity-100"
                    >
                      + task
                    </button>
                  </td>
                </tr>
                {(g.tasks || []).map((t, ti) => (
                  <tr key={ti} className="border-b border-neutral-200 align-top group">
                    <td className="p-1">
                      <div className="font-medium">
                        <InlineEditable
                          value={t.task || ''}
                          onSave={(v) => save(`scope_of_work.groups.${gi}.tasks.${ti}.task`, v)}
                          placeholder="(task)"
                        />
                        <button
                          onClick={() => deleteTask(gi, ti)}
                          className="ml-2 text-red-600 text-[10px] opacity-0 group-hover:opacity-100"
                        >
                          ×
                        </button>
                      </div>
                      <ul className="ml-4 mt-1 list-disc text-[11px] text-neutral-700">
                        {(t.description || []).map((d, di) => (
                          <li key={di} className="group/bullet">
                            <InlineEditable
                              value={d}
                              onSave={(v) => save(`scope_of_work.groups.${gi}.tasks.${ti}.description.${di}`, v)}
                              placeholder="(bullet)"
                            />
                            <button
                              onClick={() => deleteBullet(gi, ti, di)}
                              className="ml-1 text-red-500 text-[10px] opacity-0 group-hover/bullet:opacity-100"
                            >
                              ×
                            </button>
                          </li>
                        ))}
                        <li>
                          <button
                            onClick={() => addBullet(gi, ti)}
                            className="text-[10px] text-sunvic-700"
                          >
                            + bullet
                          </button>
                        </li>
                      </ul>
                    </td>
                    <td className="p-1">
                      <InlineEditable
                        value={t.qty || ''}
                        onSave={(v) => save(`scope_of_work.groups.${gi}.tasks.${ti}.qty`, v)}
                        placeholder="Qty"
                      />
                    </td>
                    <td className="p-1 text-right">
                      <InlineEditable
                        value={fmtCurrency(t.unit_price_cents)}
                        onSave={(v) => save(`scope_of_work.groups.${gi}.tasks.${ti}.unit_price_cents`, parseCurrency(v))}
                        placeholder="$0.00"
                      />
                    </td>
                    <td className="p-1 text-right">
                      <InlineEditable
                        value={fmtCurrency(t.amount_cents)}
                        onSave={(v) => save(`scope_of_work.groups.${gi}.tasks.${ti}.amount_cents`, parseCurrency(v))}
                        placeholder="$0.00"
                      />
                    </td>
                    <td></td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-2">
        <button onClick={addGroup} className="text-xs text-sunvic-700 hover:underline">
          + Add group
        </button>
      </div>
    </div>
  );
}

function PaymentBlock({ payload, save }) {
  const payment = payload.payment || { schedule: [] };
  const sched = payment.schedule || [];
  const sum = sched.reduce((a, m) => a + (Number(m.percent) || 0), 0);
  const sumOk = Math.abs(sum - 100) < 0.01;

  const setSched = (next) => save('payment.schedule', next);

  return (
    <div>
      <SectionHeader letter="C" title="Payment" />
      <div className="text-xs mb-3">
        <div>Labor: <InlineEditable value={fmtCurrency(payment.labor_cost_cents)} onSave={(v) => save('payment.labor_cost_cents', parseCurrency(v))} placeholder="$0.00" /></div>
        <div>Materials: <InlineEditable value={fmtCurrency(payment.materials_cost_cents)} onSave={(v) => save('payment.materials_cost_cents', parseCurrency(v))} placeholder="$0.00" /></div>
        <div className="font-semibold border-t border-neutral-400 mt-1 pt-1">
          Total: <InlineEditable value={fmtCurrency(payment.total_cents)} onSave={(v) => save('payment.total_cents', parseCurrency(v))} placeholder="$0.00" />
        </div>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-neutral-800">
            <th className="text-left p-1">Milestone</th>
            <th className="text-right p-1 w-16">%</th>
            <th className="text-left p-1">Condition</th>
          </tr>
        </thead>
        <tbody>
          {sched.map((m, i) => (
            <tr key={i} className="border-b border-neutral-200 group">
              <td className="p-1">
                <InlineEditable value={m.milestone || ''} onSave={(v) => setSched(sched.map((x, j) => j === i ? { ...x, milestone: v } : x))} placeholder="Milestone" />
              </td>
              <td className="p-1 text-right">
                <InlineEditable
                  value={String(m.percent ?? 0)}
                  onSave={(v) => setSched(sched.map((x, j) => j === i ? { ...x, percent: Number(v) || 0 } : x))}
                  placeholder="0"
                />
              </td>
              <td className="p-1">
                <InlineEditable value={m.condition || ''} onSave={(v) => setSched(sched.map((x, j) => j === i ? { ...x, condition: v } : x))} placeholder="Condition" />
                <button
                  onClick={() => setSched(sched.filter((_, j) => j !== i))}
                  className="ml-2 text-red-600 text-[10px] opacity-0 group-hover:opacity-100"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-between items-center mt-2 text-xs">
        <button onClick={() => setSched([...sched, { milestone: '', percent: 0, condition: '' }])} className="text-sunvic-700">
          + Milestone
        </button>
        <span className={sumOk ? 'text-green-700 font-mono' : 'text-red-600 font-mono font-semibold'}>
          Sum: {sum.toFixed(2)}% {sumOk ? '✓' : '⚠'}
        </span>
      </div>
    </div>
  );
}

function TextSection({ letter, title, path, payload, save, locks, extraFields = [] }) {
  const parts = path.split('.');
  let val = payload;
  for (const p of parts) val = val?.[p];
  const text = typeof val === 'string' ? val : (val?.text || '');
  return (
    <div>
      <SectionHeader letter={letter} title={title} />
      <div className="text-xs text-neutral-800 leading-relaxed">
        <InlineEditable
          value={typeof val === 'string' ? val : text}
          onSave={(v) => save(typeof val === 'string' ? path : `${path}.text`, v)}
          multiline
          placeholder={`(${title})`}
          as="p"
          locked={locks[typeof val === 'string' ? path : `${path}.text`]}
        />
        {extraFields.map((f) => (
          <div key={f.path} className="mt-2">
            <span className="text-[10px] uppercase text-neutral-500 mr-2">{f.label}:</span>
            <InlineEditable
              value={f.getValue(payload) || ''}
              onSave={(v) => save(f.path, v)}
              placeholder={f.label}
              multiline={f.multiline}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function HtmlContractMirror({ payload, template, onSave, locks = {}, onToggleLock }) {
  const save = (path, value) => onSave({ [path]: value });

  if (template !== 'contract') {
    return <div className="p-4 text-sm text-neutral-500">Mirror not available for template: {template}</div>;
  }

  return (
    <div className="overflow-y-auto h-full py-6 px-4 bg-neutral-100">
      <div className="max-w-[850px] mx-auto bg-white shadow-lg rounded-md p-8 text-neutral-900" style={{ fontFamily: 'Liberation Sans, Arimo, DejaVu Sans' }}>
        <HeaderBlock payload={payload} save={save} locks={locks} />

        <SectionHeader letter="A" title="Agreement Summary" />
        <div className="text-xs text-neutral-800 leading-relaxed mb-2">
          <InlineEditable
            value={payload.agreement_summary?.text || ''}
            onSave={(v) => save('agreement_summary.text', v)}
            multiline
            placeholder="(Section A body paragraph)"
            as="p"
          />
        </div>
        <div className="flex gap-4 text-xs mb-4">
          <div>Weeks to start: <InlineEditable value={String(payload.agreement_summary?.weeks_to_start ?? '')} onSave={(v) => save('agreement_summary.weeks_to_start', Number(v) || 0)} placeholder="0" /></div>
          <div>Months to complete: <InlineEditable value={String(payload.agreement_summary?.months_to_complete ?? '')} onSave={(v) => save('agreement_summary.months_to_complete', Number(v) || 0)} placeholder="0" /></div>
        </div>

        <ScopeBlock payload={payload} save={save} locks={locks} />

        <TextSection letter={null} title="Material Selection" path="material_selection" payload={payload} save={save} locks={locks} />

        <PaymentBlock payload={payload} save={save} />

        <SectionHeader letter="D" title="Timeline" />
        <div className="text-xs">
          <div>Start: <InlineEditable value={payload.timeline?.start_date || ''} onSave={(v) => save('timeline.start_date', v)} placeholder="YYYY-MM-DD" /></div>
          <div>Substantial completion: <InlineEditable value={payload.timeline?.substantial_completion_date || ''} onSave={(v) => save('timeline.substantial_completion_date', v)} placeholder="YYYY-MM-DD" /></div>
          <div>Final: <InlineEditable value={payload.timeline?.final_completion_date || ''} onSave={(v) => save('timeline.final_completion_date', v)} placeholder="YYYY-MM-DD" /></div>
          <div className="mt-2 text-neutral-600">
            <InlineEditable value={payload.timeline?.disclaimer || ''} onSave={(v) => save('timeline.disclaimer', v)} multiline placeholder="(disclaimer)" as="p" />
          </div>
        </div>

        <TextSection letter="E" title="Change Orders" path="change_orders" payload={payload} save={save} locks={locks} />
        <TextSection letter="F" title="Unforeseen Conditions" path="unforeseen" payload={payload} save={save} locks={locks} />
        <TextSection letter="G" title="Warranties" path="warranties" payload={payload} save={save} locks={locks} />
        <TextSection letter="H" title="Permits" path="permits" payload={payload} save={save} locks={locks} />
        <TextSection letter="H." title="Insurance" path="insurance" payload={payload} save={save} locks={locks} />

        <SectionHeader letter="I" title="Dispute Resolution" />
        <div className="text-xs">
          <InlineEditable value={payload.dispute_resolution?.intro || ''} onSave={(v) => save('dispute_resolution.intro', v)} multiline placeholder="(intro)" as="p" />
          <ol className="list-decimal ml-5 mt-2">
            {(payload.dispute_resolution?.steps || []).map((s, i) => (
              <li key={i}>
                <span className="font-semibold">
                  <InlineEditable value={s?.name || ''} onSave={(v) => save(`dispute_resolution.steps.${i}.name`, v)} placeholder={`(name)`} />
                  :{' '}
                </span>
                <InlineEditable value={s?.text || ''} onSave={(v) => save(`dispute_resolution.steps.${i}.text`, v)} multiline placeholder={`(step ${i + 1} body)`} />
              </li>
            ))}
          </ol>
          <p className="mt-2 text-neutral-600">
            <InlineEditable value={payload.dispute_resolution?.footer || ''} onSave={(v) => save('dispute_resolution.footer', v)} multiline placeholder="(footer)" as="span" />
          </p>
        </div>

        <TextSection letter="J" title="Right to Cancel" path="right_to_cancel" payload={payload} save={save} locks={locks} />
        <TextSection letter={null} title="Signature Intro" path="signature_intro" payload={payload} save={save} locks={locks} />

        <div className="mt-8 pt-4 border-t border-neutral-400 text-xs text-neutral-500">
          Signature block rendered in PDF export.
        </div>
      </div>
    </div>
  );
}

export default HtmlContractMirror;
