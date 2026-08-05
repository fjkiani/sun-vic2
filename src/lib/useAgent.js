import { useState, useCallback } from 'react';
import { api } from './api.js';

// useAgent — drives the agent-first copilot workflow. A prompt runs inside a persistent
// chat thread (the agentic surface that can create documents, generate PDFs, and email via
// tools). Returns the assistant reply plus any documents the agent created, so the UI can
// route the user straight to the AI-first document screen for human review.
export function useAgent() {
  const [threadId, setThreadId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [turns, setTurns] = useState([]); // [{role:'user'|'assistant', content, new_documents?}]

  const ensureThread = useCallback(async () => {
    if (threadId) return threadId;
    const { thread } = await api.createThread({ title: 'Copilot' });
    setThreadId(thread.id);
    return thread.id;
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
      setTurns((t) => [...t, { role: 'assistant', content: result.reply || '', new_documents: newDocs }]);
      return { reply: result.reply, new_documents: newDocs, threadId: tid };
    } catch (e) {
      setError(e.message || String(e));
      setTurns((t) => [...t, { role: 'assistant', content: `Sorry — something went wrong: ${e.message || e}` }]);
      return null;
    } finally {
      setBusy(false);
    }
  }, [busy, ensureThread]);

  return { threadId, busy, error, turns, send };
}
