// DocumentEditorPage — the document workspace.
//
// The "Live mirror" column that used to sit between the form editor and the PDF is gone.
// It was a third renderer of the payload that had drifted out of sync with the schema, and
// the drift was not cosmetic:
//
//   1. 11 of its 20 editable fields were bound to payload paths that do not exist.
//      `contractor.address_line_1`, `contractor.address_line_2` and `contractor.license_no`
//      are misspellings of `contractor.address` / `contractor.license_number` — which is
//      exactly why ADDRESS / ADDRESS 2 / LICENSE rendered as empty labels while PHONE and
//      EMAIL (spelled correctly) populated.
//   2. Seven more were bound to a parent *object* instead of the text leaf: `warranties`
//      rather than `warranties.text`. Because setPath assigns `cur[last] = value`, typing
//      one character into that field replaced the whole object with a string and destroyed
//      its siblings (`warranties.start_text`, `warranties.materials_text`, …).
//   3. It never consulted the lock map. `InlineEditable` is `contentEditable={!locked}` and
//      the mirror only ever looked up 12 keys, three of which were the dead names above.
//      No canonical NJ clause path was ever checked, and saveField does not filter locked
//      paths, so every legally-mandated block was freely rewritable from that pane.
//
// So it is deleted rather than patched.
//
// The claim written here previously — that click-on-the-rendered-PDF editing "cannot be done
// with @react-pdf, it rasterises to a canvas and hands back no glyph coordinates" — was wrong,
// and wrong in a way worth recording. The old preview used <PDFViewer>, which is an <iframe>
// pointed at a blob URL and handed to the browser's native PDF plugin. There were no glyph
// coordinates because the page was never in our DOM at all: no text layer, no scroll position,
// no click target. @react-pdf is still the generator, but the drawing is now pdf.js, so we own
// the canvas, the text layer and the scroller. Clicking a value maps it back to a payload path
// and edits it in place, and the form and the document scroll together.
//
// Click-to-edit resolves the path from the live payload every time (see lib/pdfTextIndex.js),
// so a drifted or misspelled path is not expressible, and an ambiguous click is a no-op with a
// toast rather than a guess. That is the specific defect the mirror had, made unrepeatable.
//
// The other change is that the project is no longer a separate destination. A Project tab
// hosts the same ProjectWorkspace that /projects/:id renders, so the copilot, pipeline,
// money and milestones for the job are reachable without leaving the contract.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { docHref, isUuid, projectHref } from '../lib/slugs.js';
import { PdfDocView } from '../components/pdf/PdfDocView.jsx';
import { AgentChatPanel } from '../components/AgentChatPanel.jsx';
import { ContractFormEditor } from '../components/editors/ContractFormEditor.jsx';
import { InvoiceEditor as InvoiceFormEditor } from '../components/editors/InvoiceFormEditor.jsx';
import { LegalEditor } from '../components/editors/LegalEditor.jsx';
import { ColumnHeader } from '../components/editor/ColumnHeader.jsx';
import { ColumnResizer } from '../components/editor/ColumnResizer.jsx';
import { SegmentedTabs } from '../components/SegmentedTabs.jsx';
import { DocAiTab } from '../components/doc/DocAiTab.jsx';
import { DocSubTabs } from '../components/doc/DocSubTabs.jsx';
import { formTabsFor, LEGAL_TABS, sectionForPath } from '../components/doc/docSections.js';
import { labelForPath } from '../lib/pdfTextIndex.js';
import { SendPanel } from '../components/document/SendPanel.jsx';
import { preflight } from '../../packages/validation/guardrails.js';
import { DocAskBar } from '../components/agent/DocAskBar.jsx';
import { ProjectWorkspace } from '../components/project/ProjectWorkspace.jsx';
import { useDebouncedSave } from '../hooks/useDebouncedSave.js';
import { useFillHeight, bottomBarGap } from '../hooks/useFillHeight.js';

function fmtUSD(cents) {
  return ((Number(cents) || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
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

// v3: v2 persisted a `midBasis`/`midCollapsed` pair for the mirror column. Reusing the key
// would restore a phantom third column's width for every existing user, so the key moves.
const LAYOUT_KEY = 'sunvic.editor.layout.v3';
function loadLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.leftBasis !== 'number') return null;
    return parsed;
  } catch { return null; }
}
function saveLayout(layout) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch {}
}
const DEFAULT_LAYOUT = {
  leftCollapsed: false, rightCollapsed: false,
  leftBasis: 44, rightBasis: 56,
};

