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

function StatusBadge({ status }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-semibold uppercase ${STATUS_STYLES[status] || STATUS_STYLES.draft}`}>
      {status}
    </span>
  );
}

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
      <div className="flex items-start md:items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl md:text-2xl font-bold">Documents</h1>
        <div className="flex gap-2 flex-wrap">
          <Link to="/documents/new?template=contract" className="px-3 md:px-4 py-2 rounded-md bg-sunvic-500 hover:bg-sunvic-600 text-white text-sm font-semibold">
            + Contract
          </Link>
          <Link to="/documents/new?template=invoice" className="px-3 md:px-4 py-2 rounded-md border border-sunvic-500 text-sunvic-600 hover:bg-sunvic-50 text-sm font-semibold">
            + Invoice
          </Link>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-3 md:p-4 flex flex-wrap gap-3 items-end">
        <div className="w-full sm:w-auto">
          <div className="text-xs text-neutral-500 uppercase font-semibold mb-1">Template</div>
          <select className="w-full sm:w-auto rounded-md border border-neutral-300 px-2 py-1.5 text-sm" value={templateFilter} onChange={(e) => setTemplateFilter(e.target.value)}>
            <option value="">All</option>
            <option value="contract">Contracts</option>
            <option value="invoice">Invoices</option>
          </select>
        </div>
        <div className="w-full sm:w-auto">
          <div className="text-xs text-neutral-500 uppercase font-semibold mb-1">Status</div>
          <select className="w-full sm:w-auto rounded-md border border-neutral-300 px-2 py-1.5 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Any</option>
            {['draft','sent','signed','paid','overdue','void'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-full sm:min-w-[200px]">
          <div className="text-xs text-neutral-500 uppercase font-semibold mb-1">Search</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="title contains…"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
        </div>
      </div>

      {/* Mobile: card list */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-6 text-center text-neutral-500">Loading…</div>
        ) : error ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-6 text-center text-rose-600">Error: {error.message}</div>
        ) : docs.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-6 text-center text-neutral-500">No documents yet. Create your first contract or invoice above.</div>
        ) : docs.map((d) => (
          <Link key={d.id} to={`/documents/${d.id}`}
            className="block bg-white border border-neutral-200 rounded-xl p-3 active:bg-neutral-50">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="font-mono text-sunvic-600 font-semibold text-sm">{d.doc_number}</div>
              <StatusBadge status={d.status} />
            </div>
            <div className="font-medium text-sm truncate">{d.title || '—'}</div>
            <div className="text-xs text-neutral-500 truncate mb-1">{d.client_name || 'no client'} · {d.template}</div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono font-semibold text-neutral-800">{fmtUSD(d.total_cents)}</span>
              <span className="text-neutral-500">{fmtDate(d.updated_at)}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block bg-white border border-neutral-200 rounded-xl overflow-hidden">
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
                <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
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
