// NewDocumentPage — the iter-3 rewrite.
// Two paths:
//   1. Agentic: type a prompt → POST /api/threads to create a thread → jump to /chat/:id?open=…
//   2. Manual: pick template → POST /api/documents with defaults → go to editor
//
// The old "agentic → oneshot → editor" path is gone. All conversational generation now goes
// through the thread agent so we get memory, clarifying questions, and end-to-end automation.

import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';

export function NewDocumentPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const initialTemplate = params.get('template') || '';
  const [prompt, setPrompt] = useState('');
  const [templateHint, setTemplateHint] = useState(initialTemplate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function createBlank(template) {
    setBusy(true); setError('');
    try {
      const { document } = await api.createDocument({ template });
      nav(`/documents/${document.id}`);
    } catch (e) { setError(e.message || String(e)); } finally { setBusy(false); }
  }

  async function startAgentic() {
    if (!prompt.trim()) return;
    setBusy(true); setError('');
    try {
      const { thread } = await api.createThread({ title: 'New chat' });
      // Prefill the opening message with a template hint if the user chose one.
      const opener = templateHint
        ? `Please draft a ${templateHint}: ${prompt.trim()}`
        : prompt.trim();
      nav(`/chat/${thread.id}?open=${encodeURIComponent(opener)}`);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl md:text-2xl font-bold">New Document</h1>

      {/* Agentic (chat-first) */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 md:p-6 space-y-3 md:space-y-4">
        <div>
          <h2 className="text-base md:text-lg font-bold text-neutral-900">Chat with the agent</h2>
          <p className="text-xs md:text-sm text-neutral-500">
            Describe the job in plain English. The agent will ask up to 3 clarifying questions
            (homeowner, address, budget, timeline), then draft the document end-to-end.
          </p>
        </div>
        <textarea
          rows={5}
          placeholder="e.g. Full home reno at 665 Denver Blvd, 3200 sqft, gut kitchen + 2 baths + second-story addition, homeowner Jane Smith, start Aug 1"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sunvic-500 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm flex items-center gap-2">
            <span className="text-neutral-500">Template hint:</span>
            <select value={templateHint} onChange={(e) => setTemplateHint(e.target.value)} className="rounded-md border border-neutral-300 px-2 py-1 text-sm">
              <option value="">Let the agent decide</option>
              <option value="contract">Contract</option>
              <option value="invoice">Invoice</option>
            </select>
          </label>
          <div className="flex-1" />
          <button
            disabled={busy || !prompt.trim()}
            onClick={startAgentic}
            className="px-4 py-2 rounded-md bg-sunvic-500 hover:bg-sunvic-600 text-white text-sm font-semibold disabled:opacity-60"
          >
            {busy ? 'Starting…' : 'Start chat →'}
          </button>
        </div>
        {error && (
          <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded p-3">
            <div className="font-medium">{error}</div>
            {error.includes('chat_threads') && (
              <div className="text-xs mt-2 text-rose-700">
                Have you run <code className="bg-rose-100 px-1 py-0.5 rounded">0004_chat_threads.sql</code> in the Supabase SQL editor?
              </div>
            )}
            {(error.includes('no_api_key') || error.includes('quota')) && (
              <div className="text-xs mt-2 text-rose-700">
                Add a valid API key on the <a href="/settings" className="underline font-semibold">Settings page</a>.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 md:p-6 space-y-3 md:space-y-4">
        <div>
          <h2 className="text-base md:text-lg font-bold text-neutral-900">Start blank</h2>
          <p className="text-xs md:text-sm text-neutral-500">Create an empty document and fill fields manually.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button disabled={busy} onClick={() => createBlank('contract')}
            className="px-4 py-2 rounded-md bg-white border border-sunvic-500 text-sunvic-600 hover:bg-sunvic-50 text-sm font-semibold disabled:opacity-60">
            New blank Contract
          </button>
          <button disabled={busy} onClick={() => createBlank('invoice')}
            className="px-4 py-2 rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 text-sm font-semibold disabled:opacity-60">
            New blank Invoice
          </button>
        </div>
      </div>
    </div>
  );
}
