// MilestoneWorkflow — milestones the copilot can actually act on, with the human in the loop.
//
// The old MilestoneTimeline was read-only: with no payment schedule on the contract it
// printed "No milestones yet — set up the contract payment schedule" and left you to go
// find the contract, find the payment section, and hand-build a schedule. Every project
// with an unfinished contract therefore showed a dead end.
//
// Here the copilot proposes the schedule and drafts the invoice; the human confirms both.
// Nothing is written to a contract and no invoice is created without an explicit tap, and
// the proposal is shown in full — percentages, amounts and trigger conditions — before it
// can be accepted. The proposal is a standard four-stage split, not a language-model
// guess: it is instant, costs no provider quota, and is fully editable before saving.

import React, { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { docHref } from '../../lib/slugs.js';

function fmtUSD(cents) {
  return ((Number(cents) || 0) / 100).toLocaleString('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 2,
  });
}

// A conventional progress-payment split for a NJ home-improvement job. The human edits
// and confirms this; it is a starting point, not advice.
const PROPOSAL_TEMPLATE = [
  { milestone: 'Deposit', percent: 30, condition: 'Due on signing, before work is scheduled' },
  { milestone: 'Rough-in complete', percent: 30, condition: 'Framing, electrical and plumbing rough-in passed inspection' },
  { milestone: 'Substantial completion', percent: 30, condition: 'Work substantially complete and the space is usable' },
  { milestone: 'Final payment', percent: 10, condition: 'Final walkthrough done and punch list signed off' },
];

