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

// Utility: set a value at a JSON dot-path on a copy of the object.
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

// Load/store column layout preferences from localStorage.
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
  leftCollapsed: false,
  midCollapsed: false,
  rightCollapsed: false,
  leftBasis: 25,   // percent of container width
  midBasis: 40,
  rightBasis: 35,
  scrollSync: true,
};

export function DocumentEditorPage() {
  const { id } = useParams();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.getDocument(id),
  });

  const [doc, setDoc] = useState(null);
  const [tab, setTab] = useState('editor');
  const [emailTo, setEmailTo] = useState('');
  const [busyOp, setBusyOp] = useState(null);

  const [layout, setLayout] = useState(() => loadLayout() || DEFAULT_LAYOUT);
  const containerRef = useRef(null);
  const leftScrollRef = useRef(null);
  const midScrollRef = useRef(null);
  const syncingRef = useRef(false);

  useEffect(() => { if (data?.document) setDoc(data.document); }, [data]);
  useEffect(() => { saveLayout(layout); }, [layout]);

  // Debounced save with 409 conflict detection.
  const { queueSave, flushNow, saving, lastSaved, error: saveError, conflict, dismissConflict } = useDebouncedSave({
    apiCall: async (patch) => {
      const opts = doc?.updated_at ? { expectedUpdatedAt: doc.updated_at } : {};
      const result = await api.updateDocument(doc.id, patch, opts);
      if (result?.document) setDoc(result.document);
      return result;
    },
    debounceMs: 500,
  });

  // Flush pending saves on unmount / page unload.
  useEffect(() => {
    const onBeforeUnload = () => { flushNow().catch(() => {}); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      flushNow().catch(() => {});
    };
  }, [flushNow]);

  // saveField: apply patch locally (optimistic), queue debounced PATCH.
  const saveField = useCallback((pathValueMap) => {
    if (!doc) return;
    const nextPayload = Object.entries(pathValueMap).reduce((acc, [p, v]) => setPath(acc, p, v), doc.payload);
    setDoc((d) => d ? { ...d, payload: nextPayload } : d);
    queueSave({ payload: nextPayload });
  }, [doc, queueSave]);

  const toggleLock = useCallback((path) => {
    if (!doc) return;
    const wasLocked = !!doc.locks?.[path];
    const nextLocks = { ...(doc.locks || {}), [path]: !wasLocked };
    setDoc((d) => d ? { ...d, locks: nextLocks } : d);
    queueSave({ locks: nextLocks });
  }, [doc, queueSave]);

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
    try {
      const opts = doc?.updated_at ? { expectedUpdatedAt: doc.updated_at } : {};
      const { document } = await api.updateDocument(doc.id, { status }, opts);
      setDoc(document);
    } catch (e) { alert(`Status change failed: ${e.message || e}`); }
  }

  // ─── Scroll sync (editor form ↔ mirror) ─────────────────────
  useEffect(() => {
    if (!layout.scrollSync) return;
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
      // release lock in next frame so we don't ping-pong.
      requestAnimationFrame(() => { syncingRef.current = false; });
    };

    const onLeftScroll = () => sync(left, mid);
    const onMidScroll = () => sync(mid, left);
    left.addEventListener('scroll', onLeftScroll, { passive: true });
    mid.addEventListener('scroll', onMidScroll, { passive: true });
    return () => {
      left.removeEventListener('scroll', onLeftScroll);
      mid.removeEventListener('scroll', onMidScroll);
    };
  }, [layout.scrollSync, layout.leftCollapsed, layout.midCollapsed]);

  // Column resize handlers.
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

  // Column widths — collapsed columns get a fixed 40px sliver.
  const leftPct  = layout.leftCollapsed  ? 0 : layout.leftBasis;
  const midPct   = layout.midCollapsed   ? 0 : layout.midBasis;
  const rightPct = layout.rightCollapsed ? 0 : layout.rightBasis;
  const totalPct = leftPct + midPct + rightPct || 1;
  const leftStyle  = layout.leftCollapsed  ? { width: 40 } : { flexBasis: `${(leftPct / totalPct) * 100}%`, minWidth: 200 };
  const midStyle   = layout.midCollapsed   ? { width: 40 } : { flexBasis: `${(midPct / totalPct) * 100}%`, minWidth: 200 };
  const rightStyle = layout.rightCollapsed ? { width: 40 } : { flexBasis: `${(rightPct / totalPct) * 100}%`, minWidth: 200 };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Top status bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-white border border-neutral-200 rounded-t-xl">
        <div className="flex items-center gap-3">
          <div className="font-mono text-sunvic-600 font-bold">{doc.doc_number}</div>
          <div className="text-xs text-neutral-500 capitalize">{doc.template} · {doc.status}</div>
          {doc.project_id && (
            <Link to={`/projects/${doc.project_id}`} className="text-xs text-sunvic-700 hover:underline">
              → Project dashboard
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-neutral-600 cursor-pointer" title="Sync scroll between form editor and mirror">
            <input
              type="checkbox"
              checked={layout.scrollSync}
              onChange={(e) => setLayout((l) => ({ ...l, scrollSync: e.target.checked }))}
            />
            Scroll sync
          </label>
          <div className="text-xs text-neutral-500 min-w-[120px] text-right">
            {saveError && !conflict ? <span className="text-red-600">Save failed</span>
              : conflict ? <span className="text-amber-600">Conflict — reload</span>
              : saving ? 'Saving…'
              : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}`
              : 'Auto-save on change'}
          </div>
          <div className="text-right">
            <div className="text-[10px] text-neutral-500 uppercase">Total</div>
            <div className="font-mono font-bold text-sm">{fmtUSD(total)}</div>
          </div>
        </div>
      </div>

      {conflict && (
        <div className="flex-shrink-0 bg-amber-50 border-x border-b border-amber-300 px-3 py-2 text-xs text-amber-800 flex items-center justify-between">
          <span>Another edit came in from a different tab. Reload to see the latest version and merge your changes manually.</span>
          <div className="flex gap-2">
            <button onClick={() => refetch()} className="px-2 py-1 rounded bg-amber-500 text-white text-xs font-semibold">Reload</button>
            <button onClick={dismissConflict} className="px-2 py-1 rounded border border-amber-400 text-amber-800 text-xs">Dismiss</button>
          </div>
        </div>
      )}

      {/* 3-column body */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden border-x border-b border-neutral-200 rounded-b-xl bg-neutral-50 min-h-0">
        {/* LEFT — form editor */}
        <div style={leftStyle} className="flex flex-col bg-white overflow-hidden">
          <ColumnHeader
            title="Form editor"
            subtitle={`${doc.template} · ${tab}`}
            collapsed={layout.leftCollapsed}
            onToggleCollapse={() => setLayout((l) => ({ ...l, leftCollapsed: !l.leftCollapsed }))}
          >
            {!layout.leftCollapsed && (
              <div className="flex gap-0.5 text-[10px]">
                {['editor', 'legal', 'actions'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-1.5 py-0.5 rounded ${tab === t ? 'bg-sunvic-500 text-white' : 'text-neutral-500 hover:bg-neutral-100'}`}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </ColumnHeader>
          {!layout.leftCollapsed && (
            <div ref={leftScrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
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
            </div>
          )}
        </div>

        <ColumnResizer onResize={(dx) => handleResize('left-mid', dx)} />

        {/* MIDDLE — HTML mirror */}
        <div style={midStyle} className="flex flex-col bg-neutral-100 overflow-hidden">
          <ColumnHeader
            title="Live mirror"
            subtitle="click any text to edit inline"
            collapsed={layout.midCollapsed}
            onToggleCollapse={() => setLayout((l) => ({ ...l, midCollapsed: !l.midCollapsed }))}
          />
          {!layout.midCollapsed && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <DocumentMirror
                ref={midScrollRef}
                template={doc.template}
                payload={doc.payload}
                onSave={saveField}
                locks={doc.locks || {}}
                onToggleLock={toggleLock}
                docNumber={doc.doc_number}
              />
            </div>
          )}
        </div>

        <ColumnResizer onResize={(dx) => handleResize('mid-right', dx)} />

        {/* RIGHT — PDF preview */}
        <div style={rightStyle} className="flex flex-col bg-neutral-800 overflow-hidden">
          <ColumnHeader
            title="PDF preview"
            subtitle="final rendered PDF"
            collapsed={layout.rightCollapsed}
            onToggleCollapse={() => setLayout((l) => ({ ...l, rightCollapsed: !l.rightCollapsed }))}
          />
          {!layout.rightCollapsed && (
            <div className="flex-1 min-h-0">
              <PDFPreview template={doc.template} payload={doc.payload} docNumber={doc.doc_number} />
            </div>
          )}
        </div>
      </div>

      {/* Agent panel: floating, toggleable */}
      <AgentChatPanel document={doc} onDocumentUpdate={(d) => setDoc((c) => c ? { ...c, ...d } : d)} floating />
    </div>
  );
}
