// PdfDocView — the real PDF, rendered by us, and editable by clicking the text on it.
//
// The previous viewer was `<PDFViewer>` from @react-pdf/renderer, which is an <iframe> pointed
// at a blob URL and handed to the browser's built-in PDF plugin. That is why clicking the
// document did nothing and why scroll position was unreachable: the page was never in our DOM.
// Nothing could be hooked because nothing was ours.
//
// So: @react-pdf still GENERATES the document (one renderer, no drift), but pdf.js draws it
// here — canvas per page, plus a positioned text layer we own. That gives real glyph
// rectangles, so a click maps to a word, and a real scroll container, so the editor and the
// document can follow each other.
//
// Every write goes through resolveTextToPath, which derives paths from the live payload and
// refuses to guess. See src/lib/pdfTextIndex.js for why that matters.

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { pdf } from '@react-pdf/renderer';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { InvoicePDF, ContractPDF } from '../../../packages/templates/pdf/index.js';
import {
  buildLeafIndex, resolveTextToPath, isWritableLeaf, isPathLocked,
  labelForPath, parseInput, getPath, norm,
  lockReason, explainComputed, findEmbeddedLeaf,
} from '../../lib/pdfTextIndex.js';
import { whereToUnlock } from '../doc/docSections.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

function useDebounced(value, ms = 500) {
  const [d, setD] = useState(value);
  useEffect(() => { const t = setTimeout(() => setD(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return d;
}

export function PdfDocView({
  template, payload, docNumber, locks,
  onEdit,                 // (path, value) => void   — writes ONE leaf
  focusPath,              // scroll the document to this field when it changes
  onFieldFocus,           // (path) => void          — fired when the user edits, for the form side
  onVisiblePath,          // (path) => void          — fired as you scroll the document
  onJumpToField,          // (path) => void          — select the owning tab AND sub-tab, then scroll
  onUnlockField,          // (path) => void          — flip one lock off, in place
  editable = true,
}) {
  const Component = template === 'contract' ? ContractPDF : InvoicePDF;
  const debounced = useDebounced(payload, 500);
  const regenerating = payload !== debounced;

  const [zoom, setZoom] = useState(1.0);
  const [fit, setFit] = useState(true);          // fit-to-width until the user zooms deliberately
  const [pages, setPages] = useState([]);        // [{ pageNumber, width, height, canvas, items }]
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);    // the open inline editor
  const [toast, setToast] = useState(null);

  const scrollerRef = useRef(null);
  const pageRefs = useRef({});
  const keepScroll = useRef(0);
  const renderSeq = useRef(0);

  const index = useMemo(() => buildLeafIndex(debounced || {}), [debounced]);

  // ── generate + rasterise ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const seq = ++renderSeq.current;
    (async () => {
      try {
        setErr('');
        // Editing must not yank you back to page 1 on every keystroke.
        keepScroll.current = scrollerRef.current?.scrollTop ?? 0;
        const blob = await pdf(<Component payload={debounced} docNumber={docNumber} logoUrl="/logo/sunvic.png" />).toBlob();
        const data = new Uint8Array(await blob.arrayBuffer());
        if (cancelled || seq !== renderSeq.current) return;
        const doc = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled || seq !== renderSeq.current) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const out = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          const ctx = canvas.getContext('2d');
          ctx.scale(dpr, dpr);
          await page.render({ canvasContext: ctx, viewport }).promise;

          const tc = await page.getTextContent();
          const items = tc.items
            .filter((it) => norm(it.str))
            .map((it) => {
              const tx = pdfjsLib.Util.transform(viewport.transform, it.transform);
              const h = Math.hypot(tx[2], tx[3]);
              return {
                str: it.str,
                left: tx[4],
                top: tx[5] - h,
                width: (it.width || 0) * viewport.scale,
                height: h,
              };
            });
          // Group into visual lines so a bare "$65,000" can be disambiguated by its label.
          const lines = new Map();
          for (const it of items) {
            const key = Math.round(it.top / 4);
            if (!lines.has(key)) lines.set(key, []);
            lines.get(key).push(it);
          }
          for (const [, group] of lines) {
            const text = group.slice().sort((a, b) => a.left - b.left).map((g) => g.str).join(' ');
            group.forEach((g) => { g.lineText = text; });
          }
          out.push({ pageNumber: n, width: viewport.width, height: viewport.height, canvas, items });
          if (cancelled || seq !== renderSeq.current) return;
        }
        if (cancelled || seq !== renderSeq.current) return;
        setPages(out);
        setLoading(false);
        requestAnimationFrame(() => {
          if (scrollerRef.current && keepScroll.current) scrollerRef.current.scrollTop = keepScroll.current;
        });
      } catch (e) {
        if (!cancelled) { setErr(e?.message || String(e)); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [debounced, docNumber, Component]);

  // Paint each rendered canvas into its mounted host node.
  useEffect(() => {
    for (const p of pages) {
      const host = pageRefs.current[p.pageNumber];
      if (host && host.firstChild !== p.canvas) {
        host.innerHTML = '';
        p.canvas.style.width = '100%';
        p.canvas.style.height = '100%';
        p.canvas.style.display = 'block';
        host.appendChild(p.canvas);
      }
    }
  }, [pages]);

  // Resolve every run ONCE per (pages × payload), not once per render. A contract runs to
  // several hundred text runs against ~150 leaves; doing this inline in the JSX meant tens of
  // thousands of string comparisons on every zoom click and every editor open.
  const resolved = useMemo(() => {
    const byPage = new Map();
    const anchors = new Map();
    for (const p of pages) {
      const rows = p.items.map((it) => {
        const r = resolveTextToPath(index, it.str, it.lineText);
        const hit = r.ok && isWritableLeaf(debounced, r.path);
        if (hit && !anchors.has(r.path)) anchors.set(r.path, { page: p.pageNumber, top: it.top, height: it.height });
        return { it, hit, path: hit ? r.path : null, kind: r.kind, locked: hit && isPathLocked(locks, r.path), reason: r.reason, candidates: r.candidates };
      });
      byPage.set(p.pageNumber, rows);
    }
    return { byPage, anchors };
  }, [pages, index, debounced, locks]);

  const anchorFor = useCallback((path) => resolved.anchors.get(path) || null, [resolved]);

  // ── fit to width ────────────────────────────────────────────────────────
  // A US-Letter page rasterised at scale 1.5 is ~918px wide. The document column is often
  // ~700px on a laptop and ~390px on a phone, so a fixed 100% zoom clips the right-hand third
  // of every page — including the right edge of the contract heading. Default to whatever
  // makes the page fit, and stop doing that the moment the user picks a zoom themselves.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !fit || !pages.length) return;
    const apply = () => {
      const avail = el.clientWidth - 24;              // p-3 either side
      const w = pages[0]?.width || 1;
      if (avail > 40) setZoom(Math.max(0.2, Math.min(2, avail / w)));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, pages]);

  // ── document scroll → form ──────────────────────────────────────────────
  // The other half of "when I scroll, show me that part". Whichever editable value is nearest
  // the top of the document viewport is the one the form should be showing.
  const scrollNotify = useRef(null);
  const suppressOut = useRef(false);
  const onScrollDoc = useCallback(() => {
    if (!onVisiblePath) return;
    if (suppressOut.current) return;                 // the form drove this scroll; do not echo
    clearTimeout(scrollNotify.current);
    scrollNotify.current = setTimeout(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      let best = null, bestDist = Infinity;
      for (const span of el.querySelectorAll('[data-pdf-path]')) {
        const d = span.getBoundingClientRect().top - top;
        if (d >= -20 && d < bestDist) { bestDist = d; best = span; }
      }
      const p = best?.getAttribute('data-pdf-path');
      if (p) onVisiblePath(p);
    }, 160);
  }, [onVisiblePath]);

  const zoomTo = useCallback((z) => { setFit(false); setZoom(z); }, []);
  const nearestLevel = ZOOM_LEVELS.reduce((a, b) => (Math.abs(b - zoom) < Math.abs(a - zoom) ? b : a), ZOOM_LEVELS[0]);

  useEffect(() => {
    if (!focusPath || !pages.length) return;
    const a = anchorFor(focusPath);
    if (!a) return;
    const host = pageRefs.current[a.page]?.parentElement;
    if (!host || !scrollerRef.current) return;
    const y = host.offsetTop + a.top * zoom - 80;
    suppressOut.current = true;
    scrollerRef.current.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    setTimeout(() => { suppressOut.current = false; }, 800);
    setActive(null);
  }, [focusPath, pages, zoom, anchorFor]);

  // ── refusals that tell the truth and offer a way out ────────────────────
  // A toast is now {text, sub?, actions?}. A refusal with no next step is what made this screen
  // feel like a wall: the user is told no, given a wrong direction, and left to hunt. Anything
  // that CAN be resolved carries the button that resolves it.
  //
  // Auto-dismiss only applies to toasts with no actions. A message that offers "Unlock and edit
  // here" must not evaporate at 3.2s while the user is still reading it.
  const toastTimer = useRef(null);
  const showToast = useCallback((t) => {
    clearTimeout(toastTimer.current);
    setToast(t);
    if (!t?.actions?.length) toastTimer.current = setTimeout(() => setToast(null), 3600);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const openEditor = useCallback((item, page, path, kind) => {
    const rect = { left: item.left * zoom, top: item.top * zoom, width: item.width * zoom, height: item.height * zoom };
    const raw = getPath(debounced, path);
    const draft = kind === 'money'
      ? (Number.isFinite(Number(raw)) ? (Number(raw) / 100).toFixed(2) : '')
      : (raw == null ? '' : String(raw));
    setActive({ path, kind: kind || 'text', page, rect, draft });
    onFieldFocus?.(path);
  }, [zoom, debounced, onFieldFocus]);

  // ── click → path ────────────────────────────────────────────────────────
  function onTextClick(e, item, page, r) {
    if (!editable) return;
    e.stopPropagation();

    if (!r.hit) { explainRefusal(item, page, r); return; }
    if (r.locked) { explainLock(item, page, r); return; }
    openEditor(item, page, r.path, r.kind);
  }

  // The lock message used to be one hardcoded sentence for all 30 locked paths:
  // "required NJ contract language. Unlock it in the Legal tab." Measured against the paths the
  // app actually locks, the NJ claim is false for 28 of them and the Legal-tab direction is
  // wrong or nowhere for 13. Both halves are now derived — the reason from lockReason(), the
  // destination from whereToUnlock() — so neither can drift from the truth again.
  function explainLock(item, page, r) {
    const reason = lockReason(r.path);
    const where = whereToUnlock(template, r.path);
    const actions = [];
    if (onUnlockField && reason.inlineUnlock) {
      actions.push({
        label: 'Unlock and edit here',
        run: () => { onUnlockField(r.path); openEditor(item, page, r.path, r.kind); },
      });
    }
    if (onJumpToField && where) {
      actions.push({ label: `Open ${where.label}`, run: () => onJumpToField(r.path) });
    }
    showToast({
      text: `${labelForPath(r.path)} — ${reason.headline}.`,
      sub: where
        ? `${reason.detail} The field is in ${where.label}.`
        : reason.detail,
      actions,
      testid: `lock-${reason.klass}`,
    });
  }

  // "That text is part of the template, not a field you can change" was answering four
  // different questions with one sentence, and it read as a brush-off because for three of them
  // it was wrong. Each cause now gets its own answer.
  function explainRefusal(item, page, r) {
    const clicked = norm(item.str);

    if (r.reason === 'ambiguous') {
      const cands = (r.candidates || []).slice(0, 3);
      showToast({
        text: `“${clicked}” is in ${r.candidates?.length ?? 2} fields. Which one?`,
        actions: cands.map((c) => ({
          label: labelForPath(c.path),
          run: () => openEditor(item, page, c.path, c.kind),
        })),
        testid: 'refusal-ambiguous',
      });
      return;
    }

    if (r.reason === 'too_short') {
      showToast({ text: 'Too short to identify a field — tap a longer piece of the line.', testid: 'refusal-too-short' });
      return;
    }

    if (r.reason === 'empty') return;

    // (1) A number the document worked out. The payment schedule stores percentages, so the
    //     dollar figure printed against each milestone exists in no field — but it is entirely
    //     under the author's control through the two inputs that produce it.
    const computed = explainComputed(debounced, clicked, item.lineText || '');
    if (computed) {
      showToast({
        text: `${clicked} is calculated, not stored — ${computed.percent}% of the contract total.`,
        sub: computed.ambiguous
          ? `${computed.matches} milestones are set to ${computed.percent}%, so they all print this figure.`
          : `It changes when you change the total or the “${computed.label}” percentage.`,
        actions: onJumpToField ? [
          {
            label: computed.ambiguous ? 'Edit the payment schedule' : 'Edit the percentage',
            run: () => onJumpToField(computed.percentPath),
          },
          { label: 'Edit the total', run: () => onJumpToField(computed.totalPath) },
        ] : [],
        testid: 'refusal-computed',
      });
      return;
    }

    // (2) Fixed wording, but with one of the author's own values printed inside it.
    const embedded = findEmbeddedLeaf(index, clicked);
    if (embedded) {
      showToast({
        text: `This sentence is fixed wording, but “${embedded.value}” inside it is your ${labelForPath(embedded.path)}.`,
        sub: 'Change it there and it changes everywhere it is printed.',
        actions: onJumpToField ? [{ label: `Edit ${labelForPath(embedded.path)}`, run: () => onJumpToField(embedded.path) }] : [],
        testid: 'refusal-embedded',
      });
      return;
    }

    // (3) Genuinely static: headings, table captions, authored legal sentences.
    showToast({
      text: 'Fixed wording printed by the template — there is no field behind it.',
      sub: 'Headings, table captions and standard clauses live in the document design, not in your data.',
      testid: 'refusal-static',
    });
  }

  function commit() {
    if (!active) return;
    const parsed = parseInput(active.kind, active.draft);
    if (!parsed.ok) {
      showToast({
        text: active.kind === 'money' ? 'Enter an amount like 48500 or 48,500.00.' : 'Enter a date like 9/1/2026.',
        testid: 'refusal-parse',
      });
      return;
    }
    const before = getPath(debounced, active.path);
    if (String(before) !== String(parsed.value)) onEdit?.(active.path, parsed.value);
    setActive(null);
  }

  const scale = (v) => v * zoom;

  return (
    <div className="h-full flex flex-col bg-neutral-800 relative">
      <div className="flex-shrink-0 bg-neutral-900 text-white text-xs px-2 py-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => zoomTo(ZOOM_LEVELS[Math.max(0, ZOOM_LEVELS.indexOf(nearestLevel) - 1)])}
            disabled={zoom <= ZOOM_LEVELS[0]}
            className="min-w-[32px] h-8 rounded hover:bg-neutral-700 disabled:opacity-40" aria-label="Zoom out">−</button>
          <button onClick={() => setFit((f) => !f)} data-testid="pdf-zoom"
            className={`min-w-[4.5rem] h-8 px-2 rounded font-mono ${fit ? 'bg-neutral-700' : 'hover:bg-neutral-700'}`}
            title={fit ? 'Fitting to width — click for a fixed zoom' : 'Click to fit the page to the column'}>
            {fit ? 'Fit' : `${Math.round(zoom * 100)}%`}
          </button>
          <button onClick={() => zoomTo(ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, ZOOM_LEVELS.indexOf(nearestLevel) + 1)])}
            disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
            className="min-w-[32px] h-8 rounded hover:bg-neutral-700 disabled:opacity-40" aria-label="Zoom in">+</button>
        </div>
        {regenerating && <div className="bg-sunvic-500 text-white text-[10px] px-2 py-0.5 rounded">Updating…</div>}
        <div className="text-[10px] text-neutral-400" data-testid="pdf-mode">
          {editable ? 'click any value to edit' : 'PDF preview'}
        </div>
      </div>

      <div ref={scrollerRef} onScroll={onScrollDoc} className="flex-1 overflow-auto p-3" data-testid="pdf-scroller">
        {err && <div className="m-3 p-3 rounded bg-rose-900/40 text-rose-100 text-sm">Could not render the PDF: {err}</div>}
        {loading && !pages.length && <div className="text-neutral-400 text-sm p-4">Rendering document…</div>}

        {pages.map((p) => (
          <div key={p.pageNumber} className="relative mx-auto mb-4 bg-white shadow-lg"
               style={{ width: scale(p.width), height: scale(p.height) }}>
            <div ref={(el) => { pageRefs.current[p.pageNumber] = el; }}
                 className="absolute inset-0 pointer-events-none" />
            <div className="absolute inset-0" data-testid={`pdf-textlayer-${p.pageNumber}`}>
              {(resolved.byPage.get(p.pageNumber) || []).map((r, i) => {
                const it = r.it;
                const hit = editable && r.hit;
                const locked = hit && r.locked;
                return (
                  <span
                    key={i}
                    data-pdf-path={hit ? r.path : undefined}
                    data-pdf-locked={locked ? '1' : undefined}
                    onClick={(e) => onTextClick(e, it, p.pageNumber, r)}
                    title={hit ? (locked ? `${labelForPath(r.path)} — ${lockReason(r.path).headline}. Tap to unlock.` : `Edit ${labelForPath(r.path)}`) : undefined}
                    className={`absolute leading-none select-none ${
                      hit
                        ? (locked
                          ? 'cursor-not-allowed ring-1 ring-amber-400/0 hover:ring-amber-400/80 hover:bg-amber-200/25'
                          : 'cursor-text hover:bg-sunvic-500/25 hover:ring-1 hover:ring-sunvic-500/70')
                        : 'cursor-default'
                    }`}
                    style={{
                      left: scale(it.left), top: scale(it.top),
                      width: scale(it.width), height: scale(it.height),
                      color: 'transparent',
                    }}
                  >{it.str}</span>
                );
              })}
            </div>

            {active?.page === p.pageNumber && (
              <div className="absolute z-20 bg-white rounded-lg shadow-2xl ring-2 ring-sunvic-500 p-2 min-w-[240px]"
                   style={{ left: Math.max(4, active.rect.left - 8), top: active.rect.top + active.rect.height + 6 }}
                   data-testid="pdf-inline-editor">
                <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">{labelForPath(active.path)}</div>
                {active.kind === 'text' && String(active.draft).length > 60 ? (
                  <textarea
                    autoFocus rows={4} value={active.draft}
                    onChange={(e) => setActive({ ...active, draft: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Escape') setActive(null); }}
                    className="w-full text-sm border border-neutral-300 rounded p-2 outline-none focus:ring-2 focus:ring-sunvic-500"
                  />
                ) : (
                  <input
                    autoFocus value={active.draft}
                    inputMode={active.kind === 'money' ? 'decimal' : undefined}
                    onChange={(e) => setActive({ ...active, draft: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setActive(null); }}
                    className="w-full text-sm border border-neutral-300 rounded p-2 outline-none focus:ring-2 focus:ring-sunvic-500"
                  />
                )}
                <div className="flex gap-2 justify-end mt-2">
                  <button onClick={() => setActive(null)} className="min-h-[36px] px-3 text-sm rounded text-neutral-600 hover:bg-neutral-100">Cancel</button>
                  <button onClick={commit} className="min-h-[36px] px-4 text-sm rounded bg-sunvic-500 hover:bg-sunvic-600 text-white font-semibold">Save</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {toast && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-[92%] max-w-md bg-neutral-900 text-white rounded-xl shadow-2xl px-3 py-2.5 pr-9"
          data-testid="pdf-toast"
          data-toast-kind={toast.testid || undefined}
        >
          <div className="text-xs leading-snug">{toast.text}</div>
          {toast.sub && <div className="text-[11px] text-neutral-400 leading-snug mt-1">{toast.sub}</div>}
          {toast.actions?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {toast.actions.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  data-testid="pdf-toast-action"
                  onClick={() => { setToast(null); a.run(); }}
                  className="min-h-[44px] px-3 rounded-lg bg-white text-neutral-900 text-xs font-semibold active:bg-neutral-200"
                >{a.label}</button>
              ))}
            </div>
          )}
          <button
            type="button"
            aria-label="Dismiss"
            data-testid="pdf-toast-dismiss"
            onClick={() => setToast(null)}
            className="absolute top-1 right-1 w-8 h-8 text-neutral-400 hover:text-white text-base leading-none"
          >×</button>
        </div>
      )}
    </div>
  );
}

export default PdfDocView;
