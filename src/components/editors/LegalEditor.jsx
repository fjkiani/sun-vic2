import React from 'react';
import { Accordion, AccordionItem } from '../ui/Accordion.jsx';
import { FieldRow, TextField } from '../ui/FieldRow.jsx';
import { LEGAL_TABS, blocksFor } from '../doc/docSections.js';
import { LEGAL_BLOCK_META, legalBlocksFor } from './legal/legalMeta.js';
import { SectionAgentButton } from '../agent/SectionAgentButton.jsx';
import { DEFAULT_CONTRACT_LOCKS, DEFAULT_INVOICE_LOCKS } from '../../../packages/templates/legal.js';

// The paths the server ships locked. Membership here means "canonical language", which is
// what the lock chip toggles — so re-locking restores exactly the default protection and
// never locks a field that was always meant to be freely editable.
const CANONICAL_PATHS = new Set([
  ...Object.keys(DEFAULT_CONTRACT_LOCKS),
  ...Object.keys(DEFAULT_INVOICE_LOCKS),
]);

function LockChip({ locked, onToggle }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium min-h-[44px] ${
        locked
          ? 'bg-neutral-200 text-neutral-700 active:bg-neutral-300'
          : 'bg-amber-100 text-amber-900 active:bg-amber-200'
      }`}
      aria-pressed={!locked}
      aria-label={locked ? 'Unlock this section for editing' : 'Restore canonical language lock'}
    >
      {locked ? 'Locked · Unlock' : 'Unlocked · Re-lock'}
    </button>
  );
}

// Legal blocks, rebound to the payload shapes that actually exist.
//
// What was broken: the editor rendered a single textarea at `<key>.text` for warranties,
// permits, insurance, dispute_resolution and right_to_cancel. `permits` has no `.text` —
// it is {intro, contractor_responsible, homeowner_responsible}. Neither does
// `dispute_resolution`, which is {intro, steps[], footer}. Those two boxes rendered empty
// and wrote keys the PDF never reads. Five sections that do print — change_orders,
// unforeseen, material_selection, invoice_terms and signature — had no editor at all.
//
// A regression test now extracts every path this file writes and proves each one exists
// in the schema *and* is consumed by ContractPDF, so the class of bug cannot return.

function Card({ children }) {
  return <div className="border border-neutral-200 rounded-xl bg-white">{children}</div>;
}

function preview(text, n = 64) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

// Radio pair rather than two independent checkboxes: permits are one party's job, and the
// PDF prints both boxes. Ticking both produced a contract that contradicts itself.
function ResponsibilityChoice({ p, set }) {
  const perm = p.permits || {};
  const value = perm.homeowner_responsible ? 'homeowner' : 'contractor';
  function choose(who) {
    set({
      'permits.contractor_responsible': who === 'contractor',
      'permits.homeowner_responsible': who === 'homeowner',
    });
  }
  const options = [
    ['contractor', 'Sunvic pulls the permits', 'The usual arrangement.'],
    ['homeowner', 'The homeowner pulls the permits', 'Use when the owner is acting as their own general contractor.'],
  ];
  return (
    <div className="space-y-2">
      {options.map(([id, label, note]) => (
        <button
          key={id}
          type="button"
          onClick={() => choose(id)}
          className={`w-full flex items-start gap-3 text-left rounded-xl border px-3 py-3 min-h-[56px] ${
            value === id ? 'border-sunvic-500 bg-sunvic-50' : 'border-neutral-300 bg-white'
          }`}
        >
          <span
            className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
              value === id ? 'border-sunvic-600' : 'border-neutral-300'
            }`}
          >
            {value === id && <span className="w-2.5 h-2.5 rounded-full bg-sunvic-600" />}
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] text-neutral-900">{label}</span>
            <span className="block text-xs text-neutral-500 mt-0.5">{note}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function StepsEditor({ steps, set }) {
  const list = Array.isArray(steps) ? steps : [];
  function write(next) { set({ 'dispute_resolution.steps': next }); }
  return (
    <div className="space-y-2">
      {list.length === 0 && (
        <p className="text-xs text-neutral-500 py-2">
          No escalation steps yet. The standard ladder is direct discussion, then mediation, then arbitration.
        </p>
      )}
      {list.map((step, i) => (
        <div key={i} className="border border-neutral-200 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-neutral-100 text-neutral-600 text-sm flex items-center justify-center font-medium">
              {i + 1}
            </span>
            <TextField
              value={step.name || ''}
              placeholder="Step name, e.g. Mediation"
              onChange={(v) => write(list.map((s, ix) => (ix === i ? { ...s, name: v } : s)))}
            />
          </div>
          <TextField
            multiline
            rows={3}
            value={step.text || ''}
            placeholder="What happens at this step"
            onChange={(v) => write(list.map((s, ix) => (ix === i ? { ...s, text: v } : s)))}
          />
          <button
            type="button"
            onClick={() => write(list.filter((_, ix) => ix !== i))}
            className="w-full min-h-[44px] rounded-xl border border-rose-200 text-rose-600 text-sm active:bg-rose-50"
          >
            Remove step
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => write([...list, { name: '', text: '' }])}
        className="w-full min-h-[44px] rounded-xl border border-neutral-300 text-sm text-neutral-700 active:bg-neutral-50"
      >
        + Add step
      </button>
    </div>
  );
}

// ── one renderer per block ───────────────────────────────────

function BlockBody({ id, p, set }) {
  switch (id) {
    case 'permits':
      return (
        <div className="space-y-3">
          <ResponsibilityChoice p={p} set={set} />
          <Card>
            <FieldRow label="Opening paragraph" value={preview(p.permits?.intro)} hint="Printed above the responsibility boxes on the contract." path="permits.intro">
              <TextField multiline rows={5} value={p.permits?.intro || ''} onChange={(v) => set({ 'permits.intro': v })} />
            </FieldRow>
          </Card>
        </div>
      );

    case 'change_orders':
      return (
        <Card>
          <FieldRow label="Change order terms" value={preview(p.change_orders?.text)} defaultOpen path="change_orders.text">
            <TextField multiline rows={9} value={p.change_orders?.text || ''} onChange={(v) => set({ 'change_orders.text': v })} />
          </FieldRow>
        </Card>
      );

    case 'material_selection':
      return (
        <Card>
          <FieldRow label="Material selection terms" value={preview(p.material_selection?.text)} defaultOpen path="material_selection.text">
            <TextField multiline rows={9} value={p.material_selection?.text || ''} onChange={(v) => set({ 'material_selection.text': v })} />
          </FieldRow>
        </Card>
      );

    case 'invoice_terms':
      return (
        <Card>
          <FieldRow label="Invoicing terms" value={preview(p.invoice_terms?.text)} defaultOpen path="invoice_terms.text">
            <TextField multiline rows={9} value={p.invoice_terms?.text || ''} onChange={(v) => set({ 'invoice_terms.text': v })} />
          </FieldRow>
        </Card>
      );

    case 'warranties':
      return (
        <Card>
          <FieldRow label="Warranty terms" value={preview(p.warranties?.text)} defaultOpen path="warranties.text">
            <TextField multiline rows={7} value={p.warranties?.text || ''} onChange={(v) => set({ 'warranties.text': v })} />
          </FieldRow>
          <FieldRow label="When cover starts" value={preview(p.warranties?.start_text)} hint="The sentence that fixes the warranty start date." path="warranties.start_text">
            <TextField multiline rows={4} value={p.warranties?.start_text || ''} onChange={(v) => set({ 'warranties.start_text': v })} />
          </FieldRow>
          <FieldRow label="Manufacturer warranties" value={preview(p.warranties?.materials_text)} hint="How product warranties pass through to the homeowner." path="warranties.materials_text">
            <TextField multiline rows={4} value={p.warranties?.materials_text || ''} onChange={(v) => set({ 'warranties.materials_text': v })} />
          </FieldRow>
        </Card>
      );

    case 'insurance':
      return (
        <Card>
          <FieldRow label="Insurance statement" value={preview(p.insurance?.text)} defaultOpen path="insurance.text">
            <TextField multiline rows={7} value={p.insurance?.text || ''} onChange={(v) => set({ 'insurance.text': v })} />
          </FieldRow>
        </Card>
      );

    case 'unforeseen':
      return (
        <Card>
          <FieldRow label="Opening paragraph" value={preview(p.unforeseen?.text)} defaultOpen path="unforeseen.text">
            <TextField multiline rows={6} value={p.unforeseen?.text || ''} onChange={(v) => set({ 'unforeseen.text': v })} />
          </FieldRow>
          <FieldRow label="Option 1" value={preview(p.unforeseen?.option_1)} hint="The first choice offered to the homeowner when hidden damage is found." path="unforeseen.option_1">
            <TextField multiline rows={5} value={p.unforeseen?.option_1 || ''} onChange={(v) => set({ 'unforeseen.option_1': v })} />
          </FieldRow>
          <FieldRow label="Option 2" value={preview(p.unforeseen?.option_2)} hint="The alternative choice." path="unforeseen.option_2">
            <TextField multiline rows={5} value={p.unforeseen?.option_2 || ''} onChange={(v) => set({ 'unforeseen.option_2': v })} />
          </FieldRow>
        </Card>
      );

    case 'right_to_cancel':
      return (
        <div className="space-y-3">
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-900">
            This wording satisfies the New Jersey Home Improvement Contract Act three-business-day
            cancellation requirement. Editing it can make the contract unenforceable.
          </div>
          <Card>
            <FieldRow label="Cancellation notice" value={preview(p.right_to_cancel?.text)} path="right_to_cancel.text">
              <TextField multiline rows={12} value={p.right_to_cancel?.text || ''} onChange={(v) => set({ 'right_to_cancel.text': v })} />
            </FieldRow>
          </Card>
        </div>
      );

    case 'dispute_resolution':
      return (
        <div className="space-y-3">
          <Card>
            <FieldRow label="Opening paragraph" value={preview(p.dispute_resolution?.intro)} defaultOpen path="dispute_resolution.intro">
              <TextField multiline rows={4} value={p.dispute_resolution?.intro || ''} onChange={(v) => set({ 'dispute_resolution.intro': v })} />
            </FieldRow>
          </Card>
          <div>
            <h4 className="text-xs uppercase tracking-wide text-neutral-500 font-semibold px-1 mb-2">Escalation steps</h4>
            <StepsEditor steps={p.dispute_resolution?.steps} set={set} />
          </div>
          <Card>
            <FieldRow label="Closing paragraph" value={preview(p.dispute_resolution?.footer)} path="dispute_resolution.footer">
              <TextField multiline rows={4} value={p.dispute_resolution?.footer || ''} onChange={(v) => set({ 'dispute_resolution.footer': v })} />
            </FieldRow>
          </Card>
        </div>
      );

    case 'signature':
      return (
        <div className="space-y-3">
          <Card>
            <FieldRow label="Signature page introduction" value={preview(p.signature?.intro)} path="signature.intro">
              <TextField multiline rows={5} value={p.signature?.intro || ''} onChange={(v) => set({ 'signature.intro': v })} />
            </FieldRow>
            <FieldRow label="Contractor printed name" value={p.signature?.contractor?.printed_name} path="signature.contractor.printed_name">
              <TextField
                value={p.signature?.contractor?.printed_name || ''}
                onChange={(v) => set({ 'signature.contractor.printed_name': v })}
              />
            </FieldRow>
            <FieldRow label="Homeowner printed name" value={p.signature?.homeowner?.printed_name} hint="Must match the name on the cover page." path="signature.homeowner.printed_name">
              <TextField
                value={p.signature?.homeowner?.printed_name || ''}
                onChange={(v) => set({ 'signature.homeowner.printed_name': v })}
              />
            </FieldRow>
          </Card>
          <p className="text-xs text-neutral-500 px-1 leading-snug">
            Signature dates are recorded when the document is actually signed, not typed here.
          </p>
        </div>
      );

    default:
      return null;
  }
}

// ── shell ────────────────────────────────────────────────────

// Short "is this block filled in" signal for the collapsed row, so a phone user can see at
// a glance which legal sections still need attention.
function blockState(id, p) {
  const meta = LEGAL_BLOCK_META[id];
  const get = (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), p);
  const textPaths = meta.paths.filter((x) => !/responsible$/.test(x));
  const filled = textPaths.filter((x) => {
    const v = get(x);
    if (Array.isArray(v)) return v.length > 0;
    return typeof v === 'string' ? v.trim() !== '' : v != null;
  });
  return { filled: filled.length, total: textPaths.length };
}

export function LegalEditor({ doc, onSave, onToggleLock, section = null }) {
  const p = doc?.payload || {};
  const locks = doc?.locks || {};

  const allowed = blocksFor(LEGAL_TABS, section);
  const visible = legalBlocksFor(doc?.template, allowed);

  if (visible.length === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-neutral-500">Nothing legal to edit on this tab for an invoice.</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="rounded-xl bg-neutral-100 px-3 py-2.5 text-xs text-neutral-600 leading-snug">
        These blocks carry canonical Sunvic language and the clauses New Jersey requires. Edit only when a
        specific job needs different terms.
      </div>

      <Accordion defaultOpen={visible[0] || null}>
        {visible.map((id) => {
          const meta = LEGAL_BLOCK_META[id];
          const { filled, total } = blockState(id, p);
          const incomplete = filled < total;

          // Which of this block's paths the server will refuse to write. Anything in
          // here is skipped by mergeWithLocks and answered 200, so the editor has to
          // refuse it up front rather than let the save look like it worked.
          const canonical = meta.paths.filter((path) => CANONICAL_PATHS.has(path));
          const lockedPaths = canonical.filter((path) => locks[path] === true);
          const isLocked = lockedPaths.length > 0;

          // Belt and braces: even if a child somehow fires while locked, drop the
          // locked keys instead of shipping a write that will be silently discarded.
          const set = (patch) => {
            if (!isLocked) return onSave(patch);
            const writable = Object.fromEntries(
              Object.entries(patch).filter(([path]) => locks[path] !== true)
            );
            if (Object.keys(writable).length > 0) onSave(writable);
          };

          const toggle = () => {
            if (!onToggleLock) return;
            (isLocked ? lockedPaths : canonical).forEach((path) => onToggleLock(path));
          };

          return (
            <AccordionItem
              key={id}
              id={id}
              title={meta.title}
              subtitle={meta.plain}
              badge={incomplete && !isLocked ? `${filled}/${total}` : null}
              warn={incomplete && !isLocked}
              action={(
                // The lock chip used to occupy this slot alone, which silently dropped the
                // per-section agent button from every legal block — measured live: Form
                // had 3, Legal had 0. Both belong here.
                <div className="flex items-center gap-1.5">
                  {canonical.length > 0 && <LockChip locked={isLocked} onToggle={toggle} />}
                  <SectionAgentButton tab="legal" blocks={[id]} label={meta.title} />
                </div>
              )}
            >
              <div className="space-y-3">
                <p className="text-xs text-neutral-500 leading-snug">{meta.help}</p>
                {isLocked && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-900 leading-snug">
                    This is canonical Sunvic language. It is read-only so it cannot be changed by
                    accident — tap <span className="font-medium">Unlock</span> above if this job
                    genuinely needs different terms.
                  </div>
                )}
                <div
                  className={isLocked ? 'pointer-events-none select-none opacity-60' : undefined}
                  aria-disabled={isLocked || undefined}
                >
                  <BlockBody id={id} p={p} set={set} />
                </div>
              </div>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
