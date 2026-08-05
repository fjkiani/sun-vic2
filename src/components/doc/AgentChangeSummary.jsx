import React from 'react';

// Human-in-the-loop summary: shows what the agent most recently changed on the document
// (from the latest agent revision) and offers next-step actions. Genuine data only —
// derives from the document's revisions + payload, never fabricated.
export function AgentChangeSummary({ doc, revisions, onGeneratePdf, onEmail, busyOp }) {
  const lastAgentEdit = (revisions || []).find((r) => r.change_source === 'agent_tool' || r.change_source === 'agent');

  return (
    <div className="mx-3 mt-3 rounded-xl border border-sunvic-200 bg-sunvic-50 p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sunvic-600">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1 15l-4-4 1.41-1.41L11 14.17l5.59-5.59L18 10l-7 7z" />
          </svg>
        </span>
        <div className="text-xs font-semibold text-sunvic-800 uppercase tracking-wide">Copilot status</div>
      </div>
      <div className="text-sm text-neutral-700">
        {lastAgentEdit
          ? `Last updated by the agent ${new Date(lastAgentEdit.created_at).toLocaleString()}. Review the Form / Preview / PDF tabs to see what was filled in.`
          : 'Ask the agent below to fill or edit this document. It will populate every field — then review the Form, Preview, and PDF tabs.'}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onGeneratePdf}
          disabled={busyOp === 'pdf'}
          className="flex-1 min-h-[40px] rounded-lg bg-sunvic-500 hover:bg-sunvic-600 text-white text-sm font-semibold disabled:opacity-60"
        >
          {busyOp === 'pdf' ? 'Generating…' : 'Generate PDF'}
        </button>
        <button
          onClick={onEmail}
          disabled={busyOp === 'email'}
          className="flex-1 min-h-[40px] rounded-lg border border-sunvic-500 text-sunvic-700 text-sm font-semibold hover:bg-sunvic-100 disabled:opacity-60"
        >
          {busyOp === 'email' ? 'Sending…' : 'Email'}
        </button>
      </div>
    </div>
  );
}
