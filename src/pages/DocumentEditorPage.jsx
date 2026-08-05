import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { PDFPreview } from '../components/PDFPreview.jsx';
import { AgentChatPanel } from '../components/AgentChatPanel.jsx';
import { ContractFormEditor } from '../components/editors/ContractFormEditor.jsx';
import { InvoiceEditor as InvoiceFormEditor } from '../components/editors/InvoiceFormEditor.jsx';
import { LegalEditor } from '../components/editors/LegalEditor.jsx';
import { DocumentMirror } from '../components/DocumentMirror.jsx';
import { ColumnHeader } from '../components/editor/ColumnHeader.jsx';
import { ColumnResizer } from '../components/editor/ColumnResizer.jsx';
import { SegmentedTabs } from '../components/SegmentedTabs.jsx';
import { DocAiTab } from '../components/doc/DocAiTab.jsx';
import { DocSubTabs } from '../components/doc/DocSubTabs.jsx';
import { formTabsFor, LEGAL_TABS } from '../components/doc/docSections.js';
import { DocAskBar } from '../components/agent/DocAskBar.jsx';
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

const LAYOUT_KEY = 'sunvic.editor.layout.v2';
function loadLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function saveLayout(layout) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch {}
}
const DEFAULT_LAYOUT = {
  leftCollapsed: false, midCollapsed: false, rightCollapsed: false,
  leftBasis: 25, midBasis: 40, rightBasis: 35, scrollSync: true,
};

