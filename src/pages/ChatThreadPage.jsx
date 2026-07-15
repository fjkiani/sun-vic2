// ChatThreadPage — the conversational agent surface for a single thread.
// Load messages, POST turns, show tool-call chips + doc cards inline.
// Handles ?open=<initial-message> from ChatHomePage.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';

const STAGE_TONE = {
  gathering: 'bg-amber-100 text-amber-800',
  drafting:  'bg-blue-100 text-blue-800',
  editing:   'bg-blue-100 text-blue-800',
  sending:   'bg-indigo-100 text-indigo-800',
  done:      'bg-emerald-100 text-emerald-800',
};

// Server-side slot labels — kept in sync with packages/agent/thread-slots.js.
const SLOT_LABELS = {
  'homeowner.name': 'Homeowner name',
  'homeowner.address': 'Property address',
  'scope_categories': 'Scope of work',
  'payment.total_cents': 'Budget total',
  'timeline.start_date': 'Start date',
  'agreement_summary.months_to_complete': 'Months to complete',
  'agreement_summary.weeks_to_start': 'Weeks to start',
  'homeowner.phone': 'Homeowner phone',
  'homeowner.email': 'Homeowner email',
  'payment.method': 'Payment method',
  'linked_contract_id': 'Contract this invoice bills against',
  'milestone_label': 'Milestone',
  'invoice_date': 'Invoice date',
  'due_date': 'Due date',
  'bill_to.recipient_email': 'Client email',
};

function slotLabel(key) { return SLOT_LABELS[key] || key; }

function fmtUSD(cents) {
  if (cents == null) return '';
  return (Number(cents) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function parseToolCalls(m) {
  if (!m || !m.tool_calls) return [];
  const raw = m.tool_calls;
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((c) => {
    let name = c.function?.name || c.name || 'tool';
    let args = {};
    try {
      const a = c.function?.arguments ?? c.arguments;
      if (typeof a === 'string') args = a ? JSON.parse(a) : {};
      else if (a && typeof a === 'object') args = a;
    } catch {}
    return { name, args };
  });
}

function ToolCallChip({ name, args, docs }) {
  // For generate_document/send_to_client/lookup_document, look up the created doc
  // from `docs` (returned in the turn response meta) to render a link chip.
  if (name === 'generate_document') {
    const doc = docs.find((d) => d.__from_call === true) || null;
    return (
      <div className="text-[11px] text-neutral-500 pl-2 border-l-2 border-sunvic-300">
        <span className="font-semibold text-sunvic-700">Generated</span> a {args.template || 'document'}
        {doc?.doc_number && <> — <Link to={`/documents/${doc.id}`} className="text-sunvic-600 hover:underline font-mono">{doc.doc_number}</Link></>}
      </div>
    );
  }
  if (name === 'send_to_client') {
    return (
      <div className="text-[11px] text-neutral-500 pl-2 border-l-2 border-emerald-300">
        <span className="font-semibold text-emerald-700">Sent</span> to client
        {args.to && <> — <span className="font-mono">{args.to}</span></>}
      </div>
    );
  }
  if (name === 'set_thread_title') {
    return (
      <div className="text-[11px] text-neutral-500 pl-2 border-l-2 border-neutral-300">
        <span className="font-semibold">Renamed</span> chat → &ldquo;{args.title}&rdquo;
      </div>
    );
  }
  if (name === 'lookup_document') {
    return (
      <div className="text-[11px] text-neutral-500 pl-2 border-l-2 border-neutral-300">
        <span className="font-semibold">Looked up</span> {args.doc_id}
      </div>
    );
  }
  if (name === 'ask_user' || name === 'ask_slot' || name === 'refuse_and_summarize') {
    // These are rendered as the assistant's user-facing message; skip the chip.
    return null;
  }
  return (
    <div className="text-[11px] text-neutral-500 pl-2 border-l-2 border-neutral-300">
      <span className="font-semibold">{name}</span>
    </div>
  );
}

function DocCard({ doc }) {
  return (
    <Link to={`/documents/${doc.id}`}
      className="block bg-white border border-sunvic-200 hover:border-sunvic-400 rounded-lg p-3 transition">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="font-mono text-sm font-semibold text-sunvic-700">{doc.doc_number}</div>
        <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">{doc.template}</span>
      </div>
      <div className="text-sm font-medium truncate">{doc.title || '—'}</div>
      <div className="flex items-center justify-between mt-1 text-xs text-neutral-500">
        <span>{doc.client_name || 'no client'}</span>
        <span className="font-mono font-semibold text-neutral-800">{fmtUSD(doc.total_cents)}</span>
      </div>
    </Link>
  );
}

function MessageRow({ m, docs }) {
  const toolCalls = parseToolCalls(m);
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-br-md bg-sunvic-500 text-white text-sm whitespace-pre-wrap">
          {m.content}
        </div>
      </div>
    );
  }
  if (m.role === 'assistant') {
    return (
      <div className="flex flex-col items-start gap-1">
        {m.content && (
          <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-bl-md bg-white border border-neutral-200 text-sm whitespace-pre-wrap">
            {m.content}
          </div>
        )}
        {toolCalls.length > 0 && (
          <div className="max-w-[85%] flex flex-col gap-1 pl-1">
            {toolCalls.map((c, i) => (
              <ToolCallChip key={i} name={c.name} args={c.args} docs={docs} />
            ))}
          </div>
        )}
      </div>
    );
  }
  // tool + system messages hidden from user
  return null;
}