// Detect mobile viewport via matchMedia so the multi-column layout only runs on md+.
function useIsMobile() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mm = window.matchMedia('(max-width: 767px)');
    const onChange = (e) => setMobile(e.matches);
    mm.addEventListener('change', onChange);
    return () => mm.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

export function DocumentEditorPage() {
  const { id } = useParams();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.getDocument(id),
  });

  const isMobile = useIsMobile();

  const [doc, setDoc] = useState(null);
  // Flat top-level tab. On mobile the AI tab is primary (default).
  // ai | form | legal | pdf | project
  const [tab, setTab] = useState('ai');
  // Desktop left column: form | legal | project
  const [leftTab, setLeftTab] = useState('form');
  // Desktop right column: pdf | edit
  const [docView, setDocView] = useState('pdf');
  const [focusPath, setFocusPath] = useState(null);   // the field the form and PDF are both looking at
  const syncSuppressed = useRef(false);
  const scrollTimer = useRef(null);
  // Second level: which group of payload blocks the Form / Legal tab is showing.
  const [formSub, setFormSub] = useState('homeowner');
  const [legalSub, setLegalSub] = useState('terms');
  const [emailTo, setEmailTo] = useState('');
  const [sendOpen, setSendOpen] = useState(false);
  const [busyOp, setBusyOp] = useState(null);

  const paneRef = useRef(null);
  const paneHeight = useFillHeight(paneRef, { bottomGap: bottomBarGap() + 8, min: 320 });

  const [layout, setLayout] = useState(() => loadLayout() || DEFAULT_LAYOUT);
  const containerRef = useRef(null);
  const leftScrollRef = useRef(null);

  const docIdRef = useRef(null);
  const updatedAtRef = useRef(null);

  useEffect(() => {
    if (!data?.document) return;
    // Monotonicity invariant: our own PATCH calls setDoc(result.document) but never writes
    // the query cache, so adopting `data` unconditionally could overwrite fresher local
    // state with an older cached document. With staleTime 30s and refetchOnWindowFocus on,
    // backgrounding the app mid-save is the reachable path. updated_at is already the token
    // we trust for optimistic concurrency, so reuse it rather than inventing a second one.
    setDoc((cur) => {
      if (!cur || cur.id !== data.document.id) return data.document;
      const incoming = Date.parse(data.document.updated_at || 0) || 0;
      const current = Date.parse(cur.updated_at || 0) || 0;
      return incoming >= current ? data.document : cur;
    });
  }, [data]);
  useEffect(() => {
    docIdRef.current = doc?.id || null;
    updatedAtRef.current = doc?.updated_at || null;
  }, [doc?.id, doc?.updated_at]);

  // Links that were sent out as raw UUIDs still open, but the address bar upgrades itself to
  // the document number so anything copied from here afterwards is readable. Seed the cache
  // under the new key first, otherwise the key change costs a second fetch and a blank flash.
  const nav = useNavigate();
  const qc = useQueryClient();
  useEffect(() => {
    if (!data?.document?.doc_number || !isUuid(id)) return;
    qc.setQueryData(['document', data.document.doc_number], data);
    nav(docHref(data.document), { replace: true });
  }, [data, id, nav, qc]);
  useEffect(() => { saveLayout(layout); }, [layout]);

  // ─── Project context ───────────────────────────────────────
  // Only fetched once the user actually opens the Project surface. Every document load
  // paying for a summary request it may never show is the kind of cost that gets blamed on
  // "the app feels slow" later.
  const projectId = doc?.project_id || null;
  const projectWanted = (isMobile && tab === 'project') || (!isMobile && leftTab === 'project');
  const [projectTouched, setProjectTouched] = useState(false);
  // useDebouncedSave exposes `error` read-only, so the restore action carries its own state
  // rather than reaching for a setter that does not exist.
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState(null);
  // Locked paths the server refused to write on the last save. Never surfaced before.
  const [droppedWrites, setDroppedWrites] = useState(null);
  useEffect(() => { if (projectWanted) setProjectTouched(true); }, [projectWanted]);

  const projectQuery = useQuery({
    queryKey: ['project-summary', projectId],
    queryFn: () => api.getProjectSummary(projectId),
    enabled: !!projectId && projectTouched,
    refetchOnWindowFocus: true,
  });

  const saveProjectPatch = useCallback(async (patch) => {
    if (!projectId) return;
    await api.updateProject(projectId, patch);
    projectQuery.refetch();
  }, [projectId, projectQuery]);

  const { queueSave, flushNow, saving, lastSaved, error: saveError, conflict, dismissConflict } = useDebouncedSave({
    apiCall: async (patch) => {
      const docId = docIdRef.current;
      const expected = updatedAtRef.current;
      if (!docId) throw new Error('no document loaded');
      const opts = expected ? { expectedUpdatedAt: expected } : {};
      const result = await api.updateDocument(docId, patch, opts);
      if (result?.document) {
        setDoc(result.document);
        updatedAtRef.current = result.document.updated_at;
      }
      // The server answers 200 and reports every locked path it refused to write, in
      // `skipped_locks`. Nothing read it. Combined with the setDoc above — which replaces local
      // state with the server's copy — a write to a locked path meant the user typed, watched
      // the text appear, and watched it silently revert 500ms later with no explanation. That
      // is the "off sync" report. Measured live: PATCH contractor.address returns 200 with
      // skipped_locks:["contractor.address"] and the value is unchanged (probe-lock-desync.mjs).
      const dropped = Array.isArray(result?.skipped_locks) ? result.skipped_locks : [];
      setDroppedWrites(dropped.length ? dropped : null);
      return result;
    },
    debounceMs: 500,
  });

  useEffect(() => {
    const onBeforeUnload = () => { flushNow().catch(() => {}); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      flushNow().catch(() => {});
    };
  }, [flushNow]);

  const saveField = useCallback((pathValueMap) => {
    setDoc((d) => {
      if (!d) return d;
      const nextPayload = Object.entries(pathValueMap).reduce(
        (acc, [p, v]) => setPath(acc, p, v),
        d.payload
      );
      queueSave({ payload: nextPayload });
      return { ...d, payload: nextPayload };
    });
  }, [queueSave]);

  const toggleLock = useCallback((path) => {
    setDoc((d) => {
      if (!d) return d;
      const wasLocked = !!d.locks?.[path];
      const nextLocks = { ...(d.locks || {}), [path]: !wasLocked };
      queueSave({ locks: nextLocks });
      return { ...d, locks: nextLocks };
    });
  }, [queueSave]);

  const handleAgentUpdate = useCallback((d) => {
    setDoc((c) => (c ? { ...c, ...d } : d));
    refetch();
  }, [refetch]);

  async function runGeneratePdf() {
    if (!doc) return;
    await flushNow();
    setBusyOp('pdf');
    try {
      const result = await api.generatePdf(doc.id);
      window.open(result.signed_url, '_blank');
    } catch (e) { alert(`PDF gen failed: ${e.message || e}`); } finally { setBusyOp(null); }
  }
  // Sending is no longer a button that guesses. Every path opens the checklist, which shows
  // the recipient, the blocking fields, and a jump to each one. The old body of this function
  // is the bug: with no recipient it did `setTab('form'); return;` — switched tab and died
  // without calling the API. All 17 live documents hit that branch.
  function runEmail() {
    if (!doc) return;
    setSendOpen(true);
  }
  async function setStatus(status) {
    if (!doc) return;
    await flushNow();
    try {
      const opts = updatedAtRef.current ? { expectedUpdatedAt: updatedAtRef.current } : {};
      const { document } = await api.updateDocument(doc.id, { status }, opts);
      setDoc(document);
      updatedAtRef.current = document.updated_at;
    } catch (e) { alert(`Status change failed: ${e.message || e}`); }
  }

  const handleResize = useCallback((dx) => {
    if (!containerRef.current) return;
    const totalPx = containerRef.current.clientWidth;
    if (totalPx <= 0) return;
    const dPct = (dx / totalPx) * 100;
    setLayout((l) => ({
      ...l,
      leftBasis: Math.max(20, Math.min(75, l.leftBasis + dPct)),
      rightBasis: Math.max(25, Math.min(80, l.rightBasis - dPct)),
    }));
  }, []);

  const lockedCount = useMemo(
    () => Object.values(doc?.locks || {}).filter(Boolean).length,
    [doc?.locks]
  );

  // Readiness, evaluated in the browser against the live payload with the same pure function
  // the server uses. This is what the Send button reports, so the button cannot claim to work
  // and then do nothing.
  const sendCheck = useMemo(
    () => (doc ? preflight(doc, 'email', {}) : { ok: false, blocking: [], issues: [] }),
    [doc]
  );

  // ─── Scroll sync ───────────────────────────────────────────
  // Iteration 7 deleted the old sync because it was proportional: it mapped "40% down the form"
  // to "40% down the PDF", which is meaningless when the two have different lengths and section
  // orders. This version is positional — it tracks the field row nearest the top of the form
  // viewport and tells the document to go to THAT field.
  const onFormScroll = useCallback(() => {
    const scroller = leftScrollRef.current;
    if (!scroller) return;
    if (syncSuppressed.current) return;         // the PDF drove this scroll; do not echo it back
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const rows = scroller.querySelectorAll('[data-field-path]');
      if (!rows.length) return;
      const top = scroller.getBoundingClientRect().top;
      let best = null, bestDist = Infinity;
      for (const r of rows) {
        const d = Math.abs(r.getBoundingClientRect().top - top);
        if (d < bestDist) { bestDist = d; best = r; }
      }
      const p = best?.getAttribute('data-field-path');
      if (p) setFocusPath(p);
    }, 120);
  }, []);

  // Touching any row in the form takes the document to that field. Done by delegation rather
  // than by threading a callback into all 60 FieldRows: the row already carries its payload
  // path in the DOM, so one handler on the column covers every field and cannot drift out of
  // sync with the rows the way 60 hand-passed props would. It also makes the pairing work when
  // the form column is too short to scroll, which on a laptop it usually is — an accordion
  // shows one open section at a time, often only two or three rows.
  const onFormPointer = useCallback((e) => {
    const row = e.target?.closest?.('[data-field-path]');
    const p = row?.getAttribute('data-field-path');
    if (p) setFocusPath(p);
  }, []);

  // The reverse direction: clicking a value on the document brings the form to that row.
  const scrollFormToPath = useCallback((path) => {
    const scroller = leftScrollRef.current;
    if (!scroller || !path) return;
    const row = scroller.querySelector(`[data-field-path="${CSS.escape(path)}"]`);
    if (!row) return;
    syncSuppressed.current = true;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.classList.add('ring-2', 'ring-sunvic-500', 'rounded-lg');
    setTimeout(() => row.classList.remove('ring-2', 'ring-sunvic-500', 'rounded-lg'), 1600);
    setTimeout(() => { syncSuppressed.current = false; }, 700);
  }, []);

  // "Fix →" on a blocking field. The field may be in a tab that is not selected AND a sub-tab
  // that is not selected — in which case it is not merely scrolled out of view, it is not in
  // the DOM. So select tab and sub-tab first, let React commit, and only then scroll.
  const jumpToField = useCallback((field) => {
    const loc = sectionForPath(doc?.template, field);
    if (!loc) return;                                   // fails closed rather than landing wrong
    if (loc.tab === 'form') setFormSub(loc.section); else setLegalSub(loc.section);
    setTab(loc.tab);
    setLeftTab(loc.tab);
    setSendOpen(false);
    // Two frames: one for the tab switch to commit, one for the accordion section to lay out.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setFocusPath(field);
      scrollFormToPath(field);
    }));
  }, [doc?.template, scrollFormToPath]);

  if (isLoading) return <div className="text-neutral-500">Loading…</div>;
  if (error) return <div className="text-rose-600">Error: {error.message}</div>;
  if (!doc) return null;

  const total = doc.total_cents;
  const revisions = data?.revisions || [];

  // ─── Shared sub-panels ─────────────────────────────────────
  const formTabs = formTabsFor(doc.template);
  const renderForm = (section) => (doc.template === 'contract'
    ? <ContractFormEditor doc={doc} onSave={saveField} onToggleLock={toggleLock} section={section} />
    : <InvoiceFormEditor doc={doc} onSave={saveField} onToggleLock={toggleLock} section={section} />);
  const renderLegal = (section) => (
    <LegalEditor doc={doc} onSave={saveField} onToggleLock={toggleLock} section={section} />
  );
  // The document, rendered by us and clickable. Editing a value here goes through the same
  // saveField the form uses, so it is lock-filtered and writes exactly one leaf.
  const pdfPanel = (
    <PdfDocView
      template={doc.template}
      payload={doc.payload}
      docNumber={doc.doc_number}
      locks={doc.locks}
      focusPath={focusPath}
      onEdit={(path, value) => saveField({ [path]: value })}
      onFieldFocus={scrollFormToPath}
      onVisiblePath={scrollFormToPath}
      // The two affordances the lock message used to describe in prose and not provide.
      // jumpToField already selects tab AND sub-tab before scrolling, which is the part the old
      // "Unlock it in the Legal tab" sentence could never do — an unselected sub-tab is not
      // merely off-screen, it is unmounted.
      onJumpToField={jumpToField}
      onUnlockField={toggleLock}
    />
  );

  // The mirror's job — "change the words next to the rendered page" — done with the editors
  // that already know the real payload paths and already honour the lock map.
  const editEverythingPanel = (
    <div className="h-full overflow-y-auto bg-neutral-50 p-3 md:p-4 space-y-4">
      <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600 leading-relaxed">
        Every field on the rendered document, in order.{' '}
        {lockedCount > 0
          ? <>Padlocked blocks are the New Jersey Consumer Fraud Act clauses — <b>{lockedCount}</b> of them are locked. Unlock one deliberately if you truly need to reword it.</>
          : <>No blocks are locked on this document.</>}
      </div>
      {renderForm(null)}
      <div className="pt-3 border-t border-neutral-200">{renderLegal(null)}</div>
    </div>
  );

  const projectPanel = !projectId ? (
    <div className="p-4">
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-5 text-center">
        <div className="text-sm font-semibold text-neutral-800">Not attached to a project yet</div>
        <p className="mt-1 text-xs text-neutral-500 leading-relaxed">
          A project is created automatically from the homeowner name, email and property
          address on this document. Fill those in on the Form tab and the project — with its
          money, pipeline and milestones — will appear here.
        </p>
        <button
          type="button"
          onClick={() => { setTab('form'); setLeftTab('form'); setFormSub('homeowner'); }}
          className="mt-3 inline-flex items-center justify-center min-h-[44px] px-4 rounded-lg bg-sunvic-500 hover:bg-sunvic-600 text-white text-sm font-semibold"
        >
          Go to homeowner details
        </button>
      </div>
    </div>
  ) : projectQuery.isLoading ? (
    <div className="p-4 text-sm text-neutral-500">Loading project…</div>
  ) : projectQuery.error ? (
    <div className="p-4 text-sm text-rose-600">Could not load the project: {projectQuery.error.message}</div>
  ) : (
    <div className="h-full flex flex-col p-3">
      <div className="flex-shrink-0 flex items-center justify-between gap-2 pb-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-neutral-900 truncate">
            {projectQuery.data?.project?.name || 'Project'}
          </div>
          <div className="text-[11px] text-neutral-500 truncate">
            {projectQuery.data?.project?.homeowner_name || 'No homeowner on file'}
          </div>
        </div>
        <Link
          to={projectHref(projectQuery.data?.project || { id: projectId })}
          className="flex-shrink-0 inline-flex items-center min-h-[44px] px-3 rounded-lg border border-neutral-300 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          Full page
        </Link>
      </div>

      {/*
        GET /api/projects/:id and /summary both return 200 for a soft-deleted project —
        neither filters deleted_at, unlike GET /api/projects. Measured on production, 10 of
        17 live documents pointed at trashed projects, so without this the rail presents a
        deleted project as a normal one and its money as current. Say so, and offer the
        one-tap repair rather than making the user hunt for a restore.
      */}
      {projectQuery.data?.project?.deleted_at && (
        <div className="flex-shrink-0 mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          <div className="text-xs font-semibold text-amber-900">This project is in the trash</div>
          <p className="mt-0.5 text-[11px] text-amber-800 leading-snug">
            The document is live, but its project was deleted on{' '}
            {new Date(projectQuery.data.project.deleted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}. It will not
            appear in your projects list until you restore it.
          </p>
          <button
            type="button"
            disabled={restoring}
            onClick={async () => {
              setRestoring(true);
              setRestoreError(null);
              try {
                await api.restoreProject(projectId);
                await projectQuery.refetch();
              } catch (e) { setRestoreError(e.message); }
              finally { setRestoring(false); }
            }}
            className="mt-2 inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-semibold"
          >
            {restoring ? 'Restoring…' : 'Restore this project'}
          </button>
          {restoreError && <p className="mt-1 text-[11px] text-rose-700">{restoreError}</p>}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <ProjectWorkspace
          summary={projectQuery.data}
          variant="rail"
          onSaveProject={saveProjectPatch}
          onChanged={() => { projectQuery.refetch(); refetch(); }}
        />
      </div>
    </div>
  );

  const saveTone = saveError && !conflict ? 'bg-rose-500'
    : conflict ? 'bg-amber-500'
    : saving ? 'bg-sunvic-400 animate-pulse'
    : 'bg-emerald-500';
  const saveWords = saveError && !conflict ? 'Save failed'
    : conflict ? 'Conflict'
    : saving ? 'Saving…'
    : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}`
    : 'Auto-save on';

  const statusBar = (
    <div className="flex-shrink-0 flex items-center px-2 md:px-3 py-2 bg-white border border-neutral-200 rounded-t-xl gap-2">
      <Link
        to="/work"
        aria-label="Back to Work"
        className="md:hidden grid place-items-center w-11 h-11 -ml-2 rounded-lg text-neutral-500 active:bg-neutral-100 flex-shrink-0"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </Link>

      <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
        <div className="min-w-0">
          <div className="font-mono text-sunvic-600 font-bold text-sm md:text-base truncate leading-tight">{doc.doc_number}</div>
          <div className="text-[10px] text-neutral-500 capitalize md:hidden leading-tight">{doc.template} · {doc.status}</div>
        </div>
        <div className="text-xs text-neutral-500 capitalize hidden md:block">{doc.template} · {doc.status}</div>
      </div>

      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        <span
          className={`md:hidden w-2 h-2 rounded-full ${saveTone}`}
          role="status"
          aria-label={saveWords}
          title={saveWords}
        />
        <div className="hidden md:block text-xs text-neutral-500 min-w-[120px] text-right">{saveWords}</div>
        <div className="text-right">
          <div className="text-[10px] text-neutral-500 uppercase hidden md:block">Total</div>
          <div className="font-mono font-bold text-sm">{fmtUSD(total)}</div>
        </div>
        {/* The Send button states its own readiness instead of pretending and failing silently. */}
        <button
          type="button"
          onClick={() => setSendOpen(true)}
          data-testid="send-open"
          data-blockers={sendCheck.blocking.length}
          className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl text-xs font-semibold flex-shrink-0 ${
            sendCheck.ok
              ? 'bg-sunvic-500 hover:bg-sunvic-600 text-white'
              : 'bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100'
          }`}
        >
          <span>Send</span>
          {!sendCheck.ok && (
            <span className="grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] leading-none">
              {sendCheck.blocking.length}
            </span>
          )}
        </button>
      </div>
    </div>
  );

  // The send checklist. A sheet on mobile, a right-anchored drawer on desktop — either way it
  // sits over the workspace so the document stays behind it, and "Fix →" closes it and takes
  // you to the field.
  const sendOverlay = sendOpen && (
    <div className="fixed inset-0 z-50 flex md:items-stretch md:justify-end" data-testid="send-overlay">
      <button
        type="button"
        aria-label="Close send panel"
        onClick={() => setSendOpen(false)}
        className="absolute inset-0 bg-neutral-900/40"
      />
      <div className="relative mt-auto md:mt-0 w-full md:w-[420px] max-h-[85vh] md:max-h-none md:h-full bg-white rounded-t-2xl md:rounded-none shadow-2xl overflow-hidden">
        <SendPanel
          doc={doc}
          onJumpToField={jumpToField}
          onSaveField={(path, value) => saveField({ [path]: value })}
          onBeforeSend={flushNow}
          onSent={() => { refetch(); }}
          onClose={() => setSendOpen(false)}
        />
      </div>
    </div>
  );

  const conflictBanner = conflict && (
    <div className="flex-shrink-0 bg-amber-50 border-x border-b border-amber-300 px-3 py-2 text-xs text-amber-800 flex items-center justify-between gap-2">
      <span className="flex-1">Another edit came in from a different tab. Reload to see the latest.</span>
      <div className="flex gap-2 flex-shrink-0">
        <button onClick={() => refetch()} className="px-2 py-1 rounded bg-amber-500 text-white text-xs font-semibold">Reload</button>
        <button onClick={dismissConflict} className="px-2 py-1 rounded border border-amber-400 text-amber-800 text-xs">Dismiss</button>
      </div>
    </div>
  );

  const droppedBanner = droppedWrites?.length > 0 && (
    <div
      className="flex-shrink-0 bg-rose-50 border-x border-b border-rose-300 px-3 py-2 text-xs text-rose-800 flex items-center justify-between gap-2"
      data-testid="dropped-write-banner"
    >
      <span className="flex-1 leading-snug">
        Not saved: <b>{droppedWrites.map(labelForPath).join(', ')}</b> {droppedWrites.length === 1 ? 'is' : 'are'} locked.
        {' '}Unlock {droppedWrites.length === 1 ? 'it' : 'them'} first — the padlock is on the field.
      </span>
      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={() => { droppedWrites.forEach(toggleLock); setDroppedWrites(null); }}
          className="min-h-[36px] px-2 py-1 rounded bg-rose-600 text-white text-xs font-semibold"
        >Unlock</button>
        <button onClick={() => setDroppedWrites(null)} className="min-h-[36px] px-2 py-1 rounded border border-rose-400 text-rose-800 text-xs">Dismiss</button>
      </div>
    </div>
  );

  // ─── Mobile layout (< md) ──────────────────────────────────
  if (isMobile) {
    const TABS = [
      { id: 'ai', label: 'AI' },
      { id: 'form', label: 'Form' },
      { id: 'legal', label: 'Legal' },
      { id: 'pdf', label: 'PDF' },
      { id: 'project', label: 'Project' },
    ];
    const subTabs = tab === 'form' ? formTabs : tab === 'legal' ? LEGAL_TABS : null;
    const subValue = tab === 'form' ? formSub : legalSub;
    const setSubValue = tab === 'form' ? setFormSub : setLegalSub;
    const activeGroup = subTabs?.find((t) => t.id === subValue) || null;

    const askScope = tab === 'form'
      ? { tab, section: subValue, blocks: activeGroup?.blocks }
      : tab === 'legal'
        ? { tab, section: activeGroup?.blocks?.length === 1 ? activeGroup.blocks[0] : undefined, blocks: activeGroup?.blocks }
        : { tab };

    return (
      <div ref={paneRef} style={paneHeight ? { height: paneHeight } : undefined} className="flex flex-col">
        {statusBar}
        {conflictBanner}
      {droppedBanner}

        <div className="flex-shrink-0 px-2 pt-2 bg-white border-x border-neutral-200">
          <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
        </div>

        {subTabs && (
          <div className="flex-shrink-0 py-2 bg-white border-x border-neutral-200">
            <DocSubTabs tabs={subTabs} value={subValue} onChange={setSubValue} />
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-hidden border-x border-neutral-200 bg-white">
          {tab === 'ai' && (
            <DocAiTab
              doc={doc}
              revisions={revisions}
              onDocumentUpdate={handleAgentUpdate}
              onGeneratePdf={runGeneratePdf}
              onEmail={() => runEmail()}
              busyOp={busyOp}
            />
          )}
          {tab === 'form' && <div ref={leftScrollRef} onScroll={onFormScroll} onClickCapture={onFormPointer} className="h-full overflow-y-auto p-3 pb-6">{renderForm(subValue)}</div>}
          {tab === 'legal' && <div ref={leftScrollRef} onScroll={onFormScroll} onClickCapture={onFormPointer} className="h-full overflow-y-auto p-3 pb-6">{renderLegal(subValue)}</div>}
          {tab === 'pdf' && <div className="h-full bg-neutral-800">{pdfPanel}</div>}
          {tab === 'project' && <div className="h-full overflow-hidden">{projectPanel}</div>}
        </div>

        <div className="flex-shrink-0 border-x border-b border-neutral-200 rounded-b-xl bg-white overflow-hidden">
          {tab !== 'ai' && tab !== 'project' && (
            <DocAskBar document={doc} scope={askScope} onDocumentUpdate={handleAgentUpdate} />
          )}
        </div>
        {sendOverlay}
      </div>
    );
  }

  // ─── Desktop layout (md+): workspace column + document column ──
  const leftPct  = layout.leftCollapsed  ? 0 : layout.leftBasis;
  const rightPct = layout.rightCollapsed ? 0 : layout.rightBasis;
  const totalPct = leftPct + rightPct || 1;
  const leftStyle  = layout.leftCollapsed  ? { width: 40 } : { flexBasis: `${(leftPct / totalPct) * 100}%`, minWidth: 320 };
  const rightStyle = layout.rightCollapsed ? { width: 40 } : { flexBasis: `${(rightPct / totalPct) * 100}%`, minWidth: 320 };

  const LEFT_TABS = [
    { id: 'form', label: 'Form' },
    { id: 'legal', label: 'Legal' },
    { id: 'project', label: 'Project' },
  ];
  const DOC_VIEWS = [
    { id: 'pdf', label: 'PDF' },
    { id: 'edit', label: 'Edit' },
  ];
  const leftSubTabs = leftTab === 'form' ? formTabs : leftTab === 'legal' ? LEGAL_TABS : null;
  const leftSubValue = leftTab === 'form' ? formSub : legalSub;
  const setLeftSubValue = leftTab === 'form' ? setFormSub : setLegalSub;

  return (
    <div ref={paneRef} style={paneHeight ? { height: paneHeight } : undefined} className="flex flex-col">
      {statusBar}
      {conflictBanner}
        {droppedBanner}

      <div ref={containerRef} className="flex-1 flex overflow-hidden border-x border-b border-neutral-200 rounded-b-xl bg-neutral-50 min-h-0">
        <div style={leftStyle} className="flex flex-col bg-white overflow-hidden">
          <ColumnHeader
            title="Form editor"
            subtitle={leftTab === 'project' ? 'project context' : doc.template}
            collapsed={layout.leftCollapsed}
            onToggleCollapse={() => setLayout((l) => ({ ...l, leftCollapsed: !l.leftCollapsed }))}
          />
          {!layout.leftCollapsed && (
            <>
              <div className="flex-shrink-0 px-3 pt-2">
                <SegmentedTabs tabs={LEFT_TABS} value={leftTab} onChange={setLeftTab} />
              </div>
              {leftSubTabs && (
                <div className="flex-shrink-0 py-2">
                  <DocSubTabs tabs={leftSubTabs} value={leftSubValue} onChange={setLeftSubValue} />
                </div>
              )}
              {leftTab === 'project'
                ? <div className="flex-1 min-h-0 overflow-hidden">{projectPanel}</div>
                : (
                  <div ref={leftScrollRef} onScroll={onFormScroll} onClickCapture={onFormPointer} className="flex-1 overflow-y-auto p-3 space-y-3">
                    {leftTab === 'form' ? renderForm(leftSubValue) : renderLegal(leftSubValue)}
                  </div>
                )}
            </>
          )}
        </div>

        <ColumnResizer onResize={handleResize} />

        <div style={rightStyle} className={`flex flex-col overflow-hidden ${docView === 'pdf' ? 'bg-neutral-800' : 'bg-neutral-50'}`}>
          <ColumnHeader
            title="PDF preview"
            subtitle={docView === 'pdf' ? 'final rendered PDF' : 'edit any field on the document'}
            collapsed={layout.rightCollapsed}
            onToggleCollapse={() => setLayout((l) => ({ ...l, rightCollapsed: !l.rightCollapsed }))}
          />
          {!layout.rightCollapsed && (
            <>
              <div className="flex-shrink-0 px-3 py-2 bg-white border-b border-neutral-200">
                <SegmentedTabs tabs={DOC_VIEWS} value={docView} onChange={setDocView} />
              </div>
              <div className="flex-1 min-h-0">
                {docView === 'pdf' ? pdfPanel : editEverythingPanel}
              </div>
            </>
          )}
        </div>
      </div>

      <AgentChatPanel document={doc} onDocumentUpdate={handleAgentUpdate} floating />
      {sendOverlay}
    </div>
  );
}

export default DocumentEditorPage;
