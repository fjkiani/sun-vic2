import React from 'react';
import { LockableField } from '../LockableField.jsx';
import { SectionCard } from '../SectionCard.jsx';

export function InvoiceEditor({ doc, onSave, onToggleLock }) {
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

      <SectionCard title="Line Items">
        <LineItemsList items={p.line_items || []} onSave={onSave} />
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

function LineItemsList({ items, onSave }) {
  function update(next) { onSave({ line_items: next }); }
  function addRow() { update([...items, { description: '', qty: 1, unit_price_cents: 0, amount_cents: 0 }]); }
  function editRow(i, patch) {
    const next = items.map((it, idx) => {
      if (idx !== i) return it;
      const merged = { ...it, ...patch };
      // Recompute amount if qty or unit price changed.
      if ('qty' in patch || 'unit_price_cents' in patch) {
        merged.amount_cents = Math.round((Number(merged.qty) || 0) * (Number(merged.unit_price_cents) || 0));
      }
      return merged;
    });
    update(next);
  }
  function removeRow(i) { update(items.filter((_, idx) => idx !== i)); }
  return (
    <div className="space-y-2">
      {items.length === 0 && <div className="text-xs text-neutral-500">No line items yet — add one below.</div>}
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-12 gap-1 text-xs">
          <input value={it.description || ''} onChange={(e) => editRow(i, { description: e.target.value })}
            placeholder="description" className="col-span-6 rounded border border-neutral-200 px-1.5 py-1" />
          <input type="number" step="0.01" value={it.qty ?? 1} onChange={(e) => editRow(i, { qty: Number(e.target.value) })}
            placeholder="qty" className="col-span-1 rounded border border-neutral-200 px-1.5 py-1" />
          <input type="number" step="0.01" value={(Number(it.unit_price_cents || 0) / 100).toFixed(2)}
            onChange={(e) => editRow(i, { unit_price_cents: Math.round(Number(e.target.value) * 100) })}
            placeholder="unit $" className="col-span-2 rounded border border-neutral-200 px-1.5 py-1" />
          <div className="col-span-2 self-center text-right font-mono text-neutral-600">
            ${((Number(it.amount_cents) || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <button onClick={() => removeRow(i)} className="col-span-1 text-rose-500 hover:text-rose-700">✕</button>
        </div>
      ))}
      <button onClick={addRow} className="text-xs text-sunvic-600 hover:underline">+ Add line item</button>
    </div>
  );
}
