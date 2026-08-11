// CopilotPage — a conversation, not a prompt box with a dashboard bolted underneath.
//
// What was wrong, precisely: the composer was rendered ABOVE the conversation, the
// conversation was a `max-h-[40vh]` block below it, and the business dashboard was below
// that. So when the agent asked "Who is the homeowner?" the question appeared *underneath*
// the box you answer it in, wedged against a wall of tabs and totals. There was no flow
// because the reading order ran backwards.
//
// It also felt like a different product from the document screen. The document screen shows
// what the agent actually DID — the tool calls it applied, the edits it refused, why it
// refused them. /api/threads/:id/turn returns exactly the same fields (applied_tool_calls,
// refused) and this page threw all of them away and printed only the prose. Same agent, half
// the information.
//
// So: conversation fills the page, composer docks to the bottom, every turn shows its tool
// calls and refusals, and a document the agent creates appears inline as a card you choose to
// open — instead of the page navigating out from under a conversation that is still going.

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAgent } from '../lib/useAgent.js';
import { useModelChoice } from '../components/ModelPickerDropdown.jsx';
import { PromptLibrary } from '../components/copilot/PromptLibrary.jsx';
import { AgentActivityFeed } from '../components/copilot/AgentActivityFeed.jsx';
import { ReviewCard } from '../components/copilot/ReviewCard.jsx';
import { BusinessDashboard } from '../components/copilot/BusinessDashboard.jsx';
import { SegmentedTabs } from '../components/SegmentedTabs.jsx';
import { AgentTurnDetail } from '../components/agent/AgentTurnDetail.jsx';
import { SlotChecklist } from '../components/copilot/SlotChecklist.jsx';
import { docHref } from '../lib/slugs.js';

const TABS = [
  { id: 'business', label: 'Business' },
  { id: 'recent', label: 'Recent' },
  { id: 'prompts', label: 'Prompts' },
];

export function CopilotPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [choice] = useModelChoice();
  const { busy, error, turns, send, threadId, thread } = useAgent();
  const [input, setInput] = useState('');
  const [tab, setTab] = useState(params.get('tab') || 'business');
  const scrollerRef = useRef(null);
  const inputRef = useRef(null);

  const started = turns.length > 0;

  // Tab choice is in the URL, so a view of the business is a link you can send someone.
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (tab === 'business') next.delete('tab'); else next.set('tab', tab);
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Follow the conversation as it grows — the point of putting it first.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [turns.length, busy]);

  async function run(prompt) {
    const msg = String(prompt ?? input).trim();
    if (!msg || busy) return;
    setInput('');
    await send(msg, { provider: choice.provider, model: choice.model });
    qc.invalidateQueries({ queryKey: ['documents'] });
    qc.invalidateQueries({ queryKey: ['projects'] });
    // Deliberately NOT navigating away. The agent asks follow-up questions; yanking the page
    // out from under a live conversation is what made this feel like a dead end. The document
    // shows up as a card and you decide when to open it.
    inputRef.current?.focus();
  }

  const composer = (
    <div className="rounded-2xl border border-neutral-300 bg-white p-2 shadow-sm focus-within:ring-2 focus-within:ring-sunvic-500">
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } }}
          placeholder={started
            ? 'Reply…'
            : 'e.g. "Create a contract for Jane Smith, full gut renovation at 36 Bushnell Rd, $65,000, starting Sept 1"'}
          rows={started ? 1 : 3}
          disabled={busy}
          data-testid="copilot-input"
          className="flex-1 resize-none outline-none text-base md:text-sm text-neutral-900 placeholder:text-neutral-400 px-1 py-2 max-h-40"
        />
        <button
          onClick={() => run()}
          disabled={busy || !input.trim()}
          data-testid="copilot-send"
          aria-label="Send"
          className="flex-shrink-0 min-h-[44px] min-w-[44px] px-4 rounded-xl bg-sunvic-500 hover:bg-sunvic-600 text-white text-sm font-semibold disabled:opacity-40"
        >
          {busy ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-3" data-testid="copilot-page">
      {!started && (
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Copilot</h1>
          <p className="text-sm text-neutral-500">Tell me what you need — I'll draft it and you review.</p>
        </div>
      )}

      {/* ── The conversation, first and largest once it exists ───────────── */}
      {started && (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 overflow-hidden flex flex-col"
             data-testid="copilot-conversation">
          <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-neutral-200">
            <div className="text-sm font-semibold text-neutral-900">Copilot</div>
            <div className="flex items-center gap-2">
              {threadId && (
                <span className="text-[10px] text-neutral-400 font-mono hidden md:inline">
                  thread {String(threadId).slice(0, 8)}
                </span>
              )}
              <span className={`w-2 h-2 rounded-full ${busy ? 'bg-sunvic-400 animate-pulse' : 'bg-emerald-500'}`} />
            </div>
          </div>

          <div ref={scrollerRef}
               className="flex-1 min-h-[38vh] max-h-[58vh] overflow-y-auto px-3 py-3 space-y-3">
            {turns.map((t, i) => (
              <div key={i} className="space-y-2">
                <div className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    data-testid={t.role === 'user' ? 'copilot-user-turn' : 'copilot-agent-turn'}
                    className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                      t.role === 'user'
                        ? 'bg-sunvic-500 text-white rounded-br-sm'
                        : 'bg-white border border-neutral-200 text-neutral-800 rounded-bl-sm'
                    }`}
                  >
                    {t.content}
                  </div>
                </div>

                {/* What the agent actually did — the same detail the document screen shows. */}
                {t.role === 'assistant' && (
                  <AgentTurnDetail tools={t.applied_tool_calls} refused={t.refused} />
                )}

                {t.new_documents?.map((d) => (
                  <div key={d.id} className="space-y-1">
                    {/* onOpen keeps the card from being one big navigation trap — the agent may
                        still be mid-conversation and tapping a summary should not end it. */}
                    <ReviewCard doc={d} onOpen={() => nav(docHref(d))} />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => nav(docHref(d))}
                        data-testid="copilot-open-doc"
                        className="min-h-[36px] px-3 rounded-lg bg-sunvic-500 text-white text-xs font-semibold"
                      >Open and finish it</button>
                      <span className="text-xs text-neutral-500 self-center">or keep talking here</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-white border border-neutral-200 text-sm text-neutral-400">
                  Working…
                </div>
              </div>
            )}
          </div>

          {/* Composer docked to the conversation it belongs to, with the running checklist
              directly above it so you can see how far along the draft is while you answer. */}
          <div className="p-2 bg-white border-t border-neutral-200 space-y-2">
            <SlotChecklist thread={thread} />
            {composer}
          </div>
        </div>
      )}

      {!started && composer}
      {error && <div className="text-sm text-rose-600" data-testid="copilot-error">{error}</div>}

      {/* ── The business, underneath, out of the conversation's way ──────── */}
      <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'business' && <BusinessDashboard />}
      {tab === 'recent' && <AgentActivityFeed limit={12} />}
      {tab === 'prompts' && <PromptLibrary onPick={(p) => run(p)} disabled={busy} />}
    </div>
  );
}

export default CopilotPage;
