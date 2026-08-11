// CopilotPage — the home screen. Ask box on top, business behind tabs underneath.
//
// This page used to be a prompt box, a "Ready to go" grid of four prompt cards and a flat
// "Recent work" list, all stacked. That tells a contractor nothing about their business:
// no contracted total, no collected total, no idea which drafts are sitting unsent. The
// ask box stays pinned — it is the point of the product — but the space below it now
// answers "how am I doing" first, with the prompt library and the raw recent-work list
// moved behind tabs instead of dumped down the page.

import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAgent } from '../lib/useAgent.js';
import { useModelChoice } from '../components/ModelPickerDropdown.jsx';
import { PromptLibrary } from '../components/copilot/PromptLibrary.jsx';
import { AgentActivityFeed } from '../components/copilot/AgentActivityFeed.jsx';
import { ReviewCard } from '../components/copilot/ReviewCard.jsx';
import { BusinessDashboard } from '../components/copilot/BusinessDashboard.jsx';
import { SegmentedTabs } from '../components/SegmentedTabs.jsx';

const TABS = [
  { id: 'business', label: 'Business' },
  { id: 'recent', label: 'Recent' },
  { id: 'prompts', label: 'Prompts' },
];

export function CopilotPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [choice] = useModelChoice();
  const { busy, error, turns, send } = useAgent();
  const [input, setInput] = useState('');
  const [tab, setTab] = useState('business');
  const scrollerRef = useRef(null);

  async function run(prompt) {
    const msg = String(prompt ?? input).trim();
    if (!msg || busy) return;
    setInput('');
    const result = await send(msg, { provider: choice.provider, model: choice.model });
    // Refresh both the activity feed and the dashboard aggregates.
    qc.invalidateQueries({ queryKey: ['documents'] });
    qc.invalidateQueries({ queryKey: ['projects'] });
    // If the agent created exactly one document, take the user straight to its AI-first
    // screen to review. Otherwise stay here and show the review cards.
    if (result?.new_documents?.length === 1) {
      nav(`/documents/${result.new_documents[0].id}`);
    }
    setTimeout(() => scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' }), 50);
  }

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Copilot</h1>
        <p className="text-sm text-neutral-500">Tell me what you need — I'll draft it and you review.</p>
      </div>

      {/* Prompt box — pinned above everything else. */}
      <div className="rounded-2xl border border-neutral-300 bg-white p-3 shadow-sm focus-within:ring-2 focus-within:ring-sunvic-500">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } }}
          placeholder='e.g. "Create a contract for Jane Smith, full gut renovation at 36 Bushnell Rd, $65,000, starting Sept 1"'
          rows={3}
          disabled={busy}
          className="w-full resize-none outline-none text-sm text-neutral-900 placeholder:text-neutral-400"
        />
        <div className="flex justify-end mt-1">
          <button
            onClick={() => run()}
            disabled={busy || !input.trim()}
            className="min-h-[44px] px-5 rounded-xl bg-sunvic-500 hover:bg-sunvic-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Send'}
          </button>
        </div>
      </div>
      {error && <div className="text-sm text-rose-600">{error}</div>}

      {/* Conversation — only occupies space once there is one. */}
      {turns.length > 0 && (
        <div ref={scrollerRef} className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
          {turns.map((t, i) => (
            <div key={i}>
              <div className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                  t.role === 'user'
                    ? 'bg-sunvic-500 text-white'
                    : 'bg-white border border-neutral-200 text-neutral-800'
                }`}>
                  {t.content}
                </div>
              </div>
              {t.new_documents?.map((d) => <ReviewCard key={d.id} doc={d} />)}
            </div>
          ))}
          {busy && <div className="text-sm text-neutral-400">Working…</div>}
        </div>
      )}

      <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'business' && <BusinessDashboard />}

      {tab === 'recent' && <AgentActivityFeed limit={12} />}

      {tab === 'prompts' && <PromptLibrary onPick={(p) => run(p)} disabled={busy} />}
    </div>
  );
}

export default CopilotPage;
