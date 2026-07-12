import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { PDFPreview } from '../components/PDFPreview.jsx';
import { AgentChatPanel } from '../components/AgentChatPanel.jsx';
import { LockableField } from '../components/LockableField.jsx';

function fmtUSD(cents) {
  return ((Number(cents) || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// Utility: set a value at a JSON dot-path on a copy of the object.
function setPath(obj, path, value) {
  const parts = path.split('.');
  const out = JSON.parse(JSON.stringify(obj || {}));
  let cur = out;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
  return out;
}

export function DocumentEditorPage() {
  const { id } = useParams();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.getDocument(id),
  });
  const [doc, setDoc] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [tab, setTab] = useState('editor');
  const [emailTo, setEmailTo] = useState('');
  const [busyOp, setBusyOp] = useState(null);

  useEffect(() => { if (data?.document) setDoc(data.document); }, [data]);

  async function saveField(pathValueMap) {
    if (!doc) return;
    const nextPayload = Object.entries(pathValueMap).reduce((acc, [p, v]) => setPath(acc, p, v), doc.payload);
    setDoc({ ...doc, payload: nextPayload });
    setSaving(true);
    try {
      const { document } = await api.updateDocument(doc.id, { payload: nextPayload });
      setDoc(document);
      setLastSaved(new Date());
    } catch (e) { alert(`Save failed: ${e.message || e}`); } finally { setSaving(false); }
  }
  async function toggleLock(path) {
    if (!doc) return;
    const wasLocked = !!doc.locks?.[path];
    const nextLocks = { ...(doc.locks || {}), [path]: !wasLocked };
    setDoc({ ...doc, locks: nextLocks });
    try {
      const { document } = await api.updateDocument(doc.id, { locks: nextLocks });
      setDoc(document);
    } catch (e) { alert(`Lock toggle failed: ${e.message || e}`); refetch(); }
  }
  async function runGeneratePdf() {
    if (!doc) return;
    setBusyOp('pdf');
    try {
      const result = await api.generatePdf(doc.id);
      window.open(result.signed_url, '_blank');
    } catch (e) { alert(`PDF gen failed: ${e.message || e}`); } finally { setBusyOp(null); }
  }
  async function runEmail() {
    if (!doc || !emailTo.trim()) return;
    setBusyOp('email');
    try {
      await api.emailDocument(doc.id, { to: emailTo.trim() });
      alert(`Sent to ${emailTo.trim()}`);
      refetch();
    } catch (e) { alert(`Email failed: ${e.message || e}`); } finally { setBusyOp(null); }
  }
  async function setStatus(status) {
    if (!doc) return;
    try {
      const { document } = await api.updateDocument(doc.id, { status });
      setDoc(document);
    } catch (e) { alert(`Status change failed: ${e.message || e}`); }
  }

  if (isLoading) return <div className="text-neutral-500">Loading…</div>;
  if (error) return <div className="text-rose-600">Error: {error.message}</div>;
  if (!doc) return null;

  const total = doc.total_cents;

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-8rem)]">
      {/* Left column: editor */}
      <div className="col-span-12 lg:col-span-4 bg-white border border-neutral-200 rounded-xl overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
          <div>
            <div className="font-mono text-sunvic-600 font-bold">{doc.doc_number}</div>
            <div className="text-xs text-neutral-500 capitalize">{doc.template} · {doc.status}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-neutral-500">Total</div>
            <div className="font-mono font-bold text-lg">{fmtUSD(total)}</div>
          </div>
        </div>
        <div className="px-4 pt-3 pb-1 flex gap-1 text-xs">
          {['editor', 'legal', 'actions'].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-2 py-1 rounded ${tab === t ? 'bg-sunvic-500 text-white' : 'text-neutral-500 hover:bg-neutral-100'}`}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tab === 'editor' && (doc.template === 'contract'
            ? <ContractEditor doc={doc} onSave={saveField} onToggleLock={toggleLock} />
            : <InvoiceEditor doc={doc} onSave={saveField} onToggleLock={toggleLock} />)}
          {tab === 'legal' && <LegalEditor doc={doc} onSave={saveField} onToggleLock={toggleLock} />}
          {tab === 'actions' && (
            <div className="space-y-3">
              <div>
                <div className="text-xs text-neutral-500 uppercase font-semibold mb-1">Status</div>
                <div className="flex flex-wrap gap-1">
                  {['draft','sent','signed','paid','overdue','void'].map((s) => (
                    <button key={s} onClick={() => setStatus(s)}
                      className={`text-xs px-2 py-1 rounded border ${doc.status === s ? 'bg-sunvic-500 text-white border-sunvic-500' : 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-500 uppercase font-semibold mb-1">Generate PDF</div>
                <button onClick={runGeneratePdf} disabled={busyOp === 'pdf'}
                  className="w-full py-2 rounded-md bg-sunvic-500 hover:bg-sunvic-600 text-white text-sm font-semibold disabled:opacity-60">
                  {busyOp === 'pdf' ? 'Generating…' : 'Generate & download PDF'}
                </button>
              </div>
              <div>
                <div className="text-xs text-neutral-500 uppercase font-semibold mb-1">Email to</div>
                <div className="flex gap-2">
                  <input type="email" placeholder={doc.client_email || 'client@example.com'} value={emailTo} onChange={(e) => setEmailTo(e.target.value)}
                    className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
                  <button onClick={runEmail} disabled={busyOp === 'email' || !emailTo.trim()}
                    className="px-3 py-1.5 rounded-md bg-neutral-900 text-white text-sm disabled:opacity-60">
                    Send
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="px-4 py-2 border-t border-neutral-200 text-xs text-neutral-500">
          {saving ? 'Saving…' : lastSaved ? `Saved at ${lastSaved.toLocaleTimeString()}` : 'Auto-save on change'}
        </div>
      </div>

      {/* Middle: PDF preview */}
      <div className="col-span-12 lg:col-span-5 h-full">
        <PDFPreview template={doc.template} payload={doc.payload} docNumber={doc.doc_number} />
      </div>

      {/* Right: Agent panel */}
      <div className="col-span-12 lg:col-span-3 h-full bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <AgentChatPanel document={doc} onDocumentUpdate={(d) => setDoc({ ...doc, ...d })} />
      </div>
    </div>
  );
}

