import React from 'react';
import { AgentChatPanel } from '../AgentChatPanel.jsx';
import { AgentChangeSummary } from './AgentChangeSummary.jsx';

// The AI-first primary tab for a document. The agent is embedded here so the user can
// prompt end-to-end ("fill this contract for Jane Smith, $65k full gut reno") instead of
// editing line-by-line. A status card summarizes what the agent did and offers next steps.
export function DocAiTab({ doc, revisions, onDocumentUpdate, onGeneratePdf, onEmail, busyOp }) {
  return (
    <div className="h-full flex flex-col bg-white">
      <AgentChangeSummary
        doc={doc}
        revisions={revisions}
        onGeneratePdf={onGeneratePdf}
        onEmail={onEmail}
        busyOp={busyOp}
      />
      <div className="flex-1 min-h-0">
        <AgentChatPanel document={doc} onDocumentUpdate={onDocumentUpdate} />
      </div>
    </div>
  );
}
