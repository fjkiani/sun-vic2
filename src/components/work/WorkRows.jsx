import React from 'react';
import { Link } from 'react-router-dom';
import { SwipeableRow } from '../ui/SwipeableRow.jsx';
import { formatUSD } from '../ui/MoneyInput.jsx';
import { isDocGuarded, isProjectGuarded } from './useSwipeDelete.js';
import { docHref, projectHref } from '../../lib/slugs.js';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const STATUS_STYLES = {
  draft:   'bg-neutral-100 text-neutral-700 border-neutral-200',
  sent:    'bg-blue-50 text-blue-700 border-blue-200',
  signed:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  paid:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  overdue: 'bg-rose-50 text-rose-700 border-rose-200',
  void:    'bg-neutral-50 text-neutral-400 border-neutral-200',
};

export function StatusBadge({ status }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold uppercase ${STATUS_STYLES[status] || STATUS_STYLES.draft}`}>
      {status}
    </span>
  );
}

// A locked row shows why it is locked, so the confirm sheet is never a surprise.
function LockHint() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-neutral-400" title="Swipe asks for confirmation">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
      issued
    </span>
  );
}

// Pointer-swipe is the mobile gesture; on a desktop pointer it is undiscoverable, so md+
// also gets an explicit button. Both triggers run the SAME policy — one code path.
function DesktopDeleteButton({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      className="hidden md:grid absolute top-2 right-2 place-items-center w-9 h-9 rounded-lg text-neutral-300 hover:text-rose-600 hover:bg-rose-50"
      aria-label={label}
      title={label}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
      </svg>
    </button>
  );
}

export function DocumentRow({ doc, onSwipe }) {
  const guarded = isDocGuarded(doc);
  return (
    <SwipeableRow
      className="rounded-xl border border-neutral-200 bg-white"
      requireConfirm={guarded}
      onAction={() => onSwipe(doc, false)}
      onConfirmRequired={() => onSwipe(doc, true)}
      actionLabel={guarded ? 'Review' : 'Delete'}
    >
      <DesktopDeleteButton onClick={() => onSwipe(doc, guarded)} label={`Delete ${doc.doc_number}`} />
      <Link to={docHref(doc)} className="block p-3 md:pr-12 active:bg-neutral-50">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <div className="font-mono text-sunvic-600 font-semibold text-sm">{doc.doc_number}</div>
          <StatusBadge status={doc.status} />
        </div>
        <div className="font-medium text-[15px] truncate">{doc.title || '—'}</div>
        <div className="text-xs text-neutral-500 truncate">{doc.client_name || 'no client'} · {doc.template}</div>
        <div className="flex items-center justify-between text-xs mt-1.5">
          <span className="font-mono font-semibold text-neutral-800 text-sm">{formatUSD(doc.total_cents)}</span>
          <span className="flex items-center gap-2 text-neutral-400">
            {guarded && <LockHint />}
            {fmtDate(doc.updated_at)}
          </span>
        </div>
      </Link>
    </SwipeableRow>
  );
}

export function ProjectRow({ project, onSwipe }) {
  const guarded = isProjectGuarded(project);
  return (
    <SwipeableRow
      className="rounded-xl border border-neutral-200 bg-white"
      requireConfirm={guarded}
      onAction={() => onSwipe(project, false)}
      onConfirmRequired={() => onSwipe(project, true)}
      actionLabel={guarded ? 'Review' : 'Delete'}
    >
      <DesktopDeleteButton onClick={() => onSwipe(project, guarded)} label={`Delete ${project.name}`} />
      <Link to={projectHref(project)} className="block p-3 md:pr-12 active:bg-neutral-50">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-neutral-900 truncate">{project.name}</div>
          <span className="text-[10px] uppercase font-semibold text-neutral-500">{project.status}</span>
        </div>
        <div className="text-xs text-neutral-500 truncate">
          {project.homeowner_name || '—'}{project.property_address ? ` · ${project.property_address}` : ''}
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-sm font-mono font-semibold text-neutral-800">{formatUSD(project.contract_total_cents)}</span>
          {guarded && <LockHint />}
        </div>
      </Link>
    </SwipeableRow>
  );
}
