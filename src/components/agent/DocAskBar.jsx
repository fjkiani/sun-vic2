import React, { useState } from 'react';
import { api } from '../../lib/api.js';
import { useModelChoice } from '../ModelPickerDropdown.jsx';
import { buildScopedMessage, scopePlaceholder, scopeSuggestions } from '../../lib/agentScope.js';

// The copilot, docked at the bottom of every document tab (plan decision 4).
//
// Previously the agent lived only in the AI tab and the floating panel was explicitly
// hidden on mobile, so Form/Legal/Preview/PDF had no copilot at all. This bar is always
// present and is *scoped* to the surface it sits on, so "make this stricter" typed in
// Legal edits legal blocks rather than guessing.
//
// Collapsed it is a single tap target. It expands only when there is something to show.

export function DocAskBar({ document: doc, scope = {}, onDocumentUpdate, className = '' }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);   // { reply, tools:[], refused:[] }
  const [error, setError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [choice] = useModelChoice();

  const suggestions = scopeSuggestions(scope, doc);

  async function send(text) {
    const msg = (text ?? input).trim();
    if (!msg || busy || !doc?.id) return;
    setInput('');
    setError('');
    setShowSuggestions(false);
    setBusy(true);
    try {
      const res = await api.agentChat({
        doc_id: doc.id,
        message: buildScopedMessage(msg, scope),
        provider: choice?.provider,
        model: choice?.model,
      });
      setResult({
        reply: res.reply || '',
        tools: res.applied_tool_calls || [],
        refused: res.refused || [],
        confirm_required: res.confirm_required || null,
      });
      if (res.document) onDocumentUpdate?.(res.document);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`flex-shrink-0 border-t border-neutral-200 bg-white ${className}`}>
      {/* Response strip — only rendered when the agent has said something. */}
      {(busy || result || error) && (
        <div className="max-h-40 overflow-y-auto px-3 py-2 border-b border-neutral-100 bg-neutral-50 text-sm">
          {busy && <div className="text-neutral-400">Thinking…</div>}
          {error && <div className="text-rose-600 text-xs">{error}</div>}
          {result?.confirm_required && (
            <div className="mb-2 text-xs bg-amber-50 border border-amber-300 text-amber-900 rounded-lg px-2 py-1.5">
              This document is {doc.status}. {result.confirm_required}
            </div>
          )}
          {result?.tools?.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {result.tools.map((t, i) => (
                <span key={i} className="text-[11px] bg-sunvic-50 border border-sunvic-200 text-sunvic-800 rounded-full px-2 py-0.5">
                  ✓ {t.tool}
                </span>
              ))}
            </div>
          )}
          {result?.refused?.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {result.refused.map((r, i) => (
                <span key={i} className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded-full px-2 py-0.5">
                  🔒 {r.tool}{r.path ? ` (${r.path})` : ''}
                </span>
              ))}
            </div>
          )}
          {result?.reply && <div className="text-neutral-700 whitespace-pre-wrap">{result.reply}</div>}
          {result && (
            <button
              type="button"
              onClick={() => setResult(null)}
              className="mt-1.5 text-[11px] text-neutral-400 underline"
            >
              dismiss
            </button>
          )}
        </div>
      )}

      {/* Suggestion chips — so the box is never a blank prompt. */}
      {showSuggestions && !busy && (
        <div className="flex gap-1.5 overflow-x-auto px-3 py-2 border-b border-neutral-100">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="flex-shrink-0 text-xs bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-full px-3 py-1.5 whitespace-nowrap"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={() => setShowSuggestions((v) => !v)}
          aria-label="Prompt ideas"
          className="flex-shrink-0 w-11 h-11 rounded-xl bg-neutral-100 text-neutral-600 flex items-center justify-center active:bg-neutral-200"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={scopePlaceholder(scope)}
          disabled={busy}
          // 16px text prevents iOS Safari from zooming the viewport on focus.
          className="flex-1 min-w-0 min-h-[44px] rounded-xl border border-neutral-300 px-3 text-base focus:border-sunvic-500 focus:ring-2 focus:ring-sunvic-200 focus:outline-none disabled:bg-neutral-100"
        />
        <button
          type="button"
          onClick={() => send()}
          disabled={busy || !input.trim()}
          aria-label="Send to copilot"
          className="flex-shrink-0 w-11 h-11 rounded-xl bg-sunvic-500 text-white flex items-center justify-center disabled:opacity-40 active:bg-sunvic-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
