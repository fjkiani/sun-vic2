import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useDebouncedSave } from '../hooks/useDebouncedSave.js';

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
  const [tab, setTab] = useState('editor'); // editor|legal|actions (inside form panel)
  const [emailTo, setEmailTo] = useState('');
  const [busyOp, setBusyOp] = useState(null);

  // Which of the 4 columns is active on mobile: chat|form|mirror|pdf
  const [mobilePane, setMobilePane] = useState('form');

  const [layout, setLayout] = useState(() => loadLayout() || DEFAULT_LAYOUT);
  const containerRef = useRef(null);
  const leftScrollRef = useRef(null);
  const midScrollRef = useRef(null);
  const syncingRef = useRef(false);

  const docIdRef = useRef(null);
  const updatedAtRef = useRef(null);

  useEffect(() => {
    if (data?.document) setDoc(data.document);
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

  async function runGeneratePdf() {
    if (!doc) return;
    await flushNow();
    setBusyOp('pdf');
    try {
      const result = await api.generatePdf(doc.id);
      window.open(result.signed_url, '_blank');
    } catch (e) { alert(`PDF gen failed: ${e.message || e}`); } finally { setBusyOp(null); }
  }
  async function runEmail() {
    if (!doc || !emailTo.trim()) return;
    await flushNow();
    setBusyOp('email');
    try {
      await api.emailDocument(doc.id, { to: emailTo.trim() });
      alert(`Sent to ${emailTo.trim()}`);
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

  // ─── Shared sub-panels (used both mobile and desktop) ────────
  const formPanel = (
    <>
      {tab === 'editor' && (doc.template === 'contract'
        ? <ContractFormEditor doc={doc} onSave={saveField} onToggleLock={toggleLock} />
        : <InvoiceFormEditor doc={doc} onSave={saveField} onToggleLock={toggleLock} />)}
      {tab === 'legal' && <LegalEditor doc={doc} onSave={saveField} onToggleLock={toggleLock} />}
      {tab === 'actions' && (
        <div className="space-y-3 text-xs">
          <div>
            <div className="text-xs text-neutral-500 uppercase font-semibold mb-1">Status</div>
            <div className="flex flex-wrap gap-1">
              {['draft','sent','signed','paid','overdue','void'].map((s) => (
                <button key={s} onClick={() => setStatus(s)}
                  className={`text-xs px-2 py-1 rounded border ${doc.status === s ? 'bg-sunvic-500 text-white border-sunvic-500' : 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-500 uppercase font-semibold mb-1">Generate PDF</div>
            <button onClick={runGeneratePdf} disabled={busyOp === 'pdf'}
              className="w-full py-2 rounded-md bg-sunvic-500 hover:bg-sunvic-600 text-white text-sm font-semibold disabled:opacity-60">
              {busyOp === 'pdf' ? 'Generating…' : 'Generate & download PDF'}
            </button>
          </div>
          <div>
            <div className="text-xs text-neutral-500 uppercase font-semibold mb-1">Email to</div>
            <div className="flex gap-2">
              <input type="email" placeholder={doc.client_email || 'client@example.com'} value={emailTo} onChange={(e) => setEmailTo(e.target.value)}
                className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
              <button onClick={runEmail} disabled={busyOp === 'email' || !emailTo.trim()}
                className="px-3 py-1.5 rounded-md bg-neutral-900 text-white text-sm disabled:opacity-60">
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
  const formTabs = (
    <div className="flex gap-0.5 text-[10px]">
      {['editor', 'legal', 'actions'].map((t) => (
        <button key={t} onClick={() => setTab(t)}
          className={`px-1.5 py-0.5 rounded ${tab === t ? 'bg-sunvic-500 text-white' : 'text-neutral-500 hover:bg-neutral-100'}`}>
          {t.toUpperCase()}
        </button>
      ))}
    </div>
  );
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

  const statusBar = (
    <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-white border border-neutral-200 rounded-t-xl gap-2">
      <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
        <div className="font-mono text-sunvic-600 font-bold text-sm md:text-base truncate">{doc.doc_number}</div>
        <div className="text-xs text-neutral-500 capitalize hidden sm:block">{doc.template} · {doc.status}</div>
        {doc.project_id && (
          <Link to={`/projects/${doc.project_id}`} className="text-xs text-sunvic-700 hover:underline hidden md:inline">
            → Project
          </Link>
        )}
        {doc.thread_id && (
          <Link to={`/chat/${doc.thread_id}`} className="text-xs text-sunvic-700 hover:underline hidden md:inline">
            → Chat
          </Link>
        )}
      </div>
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        {/* Scroll-sync toggle only on desktop */}
        <label className="hidden md:flex items-center gap-1 text-xs text-neutral-600 cursor-pointer" title="Sync scroll between form editor and mirror">
          <input type="checkbox" checked={layout.scrollSync}
            onChange={(e) => setLayout((l) => ({ ...l, scrollSync: e.target.checked }))} />
          Scroll sync
        </label>
        <div className="text-[10px] md:text-xs text-neutral-500 min-w-[80px] md:min-w-[120px] text-right">
          {saveError && !conflict ? <span className="text-red-600">Save failed</span>
            : conflict ? <span className="text-amber-600">Conflict</span>
            : saving ? 'Saving…'
            : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}`
            : 'Auto-save on'}
        </div>
        <div className="text-right">
          <div className="text-[10px] text-neutral-500 uppercase hidden sm:block">Total</div>
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

  // ─── Mobile layout (< md) ─────────────────────────────
  if (isMobile) {
    return (
      <div className="flex flex-col h-[calc(100vh-6rem)]">
        {statusBar}
        {conflictBanner}

        <div className="flex-1 min-h-0 overflow-hidden border-x border-neutral-200 bg-white">
          {mobilePane === 'form' && (
            <div className="h-full flex flex-col">
              <div className="px-3 py-2 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
                <div className="text-xs font-semibold text-neutral-600">Form editor</div>
                {formTabs}
              </div>
              <div className="flex-1 overflow-y-auto p-3">{formPanel}</div>
            </div>
          )}
          {mobilePane === 'mirror' && (
            <div className="h-full overflow-hidden">{mirrorPanel}</div>
          )}
          {mobilePane === 'pdf' && (
            <div className="h-full bg-neutral-800">{pdfPanel}</div>
          )}
          {mobilePane === 'chat' && (
            <div className="h-full">
              <AgentChatPanel document={doc} onDocumentUpdate={(d) => setDoc((c) => c ? { ...c, ...d } : d)} />
            </div>
          )}
        </div>

        {/* Bottom tab bar */}
        <div className="flex-shrink-0 flex border-x border-b border-neutral-200 rounded-b-xl bg-white">
          {[
            ['form', 'Form'],
            ['mirror', 'Preview'],
            ['pdf', 'PDF'],
            ['chat', 'Chat'],
          ].map(([id, label]) => (
            <button key={id} onClick={() => setMobilePane(id)}
              className={`flex-1 py-2 text-xs font-semibold ${
                mobilePane === id ? 'bg-sunvic-500 text-white' : 'text-neutral-600'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── Desktop layout (md+) ─────────────────────────────
  const leftPct  = layout.leftCollapsed  ? 0 : layout.leftBasis;
  const midPct   = layout.midCollapsed   ? 0 : layout.midBasis;
  const rightPct = layout.rightCollapsed ? 0 : layout.rightBasis;
  const totalPct = leftPct + midPct + rightPct || 1;
  const leftStyle  = layout.leftCollapsed  ? { width: 40 } : { flexBasis: `${(leftPct / totalPct) * 100}%`, minWidth: 200 };
  const midStyle   = layout.midCollapsed   ? { width: 40 } : { flexBasis: `${(midPct / totalPct) * 100}%`, minWidth: 200 };
  const rightStyle = layout.rightCollapsed ? { width: 40 } : { flexBasis: `${(rightPct / totalPct) * 100}%`, minWidth: 200 };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {statusBar}
      {conflictBanner}

      <div ref={containerRef} className="flex-1 flex overflow-hidden border-x border-b border-neutral-200 rounded-b-xl bg-neutral-50 min-h-0">
        <div style={leftStyle} className="flex flex-col bg-white overflow-hidden">
          <ColumnHeader
            title="Form editor"
            subtitle={`${doc.template} · ${tab}`}
            collapsed={layout.leftCollapsed}
            onToggleCollapse={() => setLayout((l) => ({ ...l, leftCollapsed: !l.leftCollapsed }))}
          >
            {!layout.leftCollapsed && formTabs}
          </ColumnHeader>
          {!layout.leftCollapsed && (
            <div ref={leftScrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
              {formPanel}
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

      <AgentChatPanel document={doc} onDocumentUpdate={(d) => setDoc((c) => c ? { ...c, ...d } : d)} floating />
    </div>
  );
}