// ---------- Contract editor ----------
function ContractEditor({ doc, onSave, onToggleLock }) {
  const p = doc.payload;
  const locks = doc.locks || {};
  return (
    <div className="space-y-3">
      <SectionCard title="Homeowner">
        <LockableField label="Name" path="homeowner.name" value={p.homeowner?.name} locked={locks['homeowner.name']}
          onToggleLock={() => onToggleLock('homeowner.name')}
          onChange={(v) => onSave({ 'homeowner.name': v })} />
        <LockableField label="Property Address" path="homeowner.address" value={p.homeowner?.address} locked={locks['homeowner.address']}
          onToggleLock={() => onToggleLock('homeowner.address')}
          onChange={(v) => onSave({ 'homeowner.address': v })} />
        <div className="grid grid-cols-2 gap-2">
          <LockableField label="Phone" path="homeowner.phone" value={p.homeowner?.phone} locked={locks['homeowner.phone']}
            onToggleLock={() => onToggleLock('homeowner.phone')}
            onChange={(v) => onSave({ 'homeowner.phone': v })} />
          <LockableField label="Email" path="homeowner.email" type="email" value={p.homeowner?.email} locked={locks['homeowner.email']}
            onToggleLock={() => onToggleLock('homeowner.email')}
            onChange={(v) => onSave({ 'homeowner.email': v })} />
        </div>
      </SectionCard>

      <SectionCard title="Agreement Summary">
        <LockableField label="Plain-English recap" path="agreement_summary" as="textarea" rows={3} value={p.agreement_summary}
          locked={locks['agreement_summary']} onToggleLock={() => onToggleLock('agreement_summary')}
          onChange={(v) => onSave({ 'agreement_summary': v })} />
      </SectionCard>

      <SectionCard title="Scope — Phases">
        <PhaseList payload={p} template="contract" onSave={onSave} />
      </SectionCard>

      <SectionCard title="Payment Schedule">
        <PaymentScheduleEditor payload={p} onSave={onSave} locks={locks} onToggleLock={onToggleLock} />
      </SectionCard>

      <SectionCard title="Timeline">
        <div className="grid grid-cols-2 gap-2">
          <LockableField label="Start" path="timeline.start_date" type="date" value={p.timeline?.start_date} locked={locks['timeline.start_date']}
            onToggleLock={() => onToggleLock('timeline.start_date')}
            onChange={(v) => onSave({ 'timeline.start_date': v })} />
          <LockableField label="Substantial Completion" path="timeline.substantial_completion_date" type="date" value={p.timeline?.substantial_completion_date}
            locked={locks['timeline.substantial_completion_date']}
            onToggleLock={() => onToggleLock('timeline.substantial_completion_date')}
            onChange={(v) => onSave({ 'timeline.substantial_completion_date': v })} />
        </div>
      </SectionCard>
    </div>
  );
}