function StatusDot({ invoice }) {
  const tone = !invoice ? 'bg-neutral-300'
    : invoice.status === 'paid' ? 'bg-emerald-500'
    : invoice.status === 'overdue' ? 'bg-rose-500'
    : ['sent', 'signed'].includes(invoice.status) ? 'bg-blue-500'
    : 'bg-amber-500';
  return <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${tone}`} />;
}

export function MilestoneWorkflow({ projectId, project, milestones = [], contractId, money, onChanged }) {
  const nav = useNavigate();
  const [proposal, setProposal] = useState(null);
  const [busy, setBusy] = useState(null); // null | 'saving' | milestone index being invoiced
  const [error, setError] = useState(null);
  const [confirmIdx, setConfirmIdx] = useState(null);

  const contractTotal = Number(money?.contract_total_cents) || 0;
  const proposalSum = proposal ? proposal.reduce((a, r) => a + (Number(r.percent) || 0), 0) : 0;
  const proposalValid = proposal ? Math.abs(proposalSum - 100) < 0.001 : false;

  const propose = useCallback(() => {
    setError(null);
    setProposal(PROPOSAL_TEMPLATE.map((r) => ({ ...r })));
  }, []);

  const confirmProposal = useCallback(async () => {
    if (!contractId || !proposal || !proposalValid) return;
    setBusy('saving');
    setError(null);
    try {
      const res = await api.getDocument(contractId);
      const docRow = res.document || res;
      const payload = docRow.payload || {};
      const nextPayload = {
        ...payload,
        payment: {
          ...(payload.payment || {}),
          schedule: proposal.map((r) => ({
            milestone: r.milestone,
            percent: Number(r.percent) || 0,
            condition: r.condition || '',
          })),
        },
      };
      await api.updateDocument(contractId, { payload: nextPayload },
        { expectedUpdatedAt: docRow.updated_at });
      setProposal(null);
      onChanged?.();
    } catch (e) {
      setError(e?.message || 'Could not save the schedule');
    } finally {
      setBusy(null);
    }
  }, [contractId, proposal, proposalValid, onChanged]);

  const draftInvoice = useCallback(async (m, idx) => {
    setBusy(idx);
    setError(null);
    try {
      const amount = Number(m.amount_cents) || 0;
      const created = await api.createDocument({
        template: 'invoice',
        payload: {
          milestone_label: m.milestone,
          milestone_condition: m.condition || '',
          milestone: { percent: Number(m.percent) || 0, subtotal_cents: amount },
          contract: { total_cents: contractTotal },
          bill_to: {
            client_name: project?.homeowner_name || '',
            property_address: project?.property_address || '',
            recipient_email: project?.homeowner_email || '',
            recipient_phone: project?.homeowner_phone || '',
          },
          totals: { subtotal_cents: amount, tax_cents: 0, total_due_cents: amount, remaining_after_cents: 0 },
        },
      });
      const newId = created?.document?.id || created?.id;
      setConfirmIdx(null);
      onChanged?.();
      if (newId) nav(`/documents/${newId}`);
    } catch (e) {
      setError(e?.message || 'Could not create the invoice');
    } finally {
      setBusy(null);
    }
  }, [contractTotal, project, onChanged, nav]);

  // ── No contract to hang milestones off ────────────────────
  if (!contractId) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-5 text-center">
        <div className="text-sm font-medium text-neutral-700">No contract on this project yet</div>
        <div className="text-xs text-neutral-500 mt-1 mb-3">
          Milestones come from the contract's payment schedule, so there is nothing to track until one exists.
        </div>
        <Link to="/documents/new"
          className="inline-flex items-center min-h-[44px] px-4 rounded-lg bg-sunvic-500 text-white text-sm font-semibold">
          Create a contract
        </Link>
      </div>
    );
  }

  // ── Proposal under review ─────────────────────────────────
  if (proposal) {
    return (
      <div className="rounded-xl border border-sunvic-300 bg-sunvic-50 overflow-hidden">
        <div className="px-3 py-2.5 border-b border-sunvic-200">
          <div className="text-xs font-semibold text-sunvic-800 uppercase tracking-wide">Proposed payment schedule</div>
          <div className="text-xs text-neutral-600 mt-0.5">
            Review and edit before this is written to the contract. Nothing is saved yet.
          </div>
        </div>
        <div className="p-3 space-y-2">
          {proposal.map((r, i) => (
            <div key={i} className="rounded-lg bg-white border border-neutral-200 p-2.5">
              <div className="flex items-center gap-2">
                <input
                  value={r.milestone}
                  onChange={(e) => setProposal((p) => p.map((x, j) => j === i ? { ...x, milestone: e.target.value } : x))}
                  aria-label={`Milestone ${i + 1} name`}
                  className="flex-1 min-w-0 min-h-[44px] px-2 rounded border border-neutral-300 text-sm font-medium"
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <input
                    type="number" min="0" max="100" inputMode="decimal"
                    value={r.percent}
                    onChange={(e) => setProposal((p) => p.map((x, j) => j === i ? { ...x, percent: e.target.value } : x))}
                    aria-label={`Milestone ${i + 1} percent`}
                    className="w-16 min-h-[44px] px-2 rounded border border-neutral-300 text-sm text-right font-mono"
                  />
                  <span className="text-xs text-neutral-500">%</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1.5">
                <input
                  value={r.condition}
                  onChange={(e) => setProposal((p) => p.map((x, j) => j === i ? { ...x, condition: e.target.value } : x))}
                  aria-label={`Milestone ${i + 1} condition`}
                  placeholder="When this becomes due"
                  className="flex-1 min-w-0 min-h-[44px] px-2 rounded border border-neutral-200 text-xs text-neutral-600"
                />
                <span className="font-mono text-xs text-neutral-700 flex-shrink-0">
                  {fmtUSD(Math.round(contractTotal * (Number(r.percent) || 0) / 100))}
                </span>
              </div>
            </div>
          ))}

          <div className={`flex items-center justify-between text-xs rounded-lg px-2.5 py-2 ${
            proposalValid ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
          }`}>
            <span>{proposalValid ? 'Percentages add up' : 'Percentages must total 100%'}</span>
            <span className="font-mono font-semibold">{proposalSum}%</span>
          </div>

          {error && <div className="text-xs text-rose-700">{error}</div>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={confirmProposal} disabled={!proposalValid || busy === 'saving'}
              className="flex-1 min-h-[44px] rounded-lg bg-sunvic-500 text-white text-sm font-semibold disabled:opacity-50">
              {busy === 'saving' ? 'Saving…' : 'Confirm and save to contract'}
            </button>
            <button type="button" onClick={() => { setProposal(null); setError(null); }}
              className="min-h-[44px] px-4 rounded-lg border border-neutral-300 bg-white text-sm text-neutral-700">
              Discard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── No schedule yet — offer the proposal ──────────────────
  if (milestones.length === 0) {
    return (
      <div className="rounded-xl border border-sunvic-200 bg-sunvic-50 p-4">
        <div className="text-sm font-semibold text-neutral-800">No payment schedule on this contract</div>
        <div className="text-xs text-neutral-600 mt-1 mb-3">
          I can lay out a standard four-stage schedule against the {fmtUSD(contractTotal)} contract value.
          You review every line before anything is saved.
        </div>
        {error && <div className="text-xs text-rose-700 mb-2">{error}</div>}
        <button type="button" onClick={propose}
          className="min-h-[44px] px-4 rounded-lg bg-sunvic-500 text-white text-sm font-semibold">
          Propose a schedule
        </button>
      </div>
    );
  }

  // ── Live milestones ───────────────────────────────────────
  const invoiced = milestones.filter((m) => m.invoice).length;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-neutral-600 px-0.5">
        <span>{invoiced} of {milestones.length} invoiced</span>
        <span className="font-mono">{fmtUSD(contractTotal)} contract</span>
      </div>

      {error && <div className="text-xs text-rose-700 px-0.5">{error}</div>}

      <ol className="space-y-2">
        {milestones.map((m, i) => (
          <li key={i} className="rounded-xl border border-neutral-200 bg-white p-3">
            <div className="flex items-start gap-2.5">
              <div className="pt-1"><StatusDot invoice={m.invoice} /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-neutral-900 truncate">
                    {m.milestone || `Milestone ${i + 1}`}
                  </span>
                  <span className="font-mono text-sm text-neutral-800 flex-shrink-0">{fmtUSD(m.amount_cents)}</span>
                </div>
                <div className="text-[11px] text-neutral-500 mt-0.5">
                  {m.percent}% {m.condition ? `· ${m.condition}` : ''}
                </div>

                {m.invoice ? (
                  <Link to={docHref(m.invoice)}
                    className="inline-flex items-center gap-1.5 mt-2 min-h-[44px] px-2.5 rounded-lg border border-neutral-300 bg-neutral-50 text-xs font-mono">
                    {m.invoice.doc_number} · {m.invoice.status}
                  </Link>
                ) : confirmIdx === i ? (
                  <div className="mt-2 rounded-lg border border-sunvic-300 bg-sunvic-50 p-2.5">
                    <div className="text-xs text-neutral-700 mb-2">
                      Create a draft invoice for <strong>{fmtUSD(m.amount_cents)}</strong> billed to{' '}
                      {project?.homeowner_name || 'this homeowner'}? It opens for your review and is not sent.
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => draftInvoice(m, i)} disabled={busy === i}
                        className="flex-1 min-h-[44px] rounded-lg bg-sunvic-500 text-white text-xs font-semibold disabled:opacity-50">
                        {busy === i ? 'Creating…' : 'Yes, create the draft'}
                      </button>
                      <button type="button" onClick={() => setConfirmIdx(null)}
                        className="min-h-[44px] px-3 rounded-lg border border-neutral-300 bg-white text-xs">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmIdx(i)}
                    className="mt-2 min-h-[44px] px-3 rounded-lg border border-sunvic-300 text-sunvic-700 bg-white text-xs font-semibold">
                    Draft invoice
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default MilestoneWorkflow;
