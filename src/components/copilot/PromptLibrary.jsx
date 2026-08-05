import React from 'react';

// Ready-to-go prompts wired to real agent workflows. Tapping one fills the prompt box
// (or immediately runs it) so the user never starts from a blank box. These map to the
// agent's actual capabilities: create contract/invoice, generate PDF, email, summarize.
const SUGGESTED = [
  {
    id: 'new-contract',
    label: 'New contract',
    hint: 'Draft a full NJ home-improvement contract',
    prompt: 'Create a new home-improvement contract. Ask me for the homeowner name, property address, scope of work, total price, and start date if you need them.',
  },
  {
    id: 'new-invoice',
    label: 'New invoice',
    hint: 'Deposit or progress invoice from a contract',
    prompt: 'Create an invoice for the next milestone on a contract. Ask me which contract and which milestone (deposit, progress, or final) if you need to.',
  },
  {
    id: 'email-doc',
    label: 'Email a document',
    hint: 'Send a contract or invoice to the homeowner',
    prompt: 'Email a document to its homeowner. Ask me which document if you need to, then generate the PDF and send it.',
  },
  {
    id: 'review',
    label: 'What needs review?',
    hint: 'Show drafts and next steps',
    prompt: 'Summarize what you have done recently and what still needs my review or a next step (drafts to send, invoices to create, documents to sign).',
  },
];

export function PromptLibrary({ onPick, disabled }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {SUGGESTED.map((s) => (
        <button
          key={s.id}
          onClick={() => onPick(s.prompt)}
          disabled={disabled}
          className="text-left rounded-xl border border-neutral-200 bg-white p-3 hover:border-sunvic-400 hover:bg-sunvic-50 transition-colors disabled:opacity-50"
        >
          <div className="text-sm font-semibold text-neutral-900">{s.label}</div>
          <div className="text-xs text-neutral-500 mt-0.5">{s.hint}</div>
        </button>
      ))}
    </div>
  );
}