// ---------- Invoice editor ----------
function InvoiceEditor({ doc, onSave, onToggleLock }) {
  const p = doc.payload;
  const locks = doc.locks || {};
  return (
    <div className="space-y-3">
      <SectionCard title="Bill To">
        <LockableField label="Client Name" path="bill_to.client_name" value={p.bill_to?.client_name} locked={locks['bill_to.client_name']}
          onToggleLock={() => onToggleLock('bill_to.client_name')}
          onChange={(v) => onSave({ 'bill_to.client_name': v })} />
        <LockableField label="Address" path="bill_to.client_address" value={p.bill_to?.client_address} locked={locks['bill_to.client_address']}
          onToggleLock={() => onToggleLock('bill_to.client_address')}
          onChange={(v) => onSave({ 'bill_to.client_address': v })} />
        <LockableField label="Recipient Email" path="bill_to.recipient_email" type="email" value={p.bill_to?.recipient_email}
          locked={locks['bill_to.recipient_email']} onToggleLock={() => onToggleLock('bill_to.recipient_email')}
          onChange={(v) => onSave({ 'bill_to.recipient_email': v })} />
      </SectionCard>

      <SectionCard title="Dates & Reference">
        <div className="grid grid-cols-2 gap-2">
          <LockableField label="Invoice Date" path="invoice_date" type="date" value={p.invoice_date}
            locked={locks['invoice_date']} onToggleLock={() => onToggleLock('invoice_date')}
            onChange={(v) => onSave({ 'invoice_date': v })} />
          <LockableField label="Due Date" path="due_date" type="date" value={p.due_date}
            locked={locks['due_date']} onToggleLock={() => onToggleLock('due_date')}
            onChange={(v) => onSave({ 'due_date': v })} />
        </div>
        <LockableField label="Project Ref" path="project_ref" value={p.project_ref}
          locked={locks['project_ref']} onToggleLock={() => onToggleLock('project_ref')}
          onChange={(v) => onSave({ 'project_ref': v })} />
        <LockableField label="Tax Rate (%)" path="tax_rate_percent" type="number" step="0.01" value={p.tax_rate_percent}
          locked={locks['tax_rate_percent']} onToggleLock={() => onToggleLock('tax_rate_percent')}
          onChange={(v) => onSave({ 'tax_rate_percent': v })} />
      </SectionCard>

      <SectionCard title="Phases / Line Items">
        <PhaseList payload={p} template="invoice" onSave={onSave} />
      </SectionCard>

      <SectionCard title="Options & Notes">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!p.include_cost_analysis}
            onChange={(e) => onSave({ 'include_cost_analysis': e.target.checked })} />
          Include second-page cost analysis
        </label>
        <LockableField label="Notes" path="notes" as="textarea" rows={3} value={p.notes}
          locked={locks['notes']} onToggleLock={() => onToggleLock('notes')}
          onChange={(v) => onSave({ 'notes': v })} />
      </SectionCard>
    </div>
  );
}

