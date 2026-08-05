import React from 'react';

// Copilot home — the agent-first entry point. WS-A provides the shell; WS-B fills the
// body (prompt box, suggested-prompt library, agent activity feed).
export function CopilotPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-neutral-900 mb-1">Copilot</h1>
      <p className="text-sm text-neutral-500">Your agent does the work — you review.</p>
      {/* WS-B: prompt box + PromptLibrary + AgentActivityFeed */}
    </div>
  );
}
