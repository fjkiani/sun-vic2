import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAgent } from '../../lib/useAgent.js';
import { useModelChoice } from '../ModelPickerDropdown.jsx';

// Overview-first copilot for a project: a one-line summary of what the agent can do here,
// plus an embedded prompt scoped to this project. The agent does the work (creates invoices,
// emails, summarizes); the human reviews the resulting documents. Genuine — no fabricated data.
export function ProjectCopilotCard({ project }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [choice] = useModelChoice();
  const { busy, turns, send } = useAgent();
  const [input, setInput] = useState('');

  async function run(prompt) {
    const base = String(prompt ?? input).trim();
    if (!base || busy) return;
    setInput('');
    // Scope the prompt to this project so the agent knows which homeowner/contract.
    const scoped = `For the project "${project.name}" (homeowner: ${project.homeowner_name || 'unknown'}, address: ${project.property_address || 'unknown'}): ${base}`;
    const result = await send(scoped, { provider: choice.provider, model: choice.model });
    qc.invalidateQueries({ queryKey: ['project-summary', project.id] });
    qc.invalidateQueries({ queryKey: ['documents'] });
    if (result?.new_documents?.length === 1) nav(`/documents/${result.new_documents[0].id}`);
  }

  const last = turns[turns.length - 1];

  return (
    <div className="rounded-xl border border-sunvic-200 bg-sunvic-50 p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sunvic-600">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1 15l-4-4 1.41-1.41L11 14.17l5.59-5.59L18 10l-7 7z" />
          </svg>
        </span>
        <div className="text-xs font-semibold text-sunvic-800 uppercase tracking-wide">Copilot for this project</div>
      </div>
      <p className="text-sm text-neutral-600 mb-2">
        I can create the next invoice, email a document, or summarize where this project stands — just ask.
      </p>
      {last && (
        <div className="mb-2 rounded-lg bg-white border border-neutral-200 px-3 py-2 text-sm text-neutral-800">
          {last.content}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } }}
          placeholder='e.g. "Create the deposit invoice" or "Email the contract"'
          disabled={busy}
          className="flex-1 rounded-lg border border-neutral-300 px-3 min-h-[44px] text-sm focus:outline-none focus:ring-2 focus:ring-sunvic-500"
        />
        <button
          onClick={() => run()}
          disabled={busy || !input.trim()}
          className="min-h-[44px] px-4 rounded-lg bg-sunvic-500 hover:bg-sunvic-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? '…' : 'Ask'}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {['Create the deposit invoice', 'Email the contract to the homeowner', 'Summarize this project'].map((s) => (
          <button
            key={s}
            onClick={() => run(s)}
            disabled={busy}
            className="text-xs rounded-full border border-sunvic-300 text-sunvic-700 bg-white px-2.5 py-1 hover:bg-sunvic-100 disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