// ---------- Legal editor ----------
function LegalEditor({ doc, onSave, onToggleLock }) {
  const p = doc.payload;
  const locks = doc.locks || {};
  const isContract = doc.template === 'contract';
  return (
    <div className="space-y-3">
      <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-2 py-2">
        Legal blocks are <strong>locked by default</strong>. Unlock only if a specific job requires custom terms — the defaults reflect canonical Sunvic language and NJ Home Improvement Contract Act requirements.
      </div>

      {isContract && ['warranties','permits','insurance','dispute_resolution','right_to_cancel'].map((key) => (
        <SectionCard key={key} title={key.replace(/_/g,' ').replace(/\b\w/g, (c) => c.toUpperCase())}>
          <LockableField label="Text" path={`${key}.text`} as="textarea" rows={10}
            value={p[key]?.text} locked={locks[`${key}.text`]}
            onToggleLock={() => onToggleLock(`${key}.text`)}
            onChange={(v) => onSave({ [`${key}.text`]: v })} />
        </SectionCard>
      ))}

      <SectionCard title="Contractor">
        {['legal_name','address','phone','email','license_number','website'].map((k) => (
          <LockableField key={k} label={k.replace(/_/g,' ')} path={`contractor.${k}`}
            value={p.contractor?.[k]} locked={locks[`contractor.${k}`]}
            onToggleLock={() => onToggleLock(`contractor.${k}`)}
            onChange={(v) => onSave({ [`contractor.${k}`]: v })} />
        ))}
      </SectionCard>
    </div>
  );
}

