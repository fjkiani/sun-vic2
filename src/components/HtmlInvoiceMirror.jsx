// HtmlInvoiceMirror — WYSIWYG mirror for invoice template.
// Mirrors the layout of the PDF; every text field is InlineEditable.

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

function SectionHeader({ id, title }) {
  return (
    <div data-section-id={id} className="mt-6 mb-3 border-b-2 border-neutral-900 pb-1">
      <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900">{title}</h2>
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

function HeaderBlock({ payload, save, locks, docNumber }) {
  return (
    <div data-section-id="header" className="grid grid-cols-2 gap-6 mb-4 pb-4 border-b border-neutral-300">
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
        <div className="text-lg font-mono font-bold text-sunvic-600 mb-1">INVOICE {payload.invoice_number || docNumber || ''}</div>
        <div className="text-xs text-neutral-700">
          <Field label="Invoice date" path="invoice_date" value={payload.invoice_date} onSave={save} locked={locks['invoice_date']} />
          <Field label="Due date" path="due_date" value={payload.due_date} onSave={save} locked={locks['due_date']} />
          <Field label="Contract ref" path="contract_ref" value={payload.contract_ref} onSave={save} locked={locks['contract_ref']} />
        </div>
        <div className="mt-3 border-t border-neutral-300 pt-2">
          <div className="text-[10px] uppercase text-neutral-500 mb-1">Bill to</div>
          <Field path="bill_to.client_name" value={payload.bill_to?.client_name} onSave={save} locked={locks['bill_to.client_name']} className="font-semibold" />
          <Field path="bill_to.property_address" value={payload.bill_to?.property_address} onSave={save} locked={locks['bill_to.property_address']} />
          <Field label="Email" path="bill_to.recipient_email" value={payload.bill_to?.recipient_email} onSave={save} locked={locks['bill_to.recipient_email']} />
          <Field label="Phone" path="bill_to.recipient_phone" value={payload.bill_to?.recipient_phone} onSave={save} locked={locks['bill_to.recipient_phone']} />
        </div>
      </div>
    </div>
  );
}

function MilestoneBanner({ payload, save }) {
  const m = payload.milestone || {};
  if (!m.percent && !m.subtotal_cents && !payload.milestone_label) return null;
  return (
    <div data-section-id="milestone" className="mb-4 p-3 bg-sunvic-50 border border-sunvic-200 rounded">
      <div className="flex items-center justify-between text-xs">
        <div>
          <span className="text-[10px] uppercase text-neutral-500 mr-2">Milestone:</span>
          <InlineEditable value={payload.milestone_label || ''} onSave={(v) => save('milestone_label', v)} placeholder="(label)" className="font-semibold" />
        </div>
        <div>
          <span className="text-[10px] uppercase text-neutral-500 mr-2">%:</span>
          <InlineEditable value={String(m.percent ?? 0)} onSave={(v) => save('milestone.percent', Number(v) || 0)} placeholder="0" />
        </div>
      </div>
      <div className="mt-2 text-xs text-neutral-700">
        <div>Subtotal: <InlineEditable value={fmtCurrency(m.subtotal_cents)} onSave={(v) => save('milestone.subtotal_cents', parseCurrency(v))} placeholder="$0.00" /></div>
        <div>Labor portion: <InlineEditable value={fmtCurrency(m.labor_portion_cents)} onSave={(v) => save('milestone.labor_portion_cents', parseCurrency(v))} placeholder="$0.00" /></div>
        <div>Materials portion: <InlineEditable value={fmtCurrency(m.materials_portion_cents)} onSave={(v) => save('milestone.materials_portion_cents', parseCurrency(v))} placeholder="$0.00" /></div>
      </div>
      <div className="mt-2 text-xs">
        <span className="text-[10px] uppercase text-neutral-500 mr-2">Condition:</span>
        <InlineEditable value={payload.milestone_condition || ''} onSave={(v) => save('milestone_condition', v)} multiline placeholder="(condition)" />
      </div>
    </div>
  );
}

function LineItemsBlock({ payload, save }) {
  const items = payload.line_items || [];

  const setItems = (next) => save('line_items', next);
  const addItem = () => setItems([...items, { description: 'New item', qty: 1, unit_price_cents: 0, amount_cents: 0 }]);
  const deleteItem = (i) => setItems(items.filter((_, x) => x !== i));
  const updateItem = (i, patch) => {
    const next = items.map((x, j) => j === i ? { ...x, ...patch } : x);
    // recompute amount_cents when qty or unit_price changed
    if (patch.qty !== undefined || patch.unit_price_cents !== undefined) {
      const merged = next[i];
      next[i] = {
        ...merged,
        amount_cents: Math.round((Number(merged.qty) || 0) * (Number(merged.unit_price_cents) || 0)),
      };
    }
    setItems(next);
  };

  return (
    <div>
      <SectionHeader id="line_items" title="Line Items" />
      {items.length === 0 && (
        <div className="border-2 border-dashed border-neutral-300 rounded p-6 text-center text-xs text-neutral-500 my-4">
          No line items yet. Click "+ Line item" below.
        </div>
      )}
      {items.length > 0 && (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b-2 border-neutral-800 bg-neutral-100">
              <th className="text-left p-1 w-1/2">Description</th>
              <th className="text-right p-1 w-16">Qty</th>
              <th className="text-right p-1 w-24">Unit $</th>
              <th className="text-right p-1 w-24">Amount</th>
              <th className="w-6"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((t, i) => (
              <tr key={i} className="border-b border-neutral-200 group">
                <td className="p-1">
                  <InlineEditable
                    value={t.description || ''}
                    onSave={(v) => updateItem(i, { description: v })}
                    placeholder="(description)"
                    multiline
                  />
                </td>
                <td className="p-1 text-right">
                  <InlineEditable
                    value={String(t.qty ?? 1)}
                    onSave={(v) => updateItem(i, { qty: Number(v) || 0 })}
                    placeholder="1"
                  />
                </td>
                <td className="p-1 text-right">
                  <InlineEditable
                    value={fmtCurrency(t.unit_price_cents)}
                    onSave={(v) => updateItem(i, { unit_price_cents: parseCurrency(v) })}
                    placeholder="$0.00"
                  />
                </td>
                <td className="p-1 text-right font-mono">
                  {fmtCurrency(t.amount_cents)}
                </td>
                <td>
                  <button
                    onClick={() => deleteItem(i)}
                    className="text-red-600 text-[10px] opacity-0 group-hover:opacity-100"
                    title="Delete line item"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-2">
        <button onClick={addItem} className="text-xs text-sunvic-700 hover:underline">
          + Line item
        </button>
      </div>
    </div>
  );
}

function TotalsBlock({ payload, save }) {
  const tax = payload.tax || {};
  const totals = payload.totals || {};
  return (
    <div data-section-id="totals" className="mt-4">
      <div className="flex justify-end">
        <table className="text-xs w-72">
          <tbody>
            <tr>
              <td className="p-1 text-right text-neutral-600">Subtotal:</td>
              <td className="p-1 text-right font-mono">
                <InlineEditable value={fmtCurrency(totals.subtotal_cents)} onSave={(v) => save('totals.subtotal_cents', parseCurrency(v))} placeholder="$0.00" />
              </td>
            </tr>
            <tr>
              <td className="p-1 text-right text-neutral-600">
                Tax (<InlineEditable value={String(tax.rate_percent ?? 0)} onSave={(v) => save('tax.rate_percent', Number(v) || 0)} placeholder="0" />%,{' '}
                <select
                  value={tax.applies_to || 'materials_only'}
                  onChange={(e) => save('tax.applies_to', e.target.value)}
                  className="bg-transparent text-xs border-b border-neutral-300 hover:border-sunvic-500 focus:border-sunvic-500 focus:outline-none"
                >
                  <option value="materials_only">materials only</option>
                  <option value="labor_only">labor only</option>
                  <option value="both">both</option>
                  <option value="none">none</option>
                </select>):
              </td>
              <td className="p-1 text-right font-mono">
                <InlineEditable value={fmtCurrency(tax.amount_cents)} onSave={(v) => save('tax.amount_cents', parseCurrency(v))} placeholder="$0.00" />
              </td>
            </tr>
            <tr className="border-t border-neutral-800">
              <td className="p-1 text-right font-bold">Total due:</td>
              <td className="p-1 text-right font-mono font-bold text-base">
                <InlineEditable value={fmtCurrency(totals.total_due_cents)} onSave={(v) => save('totals.total_due_cents', parseCurrency(v))} placeholder="$0.00" />
              </td>
            </tr>
            {totals.remaining_after_cents != null && (
              <tr>
                <td className="p-1 text-right text-neutral-600 text-[10px]">Remaining after this payment:</td>
                <td className="p-1 text-right font-mono text-[10px]">
                  {fmtCurrency(totals.remaining_after_cents)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PriorPaymentsBlock({ payload, save }) {
  const prior = payload.prior_payments || [];
  if (prior.length === 0) return null;

  const setPrior = (next) => save('prior_payments', next);
  return (
    <div>
      <SectionHeader id="prior_payments" title="Prior Payments" />
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-neutral-800">
            <th className="text-left p-1">Date</th>
            <th className="text-left p-1">Milestone</th>
            <th className="text-right p-1">Amount</th>
          </tr>
        </thead>
        <tbody>
          {prior.map((p, i) => (
            <tr key={i} className="border-b border-neutral-200 group">
              <td className="p-1">
                <InlineEditable value={p.date || ''} onSave={(v) => setPrior(prior.map((x, j) => j === i ? { ...x, date: v } : x))} placeholder="YYYY-MM-DD" />
              </td>
              <td className="p-1">
                <InlineEditable value={p.milestone || ''} onSave={(v) => setPrior(prior.map((x, j) => j === i ? { ...x, milestone: v } : x))} placeholder="(milestone)" />
              </td>
              <td className="p-1 text-right font-mono">
                <InlineEditable value={fmtCurrency(p.amount_cents)} onSave={(v) => setPrior(prior.map((x, j) => j === i ? { ...x, amount_cents: parseCurrency(v) } : x))} placeholder="$0.00" />
                <button
                  onClick={() => setPrior(prior.filter((_, j) => j !== i))}
                  className="ml-2 text-red-600 text-[10px] opacity-0 group-hover:opacity-100"
                >×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1">
        <button
          onClick={() => setPrior([...prior, { date: '', milestone: '', amount_cents: 0 }])}
          className="text-xs text-sunvic-700 hover:underline"
        >+ Prior payment</button>
      </div>
    </div>
  );
}

function PaymentMethodsBlock({ payload, save }) {
  const methods = payload.payment_methods || [];
  const setMethods = (next) => save('payment_methods', next);
  return (
    <div>
      <SectionHeader id="payment_methods" title="Payment Methods" />
      <ul className="list-disc ml-5 text-xs text-neutral-800 leading-relaxed">
        {methods.map((m, i) => (
          <li key={i} className="group">
            <InlineEditable
              value={m || ''}
              onSave={(v) => setMethods(methods.map((x, j) => j === i ? v : x))}
              placeholder="(payment method)"
            />
            <button
              onClick={() => setMethods(methods.filter((_, j) => j !== i))}
              className="ml-2 text-red-600 text-[10px] opacity-0 group-hover:opacity-100"
            >×</button>
          </li>
        ))}
        <li>
          <button
            onClick={() => setMethods([...methods, 'New method'])}
            className="text-[10px] text-sunvic-700"
          >+ method</button>
        </li>
      </ul>
    </div>
  );
}

function TermsBlock({ payload, save, locks }) {
  const terms = payload.invoice_terms || {};
  return (
    <div>
      <SectionHeader id="terms" title="Invoice Terms" />
      <div className="text-xs text-neutral-800 leading-relaxed">
        <InlineEditable
          value={terms.text || ''}
          onSave={(v) => save('invoice_terms.text', v)}
          multiline
          placeholder="(invoice terms)"
          as="p"
          locked={locks['invoice_terms.text']}
        />
      </div>
    </div>
  );
}

export function HtmlInvoiceMirror({ payload, onSave, locks = {}, docNumber, scrollRef }) {
  const save = (path, value) => onSave({ [path]: value });

  return (
    <div ref={scrollRef} className="overflow-y-auto h-full py-6 px-4 bg-neutral-100">
      <div className="max-w-[850px] mx-auto bg-white shadow-lg rounded-md p-8 text-neutral-900" style={{ fontFamily: 'Liberation Sans, Arimo, DejaVu Sans' }}>
        <HeaderBlock payload={payload} save={save} locks={locks} docNumber={docNumber} />
        <MilestoneBanner payload={payload} save={save} />
        <LineItemsBlock payload={payload} save={save} />
        <TotalsBlock payload={payload} save={save} />
        <PriorPaymentsBlock payload={payload} save={save} />
        <PaymentMethodsBlock payload={payload} save={save} />
        <TermsBlock payload={payload} save={save} locks={locks} />
      </div>
    </div>
  );
}

export default HtmlInvoiceMirror;
