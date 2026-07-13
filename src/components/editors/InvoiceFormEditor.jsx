import React from 'react';
import { LockableField } from '../LockableField.jsx';

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
