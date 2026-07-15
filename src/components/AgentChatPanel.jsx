import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useModelChoice } from './ModelPickerDropdown.jsx';

// Chat panel that hits /api/agent/chat. Shows message history, tool-call chips, refused-lock
// banners, and updates the parent document via onDocumentUpdate.

export function AgentChatPanel({ document, onDocumentUpdate, floating = false }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [choice] = useModelChoice();
  const [open, setOpen] = useState(false);
  const scrollerRef = useRef(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function send() {
    const msg = input.trim();
    if (!msg || busy) return;
    setInput('');
    setError('');
    setMessages((m) => [...m, { role: 'user', content: msg }]);
    setBusy(true);
    try {
      const result = await api.agentChat({
        doc_id: document.id,
        message: msg,
        provider: choice.provider,
        model: choice.model,
      });
      setMessages((m) => [
        ...m,
        ...(result.applied_tool_calls || []).map((tc) => ({ role: 'tool', content: `${tc.tool}(${JSON.stringify(tc.args || {})})`, side_effect: tc.side_effect })),
        ...(result.refused || []).map((r) => ({ role: 'tool-refused', content: `${r.tool}: ${r.error || 'refused'}${r.path ? ` (${r.path})` : ''}` })),
        { role: 'assistant', content: result.reply || '' },
      ]);
      if (result.document) onDocumentUpdate?.(result.document);
    } catch (e) {
      setError(e.message || String(e));
      setMessages((m) => [...m, { role: 'system', content: `Error: ${e.message || e}` }]);
    } finally { setBusy(false); }
  }

  const panelContent = (
    <div className={floating
        ? "flex flex-col h-full bg-white border border-neutral-200 rounded-xl shadow-2xl"
        : "flex flex-col h-full"}>
      <div className="px-4 py-3 border-b border-neutral-200 bg-white rounded-t-xl flex items-center justify-between">
        <div>
          <div className="font-semibold">Agent</div>
          <div className="text-xs text-neutral-500">
            Ask to edit the {document.template}. Legal blocks are locked by default.
          </div>
        </div>
        {floating && (
          <button
            onClick={() => setOpen(false)}
            className="text-neutral-400 hover:text-neutral-900 text-lg"
            aria-label="Close agent panel"
          >
            ×
          </button>
        )}
      </div>
      <div ref={scrollerRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-neutral-50">
        {messages.length === 0 && (
          <div className="text-sm text-neutral-500">
            Try: <em>"Add a phase for garage electrical, 200A subpanel and 12 outlets."</em>
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} m={m} />
        ))}
        {busy && <div className="text-sm text-neutral-400">Thinking…</div>}
        {error && <div className="text-sm text-rose-600">{error}</div>}
      </div>
      <div className="p-3 border-t border-neutral-200 bg-white rounded-b-xl">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sunvic-500 focus:outline-none"
            placeholder="Message the agent…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            disabled={busy}
          />
          <button onClick={send} disabled={busy || !input.trim()}
            className="px-4 py-2 rounded-md bg-sunvic-500 hover:bg-sunvic-600 text-white text-sm font-semibold disabled:opacity-50">
            Send
          </button>
        </div>
      </div>
    </div>
  );

  if (!floating) return panelContent;
  // Floating mode is desktop-only — hide the floating bubble on mobile since the
  // mobile editor exposes Chat as a first-class bottom-tab pane.
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex fixed bottom-4 right-4 z-40 rounded-full bg-sunvic-500 hover:bg-sunvic-600 text-white w-14 h-14 shadow-lg items-center justify-center text-2xl"
        aria-label="Open agent chat"
      >
        💬
      </button>
    );
  }
  return (
    <div className="hidden md:block fixed bottom-4 right-4 z-40 w-96 h-[600px] max-h-[85vh]">
      {panelContent}
    </div>
  );
}

function MessageBubble({ m }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3 py-2 rounded-lg bg-sunvic-500 text-white text-sm">
          {m.content}
        </div>
      </div>
    );
  }
  if (m.role === 'assistant') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] px-3 py-2 rounded-lg bg-white border border-neutral-200 text-sm">
          {m.content}
        </div>
      </div>
    );
  }
  if (m.role === 'tool') {
    return (
      <div className="flex justify-start">
        <div className="text-xs bg-sunvic-50 border border-sunvic-200 text-sunvic-800 rounded-md px-2 py-1 font-mono">
          ✓ {m.content}
          {m.side_effect?.signed_url && (
            <a href={m.side_effect.signed_url} target="_blank" rel="noreferrer" className="ml-2 underline">open PDF</a>
          )}
        </div>
      </div>
    );
  }
  if (m.role === 'tool-refused') {
    return (
      <div className="flex justify-start">
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-2 py-1 font-mono">
          🔒 {m.content}
        </div>
      </div>
    );
  }
  return <div className="text-xs text-neutral-500 italic">{m.content}</div>;
}
