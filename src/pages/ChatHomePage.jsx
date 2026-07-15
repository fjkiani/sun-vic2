// ChatHomePage — the agentic entry point.
// - Big prompt box at top (starts a new thread and jumps to /chat/:id)
// - Starter cards (Contract, Invoice)
// - Recent threads grid below

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

const STAGE_TONE = {
  gathering: 'bg-amber-100 text-amber-800',
  drafting:  'bg-blue-100 text-blue-800',
  editing:   'bg-blue-100 text-blue-800',
  sending:   'bg-indigo-100 text-indigo-800',
  done:      'bg-emerald-100 text-emerald-800',
};

const STARTERS = [
  {
    title: 'Draft a contract',
    example: 'Write a contract for a full gut kitchen renovation at 123 Oak St, homeowner Jane Smith, budget $65,000, start July 15th.',
    template: 'contract',
  },
  {
    title: 'Draft an invoice',
    example: 'Invoice John Doe for the completed roof job at 456 Elm — $12,400, phase 2 progress payment.',
    template: 'invoice',
  },
];

export function ChatHomePage() {
  const nav = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['threads'],
    queryFn: () => api.listThreads({ limit: 24 }),
  });
  const threads = data?.threads || [];

  async function startThread(text) {
    if (!text.trim()) return;
    setStarting(true);
    setError(null);
    try {
      // Create the thread first, then jump in — the thread page will send the opening message.
      const { thread } = await api.createThread({ title: 'New chat' });
      nav(`/chat/${thread.id}?open=${encodeURIComponent(text)}`);
    } catch (e) {
      setError(e);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Big prompt hero */}
      <div className="bg-gradient-to-br from-sunvic-500 to-sunvic-600 rounded-2xl p-5 md:p-8 text-white shadow">
        <div className="text-lg md:text-2xl font-bold mb-1">Sunvic Agent</div>
        <div className="text-xs md:text-sm text-white/85 mb-4">
          Tell me what you need. I&rsquo;ll draft the contract or invoice end-to-end.
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); startThread(prompt); }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={starting}
            placeholder="e.g. contract for a kitchen reno at 12 Maple St, homeowner Jane Smith, $65k, starts July 15…"
            className="flex-1 rounded-md px-3 py-2.5 md:py-3 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-white"
          />
          <button
            type="submit"
            disabled={starting || !prompt.trim()}
            className="px-4 py-2.5 md:py-3 rounded-md bg-white text-sunvic-700 font-semibold text-sm disabled:opacity-60"
          >
            {starting ? 'Starting…' : 'Start'}
          </button>
        </form>
        {error && (
          <div className="mt-2 text-xs text-white bg-red-500/40 rounded p-2">
            Couldn&rsquo;t start thread: {error.message}
            {String(error.detail || '').includes('chat_threads') && (
              <div className="mt-1">
                Have you run <code className="bg-red-800/40 px-1 py-0.5 rounded">0004_chat_threads.sql</code> in the Supabase SQL editor?
              </div>
            )}
          </div>
        )}
      </div>

      {/* Starter cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {STARTERS.map((s) => (
          <button
            key={s.template}
            onClick={() => startThread(s.example)}
            disabled={starting}
            className="text-left bg-white border border-neutral-200 hover:border-sunvic-400 hover:shadow-sm transition rounded-xl p-4 disabled:opacity-60"
          >
            <div className="text-xs uppercase tracking-wide text-sunvic-600 font-semibold mb-1">{s.template}</div>
            <div className="font-semibold text-neutral-900 mb-1">{s.title}</div>
            <div className="text-xs text-neutral-500 line-clamp-3">{s.example}</div>
          </button>
        ))}
      </div>

      {/* Recent threads */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-neutral-700">Recent chats</div>
          <Link to="/documents" className="text-xs text-neutral-500 hover:text-neutral-800">All documents →</Link>
        </div>
        {isLoading && <div className="text-sm text-neutral-500">Loading…</div>}
        {!isLoading && threads.length === 0 && (
          <div className="border-2 border-dashed border-neutral-300 rounded-xl p-8 text-center text-neutral-500 text-sm">
            No chats yet. Start one above to draft your first contract or invoice.
          </div>
        )}
        {threads.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {threads.map((t) => (
              <Link key={t.id} to={`/chat/${t.id}`}
                className="bg-white border border-neutral-200 hover:border-sunvic-400 hover:shadow-sm transition rounded-xl p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="font-semibold text-neutral-900 truncate text-sm">{t.title}</div>
                  {t.stage && (
                    <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${STAGE_TONE[t.stage] || 'bg-neutral-100'}`}>
                      {t.stage}
                    </span>
                  )}
                </div>
                {t.clarify_count > 0 && t.stage === 'gathering' && (
                  <div className="text-[10px] text-amber-700 mb-1">gathering {t.clarify_count}/3</div>
                )}
                <div className="text-[11px] text-neutral-500">
                  {t.last_message_at ? new Date(t.last_message_at).toLocaleString() : 'no messages'}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatHomePage;
