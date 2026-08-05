import React from 'react';
import { Accordion, AccordionItem } from '../ui/Accordion.jsx';
import { FieldRow, TextField } from '../ui/FieldRow.jsx';
import { MoneyInput, formatUSD } from '../ui/MoneyInput.jsx';
import { Advanced } from './ContractFormEditor.jsx';
import { INVOICE_FORM_TABS, blocksFor } from '../doc/docSections.js';
import { SectionAgentButton } from '../agent/SectionAgentButton.jsx';
import { deriveInvoiceTotals } from './formMath.js';

// Invoice form, rebuilt mobile-first — and rebound to the paths that actually exist.
//
// The previous version wrote to `bill_to.client_address`, `project_ref`,
// `tax_rate_percent`, `notes`, and line items shaped `{description, unit_price_cents}`.
// None of those appear in InvoicePayload and none are read by InvoicePDF, which uses
// `bill_to.property_address`, `contract_ref`, `tax.rate_percent`, `invoice_terms.text`
// and `{desc, qty, rate_cents, amount_cents}`. Every edit typed into that form was
// accepted by the UI and then dropped on the floor. Same defect class as the Legal tab.

function Card({ children, className = '' }) {
  return <div className={`border border-neutral-200 rounded-xl bg-white ${className}`}>{children}</div>;
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

// ── blocks ───────────────────────────────────────────────────

function CoverBlock({ p, set }) {
  return (
    <Card>
      <FieldRow label="Invoice number" value={p.invoice_number}>
        <TextField value={p.invoice_number || ''} onChange={(v) => set('invoice_number', v)} />
      </FieldRow>
      <FieldRow label="Which payment is this" value={p.milestone_label} required hint="The milestone name from the contract, e.g. “Progress Payment (2)”.">
        <TextField value={p.milestone_label || ''} onChange={(v) => set('milestone_label', v)} />
      </FieldRow>
      <FieldRow label="Why it is due now" value={p.milestone_condition} hint="The condition from the contract schedule that has been met.">
        <TextField multiline rows={2} value={p.milestone_condition || ''} onChange={(v) => set('milestone_condition', v)} />
      </FieldRow>
      <FieldRow label="Contract reference" value={p.contract_ref} hint="The contract number this invoice bills against.">
        <TextField value={p.contract_ref || ''} onChange={(v) => set('contract_ref', v)} />
      </FieldRow>
    </Card>
  );
}

function BillToBlock({ p, set }) {
  const b = p.bill_to || {};
  return (
    <Card>
      <FieldRow label="Client name" value={b.client_name} required>
        <TextField value={b.client_name || ''} onChange={(v) => set('bill_to.client_name', v)} />
      </FieldRow>
      <FieldRow label="Property address" value={b.property_address} required hint="The job address, as printed on the invoice.">
        <TextField multiline rows={2} value={b.property_address || ''} onChange={(v) => set('bill_to.property_address', v)} />
      </FieldRow>
      <FieldRow label="Email" value={b.recipient_email} hint="Where this invoice is sent.">
        <TextField type="email" value={b.recipient_email || ''} onChange={(v) => set('bill_to.recipient_email', v)} />
      </FieldRow>
      <FieldRow label="Phone" value={b.recipient_phone}>
        <TextField type="tel" value={b.recipient_phone || ''} onChange={(v) => set('bill_to.recipient_phone', v)} />
      </FieldRow>
    </Card>
  );
}

function LineItemCard({ item, index, items, set }) {
  function edit(patch) {
    const next = items.map((li, i) => {
      if (i !== index) return li;
      const merged = { ...li, ...patch };
      if ('qty' in patch || 'rate_cents' in patch) {
        merged.amount_cents = Math.round((Number(merged.qty) || 0) * (Number(merged.rate_cents) || 0));
      }
      return merged;
    });
    set('line_items', next);
  }
  return (
    <Card className="p-3 space-y-2.5">
      <div>
        <label className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium">Description</label>
        <TextField value={item.desc || ''} onChange={(v) => edit({ desc: v })} placeholder="Work completed" />
      </div>
      <div className="flex gap-2">
        <div className="w-24 flex-shrink-0">
          <label className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium">Qty</label>
          <input
            inputMode="decimal"
            type="text"
            value={item.qty ?? 1}
            onChange={(e) => {
              const clean = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
              edit({ qty: clean === '' ? 0 : Number(clean) });
            }}
            className="w-full min-h-[48px] rounded-xl border border-neutral-300 px-3 text-base tabular-nums focus:border-sunvic-500 focus:ring-2 focus:ring-sunvic-200 focus:outline-none"
          />
        </div>
        <div className="flex-1 min-w-0">
          <label className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium">Rate</label>
          <MoneyInput valueCents={item.rate_cents} aria-label="Rate" onChangeCents={(c) => edit({ rate_cents: c })} />
        </div>
      </div>
      <div className="flex items-center justify-between pt-0.5">
        <span className="text-sm text-neutral-500">Line total</span>
        <span className="text-[15px] font-semibold tabular-nums">{formatUSD(item.amount_cents)}</span>
      </div>
      <button
        type="button"
        onClick={() => set('line_items', items.filter((_, i) => i !== index))}
        className="w-full min-h-[44px] rounded-xl border border-rose-200 text-rose-600 text-sm active:bg-rose-50"
      >
        Remove line
      </button>
    </Card>
  );
}

function AmountBlock({ p, set, setMany }) {
  const items = p.line_items || [];
  const derived = deriveInvoiceTotals(p);
  const storedDue = Number(p.totals?.total_due_cents) || 0;
  const drifted = Math.abs(storedDue - derived['totals.total_due_cents']) > 100;

  return (
    <div className="space-y-3">
      <Card>
        <FieldRow label="Amount due" value={storedDue ? formatUSD(storedDue) : ''} required hint="What this invoice asks for, including tax.">
          <MoneyInput valueCents={storedDue} aria-label="Amount due" onChangeCents={(c) => set('totals.total_due_cents', c)} />
        </FieldRow>
        <FieldRow label="Percent of contract" value={p.milestone?.percent ? `${p.milestone.percent}%` : ''} hint="This milestone as a share of the full contract price.">
          <input
            inputMode="decimal"
            type="text"
            value={p.milestone?.percent ?? ''}
            onChange={(e) => {
              const clean = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
              set('milestone.percent', clean === '' ? 0 : Number(clean));
            }}
            className="w-full min-h-[48px] rounded-xl border border-neutral-300 px-3 text-base tabular-nums focus:border-sunvic-500 focus:ring-2 focus:ring-sunvic-200 focus:outline-none"
          />
        </FieldRow>
        <FieldRow label="Contract total" value={p.contract?.total_cents ? formatUSD(p.contract.total_cents) : ''} hint="Carried over from the contract, for the running balance.">
          <MoneyInput valueCents={p.contract?.total_cents} aria-label="Contract total" onChangeCents={(c) => set('contract.total_cents', c)} />
        </FieldRow>
      </Card>

      {drifted && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-900">
          <p>
            The amount due on file is {formatUSD(storedDue)}, but the lines and tax come to{' '}
            {formatUSD(derived['totals.total_due_cents'])}.
          </p>
          <button
            type="button"
            onClick={() => setMany(derived)}
            className="mt-2 min-h-[40px] px-3 rounded-lg bg-amber-600 text-white text-sm font-medium"
          >
            Recalculate from the lines
          </button>
        </div>
      )}

      <div>
        <h4 className="text-xs uppercase tracking-wide text-neutral-500 font-semibold px-1 mb-2">Work covered</h4>
        <div className="space-y-2">
          {items.length === 0 && (
            <p className="text-xs text-neutral-500 px-1 py-2">No lines yet. Ask the copilot to itemise this milestone, or add one.</p>
          )}
          {items.map((li, i) => (
            <LineItemCard key={i} item={li} index={i} items={items} set={set} />
          ))}
          <button
            type="button"
            onClick={() => set('line_items', [...items, { desc: '', qty: 1, rate_cents: 0, amount_cents: 0 }])}
            className="w-full min-h-[48px] rounded-xl border border-neutral-300 text-sm font-medium text-neutral-700 active:bg-neutral-50"
          >
            + Add line
          </button>
        </div>
      </div>

      <Card>
        <FieldRow
          label="Sales tax"
          value={`${p.tax?.rate_percent ?? 0}% · ${
            { materials_only: 'materials only', total: 'whole invoice', none: 'not charged' }[p.tax?.applies_to || 'materials_only']
          }`}
          hint="New Jersey charges sales tax on materials, not labor, for most home improvement work."
        >
          <div className="flex gap-2">
            <input
              inputMode="decimal"
              type="text"
              aria-label="Tax rate percent"
              value={p.tax?.rate_percent ?? ''}
              onChange={(e) => {
                const clean = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
                set('tax.rate_percent', clean === '' ? 0 : Number(clean));
              }}
              className="w-24 flex-shrink-0 min-h-[48px] rounded-xl border border-neutral-300 px-3 text-base tabular-nums"
            />
            <select
              aria-label="Tax applies to"
              value={p.tax?.applies_to || 'materials_only'}
              onChange={(e) => set('tax.applies_to', e.target.value)}
              className="flex-1 min-w-0 min-h-[48px] rounded-xl border border-neutral-300 px-3 text-base"
            >
              <option value="materials_only">Materials only</option>
              <option value="total">Whole invoice</option>
              <option value="none">Not charged</option>
            </select>
          </div>
        </FieldRow>
        <FieldRow label="Payment terms" value={p.invoice_terms?.text ? `${String(p.invoice_terms.text).slice(0, 60)}…` : ''}>
          <TextField multiline rows={5} value={p.invoice_terms?.text || ''} onChange={(v) => set('invoice_terms.text', v)} />
        </FieldRow>
      </Card>

      <Advanced label="Breakdown and prior payments">
        <div className="p-3 space-y-3">
          <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-3 space-y-1.5 text-sm">
            {[
              ['Subtotal', derived['totals.subtotal_cents']],
              ['Tax', derived['totals.tax_cents']],
              ['Total due', derived['totals.total_due_cents']],
              ['Remaining after this', derived['totals.remaining_after_cents']],
            ].map(([label, cents]) => (
              <div key={label} className="flex justify-between">
                <span className="text-neutral-600">{label}</span>
                <span className="tabular-nums font-medium">{formatUSD(cents)}</span>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setMany(derived)}
              className="w-full mt-2 min-h-[44px] rounded-xl border border-neutral-300 text-sm text-neutral-700 active:bg-neutral-100"
            >
              Write these values to the invoice
            </button>
          </div>

          <div className="space-y-2">
            {(p.prior_payments || []).map((row, i) => (
              <Card key={i} className="p-3 space-y-2">
                <TextField
                  value={row.label || ''}
                  placeholder="e.g. Deposit"
                  onChange={(v) => set('prior_payments', (p.prior_payments || []).map((r, ix) => (ix === i ? { ...r, label: v } : r)))}
                />
                <div className="flex gap-2">
                  <TextField
                    type="date"
                    value={fmtDate(row.date)}
                    onChange={(v) => set('prior_payments', (p.prior_payments || []).map((r, ix) => (ix === i ? { ...r, date: v } : r)))}
                  />
                  <MoneyInput
                    valueCents={row.amount_cents}
                    aria-label="Prior payment amount"
                    onChangeCents={(c) => set('prior_payments', (p.prior_payments || []).map((r, ix) => (ix === i ? { ...r, amount_cents: c } : r)))}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => set('prior_payments', (p.prior_payments || []).filter((_, ix) => ix !== i))}
                  className="w-full min-h-[44px] rounded-xl border border-rose-200 text-rose-600 text-sm"
                >
                  Remove
                </button>
              </Card>
            ))}
            <button
              type="button"
              onClick={() => set('prior_payments', [...(p.prior_payments || []), { label: '', date: '', amount_cents: 0 }])}
              className="w-full min-h-[44px] rounded-xl border border-neutral-300 text-sm text-neutral-700"
            >
              + Add a payment already received
            </button>
          </div>

          <label className="flex items-center gap-3 px-1 py-2 min-h-[44px] text-sm">
            <input
              type="checkbox"
              className="w-5 h-5"
              checked={!!p.include_cost_analysis}
              onChange={(e) => set('include_cost_analysis', e.target.checked)}
            />
            Include the second-page cost analysis
          </label>
        </div>
      </Advanced>
    </div>
  );
}

function DatesBlock({ p, set }) {
  return (
    <Card>
      <FieldRow label="Invoice date" value={humanDate(p.invoice_date)} required>
        <TextField type="date" value={fmtDate(p.invoice_date)} onChange={(v) => set('invoice_date', v)} />
      </FieldRow>
      <FieldRow label="Due date" value={humanDate(p.due_date)} required hint="When payment is expected.">
        <TextField type="date" value={fmtDate(p.due_date)} onChange={(v) => set('due_date', v)} />
      </FieldRow>
    </Card>
  );
}

// ── shell ────────────────────────────────────────────────────

const BLOCK_ORDER = ['cover', 'homeowner', 'payment', 'timeline'];

export function InvoiceEditor({ doc, onSave, section = null }) {
  const p = doc?.payload || {};
  const set = (path, value) => onSave({ [path]: value });
  const setMany = (patch) => onSave(patch);

  const allowed = blocksFor(INVOICE_FORM_TABS, section);
  const visible = BLOCK_ORDER.filter((id) => !allowed || allowed.includes(id));

  const b = p.bill_to || {};
  const billToIncomplete = !b.client_name || !b.property_address;
  const due = Number(p.totals?.total_due_cents) || 0;

  const meta = {
    cover: { title: 'Invoice details', subtitle: p.milestone_label || p.invoice_number || 'No milestone set' },
    homeowner: {
      title: 'Bill to',
      subtitle: b.client_name || 'Name and address needed',
      warn: billToIncomplete,
      badge: billToIncomplete ? 'Incomplete' : null,
    },
    payment: { title: 'Amount', subtitle: due ? formatUSD(due) : 'No amount set' },
    timeline: { title: 'Dates', subtitle: humanDate(p.due_date) ? `Due ${humanDate(p.due_date)}` : 'No due date' },
  };

  function renderBlock(id) {
    switch (id) {
      case 'cover': return <CoverBlock p={p} set={set} />;
      case 'homeowner': return <BillToBlock p={p} set={set} />;
      case 'payment': return <AmountBlock p={p} set={set} setMany={setMany} />;
      case 'timeline': return <DatesBlock p={p} set={set} />;
      default: return null;
    }
  }

  return (
    <div className="p-3">
      <Accordion defaultOpen={visible[0] || null}>
        {visible.map((id) => {
          const m = meta[id] || { title: id };
          return (
            <AccordionItem
              key={id}
              id={id}
              title={m.title}
              subtitle={m.subtitle}
              badge={m.badge}
              warn={!!m.warn}
              action={<SectionAgentButton tab="form" section={section} blocks={[id]} label={m.title} />}
            >
              {renderBlock(id)}
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
