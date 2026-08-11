import React from 'react';

// AgentTurnDetail — what the agent actually DID on a turn, rendered identically wherever
// the agent is used.
//
// Why this exists: /api/threads/:id/turn and /api/agent/chat both return `applied_tool_calls`
// and `refused`. The document screen's DocAskBar rendered them; the Copilot page threw them
// away and printed only the prose reply. Same agent, two different amounts of truth on
// screen — which is exactly why one surface felt like a real tool and the other felt like a
// chatbot bolted on. Both now render this component, so they cannot drift apart again.
//
// Shapes accepted (the two producers differ slightly and both are real):
//   applied : { tool, args?, result? }                       — thread-agent.js:692
//   refused : { tool, args?, error }                         — thread-agent.js:696
//             { tool, path, reason:'locked' }                — chat.js:93
//             { tool, args, error, locked:[paths] }          — chat.js:116

// Tools whose entire visible output IS the assistant's reply. Printing "✓ ask_slot" above the
// question the agent just asked is noise, not transparency.
const CONVERSATIONAL = new Set(['ask_slot', 'refuse_and_summarize']);
// Housekeeping the user did not ask for and does not need to audit.
const HOUSEKEEPING = new Set(['set_thread_title']);

const LABELS = {
  generate_document: 'Created the document',
  lookup_document: 'Looked up your documents',
  send_to_client: 'Emailed it to the client',
  set_field: 'Edited a field',
  set_fields: 'Edited fields',
  add_milestone: 'Added a payment milestone',
  set_schedule: 'Rewrote the payment schedule',
  set_scope: 'Updated the scope of work',
  set_status: 'Changed the status',
};

function labelFor(name) {
  return LABELS[name] || String(name || 'action').replace(/_/g, ' ');
}

// A short, concrete "what changed" line. Generic key: value dumps are useless on a phone, so
// only surface arguments that identify the thing that moved.
function detailFor(call) {
  const a = call?.args || {};
  if (call?.tool === 'generate_document') {
    const d = call?.result?.doc_number || call?.result?.title;
    return d ? String(d) : null;
  }
  if (a.path) return String(a.path);
  if (a.field) return String(a.field);
  if (Array.isArray(a.paths) && a.paths.length) return a.paths.join(', ');
  if (a.query) return `"${String(a.query).slice(0, 40)}"`;
  return null;
}

// chat.js emits reason:'locked' with a path; thread-agent.js emits an error string.
function refusalText(r) {
  if (r?.reason === 'locked' || r?.locked?.length) {
    const paths = r.locked?.length ? r.locked.join(', ') : r.path;
    return `${paths} is locked — required NJ contract language`;
  }
  return r?.error || r?.reason || 'refused';
}

export function AgentTurnDetail({ tools, refused, className = '' }) {
  const applied = (tools || []).filter(
    (t) => !CONVERSATIONAL.has(t?.tool) && !HOUSEKEEPING.has(t?.tool),
  );
  // Refusals are never hidden. A silent refusal is the failure mode that makes people think
  // the app saved something it did not.
  const denied = (refused || []).filter((r) => !CONVERSATIONAL.has(r?.tool));

  if (applied.length === 0 && denied.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1 ${className}`} data-testid="agent-turn-detail">
      {applied.map((t, i) => {
        const d = detailFor(t);
        return (
          <span
            key={`a${i}`}
            data-testid="agent-tool-applied"
            data-tool={t.tool}
            className="inline-flex items-center gap-1 text-[11px] bg-sunvic-50 border border-sunvic-200 text-sunvic-800 rounded-full px-2 py-0.5 max-w-full"
          >
            <span aria-hidden="true">✓</span>
            <span className="truncate">{labelFor(t.tool)}{d ? ` · ${d}` : ''}</span>
          </span>
        );
      })}
      {denied.map((r, i) => (
        <span
          key={`r${i}`}
          data-testid="agent-tool-refused"
          data-tool={r.tool || 'refused'}
          className="inline-flex items-center gap-1 text-[11px] bg-amber-50 border border-amber-300 text-amber-900 rounded-full px-2 py-0.5 max-w-full"
        >
          <span aria-hidden="true">🔒</span>
          <span className="truncate">Not saved · {refusalText(r)}</span>
        </span>
      ))}
    </div>
  );
}

export default AgentTurnDetail;
