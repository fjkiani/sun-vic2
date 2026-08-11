import { useState, useCallback } from 'react';
import { api } from './api.js';

// useAgent — drives the agent-first copilot workflow. A prompt runs inside a persistent
// chat thread (the agentic surface that can create documents, generate PDFs, and email via
// tools).
//
// This used to keep only { role, content, new_documents } per turn and discard the rest of
// the response. /api/threads/:id/turn also returns `applied_tool_calls`, `refused` and the
// updated `thread` (which carries template / gathered_slots / pending_slot / stage). Dropping
// them is what left the Copilot page showing prose only, while the document screen showed the
// agent's actual work — the same agent looking like two different products. Everything the
// server reports is now kept and handed to the UI.
export function useAgent() {
  const [threadId, setThreadId] = useState(null);
  const [thread, setThread] = useState(null);   // full row: template, gathered_slots, pending_slot, stage
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // [{ role:'user'|'assistant', content, applied_tool_calls?, refused?, new_documents?, failed? }]
  const [turns, setTurns] = useState([]);

  const ensureThread = useCallback(async () => {
    if (threadId) return threadId;
    const { thread: t } = await api.createThread({ title: 'Copilot' });
    setThreadId(t.id);
    setThread(t);
    return t.id;
  }, [threadId]);

  const send = useCallback(async (message, { provider, model } = {}) => {
    const msg = String(message || '').trim();
    if (!msg || busy) return null;
    setError('');
    setTurns((t) => [...t, { role: 'user', content: msg }]);
    setBusy(true);
    try {
      const tid = await ensureThread();
      const result = await api.postThreadTurn(tid, { message: msg, provider, model });
      const newDocs = result.new_documents || [];
      // The thread row is the authoritative slot state — it was written server-side before the
      // LLM ran, so it reflects anything the extractors pulled out of this very message.
      if (result.thread) setThread(result.thread);
      setTurns((t) => [...t, {
        role: 'assistant',
        content: result.reply || '',
        applied_tool_calls: result.applied_tool_calls || [],
        refused: result.refused || [],
        new_documents: newDocs,
        iterations: result.iterations,
      }]);
      return {
        reply: result.reply,
        new_documents: newDocs,
        applied_tool_calls: result.applied_tool_calls || [],
        refused: result.refused || [],
        thread: result.thread || null,
        threadId: tid,
      };
    } catch (e) {
      const detail = e?.detail || e?.message || String(e);
      setError(detail);
      // Marked `failed` so the UI can style it as a breakdown rather than as the agent
      // calmly saying something went wrong in its own voice.
      setTurns((t) => [...t, { role: 'assistant', content: `Sorry — something went wrong: ${detail}`, failed: true }]);
      return null;
    } finally {
      setBusy(false);
    }
  }, [busy, ensureThread]);

  return { threadId, thread, busy, error, turns, send };
}