// Detect mobile viewport via matchMedia so 3-col layout only runs on md+.
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
  // Flat top-level tab. On mobile the AI tab is primary (default). No nested tabs.
  // ai | form | legal | preview | pdf
  const [tab, setTab] = useState('ai');
  // Second level: which group of payload blocks the Form / Legal tab is showing.
  // Kept per primary tab so switching Form -> Legal -> Form returns you where you were.
  const [formSub, setFormSub] = useState('homeowner');
  const [legalSub, setLegalSub] = useState('terms');
  const [emailTo, setEmailTo] = useState('');
  const [busyOp, setBusyOp] = useState(null);

  // Replaces h-[calc(100vh-9.5rem)]. 100vh over-measures on iOS Safari (it is the height
  // with the toolbar retracted), so the bottom of the pane sat behind the browser chrome.
  // This measures the real visual viewport and re-measures when the keyboard opens.
  const paneRef = useRef(null);
  const paneHeight = useFillHeight(paneRef, { bottomGap: bottomBarGap() + 8, min: 320 });

  const [layout, setLayout] = useState(() => loadLayout() || DEFAULT_LAYOUT);
  const containerRef = useRef(null);
  const leftScrollRef = useRef(null);
  const midScrollRef = useRef(null);
  const syncingRef = useRef(false);

  const docIdRef = useRef(null);
  const updatedAtRef = useRef(null);

  useEffect(() => {
    if (!data?.document) return;
    // Our own PATCH calls setDoc(result.document) but never writes the query cache, so
    // adopting `data` unconditionally could overwrite fresher local state with an older
    // cached document. With staleTime 30s and refetchOnWindowFocus on, backgrounding the
    // app mid-save is the reachable path.
    //
    // Honest scope: this was originally written to explain a chip that appeared not to
    // re-render after Unlock. That symptom turned out to be a test-harness artifact (the
    // chip's aria-label changes on unlock, so the selector re-resolved to a different,
    // still-locked chip) — the UI was correct all along. This guard is kept on its own
    // merits as a monotonicity invariant, not as a fix for that symptom: never let an
    // older document overwrite a newer one. updated_at is already the token we trust for
    // optimistic concurrency, so reuse it rather than inventing a second signal.
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
  useEffect(() => { saveLayout(layout); }, [layout]);

  const { queueSave, flushNow, saving, lastSaved, error: saveError, conflict, dismissConflict } = useDebouncedSave({
    apiCall: async (patch) => {
      const id = docIdRef.current;
      const expected = updatedAtRef.current;
      if (!id) throw new Error('no document loaded');
      const opts = expected ? { expectedUpdatedAt: expected } : {};
      const result = await api.updateDocument(id, patch, opts);
      if (result?.document) {
        setDoc(result.document);
        updatedAtRef.current = result.document.updated_at;
      }
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

  // When the agent updates the doc, refresh revisions so the change summary stays current.
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
  async function runEmail(to) {
    if (!doc) return;
    const recipient = (to ?? emailTo).trim() || doc.client_email;
    if (!recipient) { setTab('form'); return; } // need an email — send user to the form
    await flushNow();
    setBusyOp('email');
    try {
      await api.emailDocument(doc.id, { to: recipient });
      alert(`Sent to ${recipient}`);
      refetch();
    } catch (e) { alert(`Email failed: ${e.message || e}`); } finally { setBusyOp(null); }
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

  // Scroll sync (desktop only)
  useEffect(() => {
    if (isMobile || !layout.scrollSync) return;
    const left = leftScrollRef.current;
    const mid = midScrollRef.current;
    if (!left || !mid) return;
    const sync = (source, target) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      const sMax = source.scrollHeight - source.clientHeight;
      const tMax = target.scrollHeight - target.clientHeight;
      if (sMax <= 0 || tMax <= 0) { syncingRef.current = false; return; }
      const ratio = source.scrollTop / sMax;
      target.scrollTop = ratio * tMax;
      requestAnimationFrame(() => { syncingRef.current = false; });
    };
    const onLeft = () => sync(left, mid);
    const onMid = () => sync(mid, left);
    left.addEventListener('scroll', onLeft, { passive: true });
    mid.addEventListener('scroll', onMid, { passive: true });
    return () => {
      left.removeEventListener('scroll', onLeft);
      mid.removeEventListener('scroll', onMid);
    };
  }, [isMobile, layout.scrollSync, layout.leftCollapsed, layout.midCollapsed]);

  const handleResize = useCallback((which, dx) => {
    if (!containerRef.current) return;
    const totalPx = containerRef.current.clientWidth;
    if (totalPx <= 0) return;
    const dPct = (dx / totalPx) * 100;
    setLayout((l) => {
      const next = { ...l };
      if (which === 'left-mid') {
        next.leftBasis = Math.max(10, Math.min(70, l.leftBasis + dPct));
        next.midBasis = Math.max(10, Math.min(70, l.midBasis - dPct));
      } else if (which === 'mid-right') {
        next.midBasis = Math.max(10, Math.min(70, l.midBasis + dPct));
        next.rightBasis = Math.max(10, Math.min(70, l.rightBasis - dPct));
      }
      return next;
    });
  }, []);

  if (isLoading) return <div className="text-neutral-500">Loading…</div>;
  if (error) return <div className="text-rose-600">Error: {error.message}</div>;
  if (!doc) return null;

  const total = doc.total_cents;
  const revisions = data?.revisions || [];

  // ─── Shared sub-panels ─────────────────────────────────────
  const formTabs = formTabsFor(doc.template);
  // `section={null}` means "render every block" — that is what desktop passes, so the
  // three-column power layout is unchanged by the mobile sub-tabs.
  const renderForm = (section) => (doc.template === 'contract'
    ? <ContractFormEditor doc={doc} onSave={saveField} onToggleLock={toggleLock} section={section} />
    : <InvoiceFormEditor doc={doc} onSave={saveField} onToggleLock={toggleLock} section={section} />);
  const renderLegal = (section) => (
    <LegalEditor doc={doc} onSave={saveField} onToggleLock={toggleLock} section={section} />
  );
  const formPanel = renderForm(null);
  const legalPanel = renderLegal(null);
  const mirrorPanel = (
    <DocumentMirror
      ref={midScrollRef}
      template={doc.template}
      payload={doc.payload}
      onSave={saveField}
      locks={doc.locks || {}}
      onToggleLock={toggleLock}
      docNumber={doc.doc_number}
    />
  );
  const pdfPanel = <PDFPreview template={doc.template} payload={doc.payload} docNumber={doc.doc_number} />;

  // Save state as words on desktop, as a coloured dot on phones — "Saved 10:32:15 AM"
  // eats a third of a 390px header for information the user does not read.
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
        {doc.project_id && (
          <Link to={`/projects/${doc.project_id}`} className="text-xs text-sunvic-700 hover:underline hidden md:inline">
            → Project
          </Link>
        )}
      </div>

      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        <label className="hidden md:flex items-center gap-1 text-xs text-neutral-600 cursor-pointer" title="Sync scroll between form editor and mirror">
          <input type="checkbox" checked={layout.scrollSync}
            onChange={(e) => setLayout((l) => ({ ...l, scrollSync: e.target.checked }))} />
          Scroll sync
        </label>
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

  // ─── Mobile layout (< md): AI-first, flat review tabs ──────
  if (isMobile) {
    const TABS = [
      { id: 'ai', label: 'AI' },
      { id: 'form', label: 'Form' },
      { id: 'legal', label: 'Legal' },
      { id: 'preview', label: 'Preview' },
      { id: 'pdf', label: 'PDF' },
    ];
    const subTabs = tab === 'form' ? formTabs : tab === 'legal' ? LEGAL_TABS : null;
    const subValue = tab === 'form' ? formSub : legalSub;
    const setSubValue = tab === 'form' ? setFormSub : setLegalSub;
    const activeGroup = subTabs?.find((t) => t.id === subValue) || null;

    // What the copilot should assume the user is looking at. Form sub-tab ids are already
    // payload section names; legal groups cover several blocks, so we hand over the block
    // list and let agentScope narrow it.
    const askScope = tab === 'form'
      ? { tab, section: subValue, blocks: activeGroup?.blocks }
      : tab === 'legal'
        ? { tab, section: activeGroup?.blocks?.length === 1 ? activeGroup.blocks[0] : undefined, blocks: activeGroup?.blocks }
        : { tab };

    return (
      <div ref={paneRef} style={paneHeight ? { height: paneHeight } : undefined} className="flex flex-col">
        {statusBar}
        {conflictBanner}

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
          {tab === 'form' && <div className="h-full overflow-y-auto p-3 pb-6">{renderForm(subValue)}</div>}
          {tab === 'legal' && <div className="h-full overflow-y-auto p-3 pb-6">{renderLegal(subValue)}</div>}
          {tab === 'preview' && <div className="h-full overflow-hidden">{mirrorPanel}</div>}
          {tab === 'pdf' && <div className="h-full bg-neutral-800">{pdfPanel}</div>}
        </div>

        {/* The copilot follows you. Before this, Form/Legal/Preview/PDF had no agent at
            all on mobile — the floating panel is md-only and the chat lived in the AI
            tab. The AI tab keeps the full conversation, so it does not need the bar. */}
        <div className="flex-shrink-0 border-x border-b border-neutral-200 rounded-b-xl bg-white overflow-hidden">
          {tab !== 'ai' && (
            <DocAskBar document={doc} scope={askScope} onDocumentUpdate={handleAgentUpdate} />
          )}
        </div>
      </div>
    );
  }

  // ─── Desktop layout (md+): AI panel + form + mirror + pdf ──
  const leftPct  = layout.leftCollapsed  ? 0 : layout.leftBasis;
  const midPct   = layout.midCollapsed   ? 0 : layout.midBasis;
  const rightPct = layout.rightCollapsed ? 0 : layout.rightBasis;
  const totalPct = leftPct + midPct + rightPct || 1;
  const leftStyle  = layout.leftCollapsed  ? { width: 40 } : { flexBasis: `${(leftPct / totalPct) * 100}%`, minWidth: 200 };
  const midStyle   = layout.midCollapsed   ? { width: 40 } : { flexBasis: `${(midPct / totalPct) * 100}%`, minWidth: 200 };
  const rightStyle = layout.rightCollapsed ? { width: 40 } : { flexBasis: `${(rightPct / totalPct) * 100}%`, minWidth: 200 };

  return (
    <div ref={paneRef} style={paneHeight ? { height: paneHeight } : undefined} className="flex flex-col">
      {statusBar}
      {conflictBanner}

      <div ref={containerRef} className="flex-1 flex overflow-hidden border-x border-b border-neutral-200 rounded-b-xl bg-neutral-50 min-h-0">
        <div style={leftStyle} className="flex flex-col bg-white overflow-hidden">
          <ColumnHeader
            title="Form editor"
            subtitle={doc.template}
            collapsed={layout.leftCollapsed}
            onToggleCollapse={() => setLayout((l) => ({ ...l, leftCollapsed: !l.leftCollapsed }))}
          />
          {!layout.leftCollapsed && (
            <div ref={leftScrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
              {formPanel}
              <div className="pt-3 border-t border-neutral-200">{legalPanel}</div>
            </div>
          )}
        </div>

        <ColumnResizer onResize={(dx) => handleResize('left-mid', dx)} />

        <div style={midStyle} className="flex flex-col bg-neutral-100 overflow-hidden">
          <ColumnHeader
            title="Live mirror"
            subtitle="click any text to edit inline"
            collapsed={layout.midCollapsed}
            onToggleCollapse={() => setLayout((l) => ({ ...l, midCollapsed: !l.midCollapsed }))}
          />
          {!layout.midCollapsed && (
            <div className="flex-1 min-h-0 overflow-hidden">{mirrorPanel}</div>
          )}
        </div>

        <ColumnResizer onResize={(dx) => handleResize('mid-right', dx)} />

        <div style={rightStyle} className="flex flex-col bg-neutral-800 overflow-hidden">
          <ColumnHeader
            title="PDF preview"
            subtitle="final rendered PDF"
            collapsed={layout.rightCollapsed}
            onToggleCollapse={() => setLayout((l) => ({ ...l, rightCollapsed: !l.rightCollapsed }))}
          />
          {!layout.rightCollapsed && (
            <div className="flex-1 min-h-0">{pdfPanel}</div>
          )}
        </div>
      </div>

      <AgentChatPanel document={doc} onDocumentUpdate={handleAgentUpdate} floating />
    </div>
  );
}