// ---------- Building blocks ----------
function SectionCard({ title, children }) {
  return (
    <div className="border border-neutral-200 rounded-lg p-3 space-y-2 bg-neutral-50">
      <div className="text-xs uppercase tracking-wide text-neutral-500 font-semibold">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function PhaseList({ payload, template, onSave }) {
  const phases = template === 'contract' ? (payload.scope_of_work?.phases || []) : (payload.phases || []);
  function saveArr(next) {
    if (template === 'contract') onSave({ 'scope_of_work.phases': next });
    else onSave({ 'phases': next });
  }
  function updateAt(idx, patch) {
    const next = phases.map((ph, i) => i === idx ? { ...ph, ...patch } : ph);
    saveArr(next);
  }
  function addPhase() {
    saveArr([...phases, { id: crypto.randomUUID(), title: 'New Phase', description: '', items: [], sqft: null }]);
  }
  function removePhase(idx) {
    if (!confirm('Remove this phase?')) return;
    saveArr(phases.filter((_, i) => i !== idx));
  }
  function addItem(idx) {
    const ph = phases[idx];
    const next = { ...ph, items: [...(ph.items || []), { desc: '', qty: 1, rate: 0 }] };
    saveArr(phases.map((p, i) => i === idx ? next : p));
  }
  function updateItem(pIdx, iIdx, patch) {
    const ph = phases[pIdx];
    const items = ph.items.map((it, i) => i === iIdx ? { ...it, ...patch } : it);
    saveArr(phases.map((p, i) => i === pIdx ? { ...ph, items } : p));
  }
  function removeItem(pIdx, iIdx) {
    const ph = phases[pIdx];
    saveArr(phases.map((p, i) => i === pIdx ? { ...ph, items: ph.items.filter((_, i2) => i2 !== iIdx) } : p));
  }
  return (
    <div className="space-y-3">
      {phases.length === 0 && <div className="text-sm text-neutral-500">No phases yet — add one below.</div>}
      {phases.map((ph, idx) => (
        <div key={ph.id || idx} className="border border-neutral-200 rounded-md bg-white p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input value={ph.title || ''} onChange={(e) => updateAt(idx, { title: e.target.value })}
              className="flex-1 font-semibold rounded-md border border-neutral-300 px-2 py-1 text-sm" />
            <input type="number" value={ph.sqft ?? ''} onChange={(e) => updateAt(idx, { sqft: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="sqft" className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-sm" />
            <button onClick={() => removePhase(idx)} className="text-rose-500 hover:text-rose-700 text-sm">✕</button>
          </div>
          <textarea value={ph.description || ''} rows={2} onChange={(e) => updateAt(idx, { description: e.target.value })}
            placeholder="Description of work" className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs" />
          {(ph.items || []).map((it, iIdx) => (
            <div key={iIdx} className="grid grid-cols-12 gap-1 text-xs">
              <input value={it.desc || ''} onChange={(e) => updateItem(idx, iIdx, { desc: e.target.value })} placeholder="task"
                className="col-span-6 rounded border border-neutral-200 px-1.5 py-1" />
              <input type="number" value={it.qty ?? 1} onChange={(e) => updateItem(idx, iIdx, { qty: Number(e.target.value) })}
                className="col-span-1 rounded border border-neutral-200 px-1.5 py-1" />
              <input type="number" value={it.rate ?? 0} onChange={(e) => updateItem(idx, iIdx, { rate: Number(e.target.value) })}
                className="col-span-2 rounded border border-neutral-200 px-1.5 py-1" />
              <div className="col-span-2 self-center text-right font-mono text-neutral-600">
                ${((Number(it.qty) || 0) * (Number(it.rate) || 0)).toLocaleString()}
              </div>
              <button onClick={() => removeItem(idx, iIdx)} className="col-span-1 text-rose-500 hover:text-rose-700">✕</button>
            </div>
          ))}
          <button onClick={() => addItem(idx)} className="text-xs text-sunvic-600 hover:underline">+ Add task</button>
        </div>
      ))}
      <button onClick={addPhase} className="px-3 py-1.5 rounded-md bg-sunvic-500 hover:bg-sunvic-600 text-white text-sm font-semibold">+ Add phase</button>
    </div>
  );
}

function PaymentScheduleEditor({ payload, onSave, locks, onToggleLock }) {
  const sched = payload.payment?.schedule || [];
  const locked = !!locks['payment.schedule'];
  function updateAt(idx, patch) {
    const next = sched.map((m, i) => i === idx ? { ...m, ...patch } : m);
    onSave({ 'payment.schedule': next });
  }
  const sum = sched.reduce((s, m) => s + (Number(m.percent) || 0), 0);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-neutral-500">Sum: <span className={sum === 100 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>{sum}%</span></div>
        <button onClick={() => onToggleLock('payment.schedule')} className={`text-xs ${locked ? 'text-sunvic-500' : 'text-neutral-400'} hover:text-sunvic-600`}>
          {locked ? '🔒 locked' : '🔓 unlocked'}
        </button>
      </div>
      {sched.map((m, idx) => (
        <div key={idx} className="grid grid-cols-12 gap-1 text-xs">
          <input value={m.milestone || ''} onChange={(e) => updateAt(idx, { milestone: e.target.value })} disabled={locked}
            className="col-span-8 rounded border border-neutral-200 px-1.5 py-1 disabled:bg-neutral-100" />
          <input type="number" value={m.percent ?? 0} onChange={(e) => updateAt(idx, { percent: Number(e.target.value) })} disabled={locked}
            className="col-span-3 rounded border border-neutral-200 px-1.5 py-1 text-right disabled:bg-neutral-100" />
          <div className="col-span-1 self-center text-neutral-500">%</div>
        </div>
      ))}
    </div>
  );
}
