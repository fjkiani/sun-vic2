import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

function fmtUSD(cents) {
  return ((Number(cents) || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
const STATUS_STYLES = {
  draft:    'bg-neutral-100 text-neutral-700 border-neutral-200',
  sent:     'bg-blue-50 text-blue-700 border-blue-200',
  signed:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  paid:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  overdue:  'bg-rose-50 text-rose-700 border-rose-200',
  void:     'bg-neutral-50 text-neutral-400 border-neutral-200',
};

export function DocumentsListPage() {
  const [templateFilter, setTemplateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');
  const params = {};
  if (templateFilter) params.template = templateFilter;
  if (statusFilter) params.status = statusFilter;
  if (q) params.q = q;
  const { data, isLoading, error } = useQuery({
    queryKey: ['documents', params],
    queryFn: () => api.listDocuments(params),
  });
  const docs = data?.documents || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Documents</h1>
        <div className="flex gap-2">
          <Link to="/documents/new?template=contract" className="px-4 py-2 rounded-md bg-sunvic-500 hover:bg-sunvic-600 text-white text-sm font-semibold">
            + New Contract
          </Link>
          <Link to="/documents/new?template=invoice" className="px-4 py-2 rounded-md border border-sunvic-500 text-sunvic-600 hover:bg-sunvic-50 text-sm font-semibold">
            + New Invoice
          </Link>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <div className="text-xs text-neutral-500 uppercase font-semibold mb-1">Template</div>
          <select className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm" value={templateFilter} onChange={(e) => setTemplateFilter(e.target.value)}>
            <option value="">All</option>
            <option value="contract">Contracts</option>
            <option value="invoice">Invoices</option>
          </select>
        </div>
        <div>
          <div className="text-xs text-neutral-500 uppercase font-semibold mb-1">Status</div>
          <select className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Any</option>
            {['draft','sent','signed','paid','overdue','void'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="text-xs text-neutral-500 uppercase font-semibold mb-1">Search</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="title contains…"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase font-semibold">
            <tr>
              <th className="text-left px-4 py-2">Number</th>
              <th className="text-left px-4 py-2">Template</th>
              <th className="text-left px-4 py-2">Title / Client</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Total</th>
              <th className="text-left px-4 py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="p-8 text-center text-neutral-500">Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={6} className="p-8 text-center text-rose-600">Error: {error.message}</td></tr>
            ) : docs.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-neutral-500">No documents yet. Create your first contract or invoice above.</td></tr>
            ) : docs.map((d) => (
              <tr key={d.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link to={`/documents/${d.id}`} className="text-sunvic-600 font-mono hover:underline">{d.doc_number}</Link>
                </td>
                <td className="px-4 py-3 capitalize">{d.template}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{d.title || '—'}</div>
                  <div className="text-xs text-neutral-500">{d.client_name || 'no client'}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded border font-semibold uppercase ${STATUS_STYLES[d.status] || STATUS_STYLES.draft}`}>
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono">{fmtUSD(d.total_cents)}</td>
                <td className="px-4 py-3 text-neutral-500 text-xs">{fmtDate(d.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
