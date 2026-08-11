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
// Provider failures used to be pasted into the transcript verbatim, so the
// contractor read `Cohere 422: {"error_type":"HALLUCINATED_ALL_TOOL_CALLS",...}`
// in the middle of their conversation. Translate the ones we know; never show
// raw JSON.
export function humanizeAgentError(detail) {
  const d = String(detail || '');
  if (/HALLUCINATED_ALL_TOOL_CALLS/i.test(d)) return 'The model tried to do something it was not allowed to do on that turn. Your answer was saved — say anything to continue.';
  if (/\b429\b|rate.?limit|quota/i.test(d)) return 'The model provider is rate-limiting us right now. Wait a moment and send that again.';
  if (/no_api_key_for_provider/i.test(d)) return 'No API key is configured for that model provider. Add one in Settings.';
  if (/\b(408|timeout|ETIMEDOUT|aborted)\b/i.test(d)) return 'That turn took too long and timed out. Send it again.';
  if (/\b5\d\d\b/.test(d)) return 'The model provider had a server error on that turn. Your answer was saved — send it again.';
  return 'That turn did not go through. Your answer was saved — send it again.';
}

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
      // The thread row is the authoritative slot state. It is written with the turn — including
      // when the model call itself fails — so anything the extractors pulled out of this very
      // message survives a provider outage instead of being rewound.
      if (result.thread) setThread(result.thread);
      setTurns((t) => [...t, {
        role: 'assistant',
        content: result.reply || '',
        applied_tool_calls: result.applied_tool_calls || [],
        refused: result.refused || [],
        new_documents: newDocs,
        iterations: result.iterations,
        // Server answered, but the model leg of the turn broke. Not a crash — the
        // slots were kept — so it reads as a warning, not a failure.
        degraded: result.degraded || null,
      }]);
      if (result.degraded) setError(humanizeAgentError(result.degraded.detail));
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
      const human = humanizeAgentError(detail);
      setError(human);
      // Marked `failed` so the UI can style it as a breakdown rather than as the agent
      // calmly saying something went wrong in its own voice.
      setTurns((t) => [...t, { role: 'assistant', content: human, failed: true, raw_error: detail }]);
      return null;
    } finally {
      setBusy(false);
    }
  }, [busy, ensureThread]);

  return { threadId, thread, busy, error, turns, send };
}