export function ChatThreadPage() {
  const { threadId } = useParams();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();

  const [input, setInput] = useState('');
  const [error, setError] = useState(null);
  const [pendingDocs, setPendingDocs] = useState([]); // docs from the last turn response
  const scrollerRef = useRef(null);
  const openedInitialRef = useRef(false);

  const { data, isLoading } = useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => api.getThread(threadId),
  });
  const thread = data?.thread;
  const messages = data?.messages || [];

  const mutation = useMutation({
    mutationFn: (body) => api.postThreadTurn(threadId, body),
    onSuccess: (res) => {
      if (res?.new_documents?.length) setPendingDocs((p) => [...p, ...res.new_documents]);
      qc.invalidateQueries({ queryKey: ['thread', threadId] });
      qc.invalidateQueries({ queryKey: ['threads'] });
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (e) => setError(e),
  });

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, mutation.isPending]);

  // Handle ?open=<initial-message> from ChatHomePage: fire it once and clear the query.
  useEffect(() => {
    if (openedInitialRef.current) return;
    if (!thread) return;
    const opener = params.get('open');
    if (opener && messages.length === 0 && !mutation.isPending) {
      openedInitialRef.current = true;
      mutation.mutate({ message: opener });
      const next = new URLSearchParams(params);
      next.delete('open');
      setParams(next, { replace: true });
    }
  }, [thread, params, messages.length, mutation]);

  async function onSend(e) {
    e.preventDefault();
    if (!input.trim() || mutation.isPending) return;
    const msg = input;
    setInput('');
    setError(null);
    mutation.mutate({ message: msg });
  }

  // Doc cards inline: for each assistant message with a generate_document tool
  // call, attach the corresponding new_documents entry (in call order).
  const docs = pendingDocs; // simplest: append at the end of the thread
  const stageBadge = thread?.stage && (
    <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${STAGE_TONE[thread.stage] || 'bg-neutral-100'}`}>
      {thread.stage}
    </span>
  );

  if (isLoading) return <div className="text-neutral-500 p-4">Loading chat…</div>;
  if (!thread) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
        Thread not found. <Link to="/chat" className="underline">Back to chats</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => nav('/chat')}
          className="text-xs text-neutral-500 hover:text-neutral-800">← Chats</button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-neutral-900 truncate text-sm md:text-base">{thread.title}</div>
        </div>
        {stageBadge}
        {thread.pending_slot && thread.stage === 'gathering' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 truncate max-w-[50vw]">
            asking: {slotLabel(thread.pending_slot)}
            {typeof thread.clarify_count === 'number' && (
              <span className="opacity-70 ml-1">({thread.clarify_count}/3)</span>
            )}
          </span>
        )}
        {!thread.pending_slot && thread.clarify_count > 0 && thread.stage === 'gathering' && (
          <span className="text-[10px] text-amber-700">
            {thread.clarify_count}/3
          </span>
        )}
      </div>

      {/* Messages scroller */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto space-y-3 bg-neutral-50 border border-neutral-200 rounded-xl p-3 md:p-4">
        {messages.length === 0 && !mutation.isPending && (
          <div className="text-sm text-neutral-500">Start typing below to talk to the agent.</div>
        )}
        {messages.map((m, i) => (
          <MessageRow key={m.id || i} m={m} docs={docs} />
        ))}
        {/* Inline doc cards */}
        {docs.length > 0 && (
          <div className="flex flex-col gap-2 pt-2 border-t border-neutral-200">
            {docs.map((d) => <DocCard key={d.id} doc={d} />)}
          </div>
        )}
        {mutation.isPending && (
          <div className="text-sm text-neutral-400 italic">Agent is thinking…</div>
        )}
        {error && (() => {
          const detail = error?.data?.detail || error?.detail;
          const pgCode = error?.data?.pgCode;
          const stage = error?.data?.stage;
          const detailStr = typeof detail === 'string' ? detail : JSON.stringify(detail || {});
          return (
            <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded p-2 space-y-1">
              <div className="font-medium">{error.message || 'Something went wrong'}</div>
              {stage && <div className="text-xs opacity-70">Stage: <code className="bg-rose-100 px-1 py-0.5 rounded">{stage}</code></div>}
              {detail && (
                <div className="text-xs opacity-80 break-words">Detail: <code className="bg-rose-100 px-1 py-0.5 rounded">{detailStr}</code></div>
              )}
              {pgCode && (
                <div className="text-xs opacity-80">Postgres code: <code className="bg-rose-100 px-1 py-0.5 rounded">{pgCode}</code></div>
              )}
              {(pgCode === '42P01' || detailStr.toLowerCase().includes('does not exist')) && (
                <div className="text-xs mt-1">
                  Missing table. Confirm migrations 0002–0004 all ran in the same Supabase project as the API.
                </div>
              )}
              {detailStr.toLowerCase().includes('no_api_key') && (
                <div className="text-xs mt-1">
                  Paste your OpenRouter (or Cohere) key on the <a href="/settings" className="underline">Settings</a> page.
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Composer */}
      <form onSubmit={onSend} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={mutation.isPending}
          placeholder="Message the agent…"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sunvic-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={mutation.isPending || !input.trim()}
          className="px-4 py-2 rounded-md bg-sunvic-500 hover:bg-sunvic-600 text-white text-sm font-semibold disabled:opacity-60">
          Send
        </button>
      </form>
    </div>
  );
}

export default ChatThreadPage;
