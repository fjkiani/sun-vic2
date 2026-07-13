// ProjectsListPage — grid of all projects the user owns.
// Each card shows homeowner, address, contract total, status.

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

function fmtUSD(cents) {
  return ((Number(cents) || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

const STATUS_TONE = {
  active:    'bg-blue-100 text-blue-800',
  on_hold:   'bg-amber-100 text-amber-800',
  completed: 'bg-green-100 text-green-800',
  archived:  'bg-neutral-200 text-neutral-600',
};

export function ProjectsListPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['projects', statusFilter, q],
    queryFn: () => api.listProjects({ ...(statusFilter ? { status: statusFilter } : {}), ...(q ? { q } : {}) }),
  });

  const projects = data?.projects || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Projects</h1>
          <p className="text-sm text-neutral-500">One project per homeowner / property — see contracts, invoices, and money flow in one place.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, homeowner, or address…"
          className="flex-1 max-w-md rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="on_hold">On hold</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {isLoading && <div className="text-neutral-500">Loading projects…</div>}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          Failed to load projects: {error.message}
          {String(error.detail || '').includes('projects') && (
            <div className="mt-1 text-xs">
              Have you run <code className="bg-red-100 px-1 py-0.5 rounded">0003_projects.sql</code> in the Supabase SQL editor?
            </div>
          )}
        </div>
      )}
      {!isLoading && !error && projects.length === 0 && (
        <div className="border-2 border-dashed border-neutral-300 rounded-xl p-12 text-center text-neutral-500">
          <div className="text-sm">No projects yet.</div>
          <div className="text-xs mt-1">Projects are created automatically when you make a new contract or invoice.</div>
          <Link to="/documents/new" className="inline-block mt-3 px-3 py-1.5 rounded bg-sunvic-500 hover:bg-sunvic-600 text-white text-sm font-semibold">
            New Document
          </Link>
        </div>
      )}
      {!isLoading && projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="bg-white border border-neutral-200 hover:border-sunvic-400 hover:shadow-sm transition rounded-xl p-4"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="font-semibold text-neutral-900 truncate">{p.name}</div>
                <span className={`text-[10px] uppercase px-2 py-0.5 rounded ${STATUS_TONE[p.status] || 'bg-neutral-100'}`}>
                  {p.status.replace('_', ' ')}
                </span>
              </div>
              {p.homeowner_name && (
                <div className="text-xs text-neutral-600 truncate">{p.homeowner_name}</div>
              )}
              {p.property_address && (
                <div className="text-xs text-neutral-500 truncate">{p.property_address}</div>
              )}
              {p.homeowner_email && (
                <div className="text-xs text-neutral-500 truncate">{p.homeowner_email}</div>
              )}
              <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center justify-between">
                <span className="text-[10px] uppercase text-neutral-500">Contract</span>
                <span className="font-mono font-bold text-sm text-neutral-800">{fmtUSD(p.contract_total_cents)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProjectsListPage;
