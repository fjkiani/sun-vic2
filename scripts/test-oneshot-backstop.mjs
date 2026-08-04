// Test the oneshot deterministic-backstop path WITHOUT mocking any provider.
// We drive it with a userId that has NO provider keys → buildFallbackChain
// filters every candidate out (hasKey=false) → the chain is empty → oneshot
// falls through to composeFromSlots (the deterministic backstop) and reconciles.
// This exercises the REAL production code path (no provider injection, no stubs).
//
// Requires Supabase env (for resolveProviderKey to run) — it will return null
// keys for a random uuid, which is exactly the "all providers unavailable" case.

import { oneshot } from '../packages/agent/oneshot.js';
import { ContractPayload, InvoicePayload } from '../packages/schema/documents.js';

const NOKEY_USER = '00000000-0000-4000-8000-000000000000'; // valid-uuid, no keys

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

async function main() {
  // ── CONTRACT via deterministic backstop ──
  console.log('=== contract: deterministic backstop (no keys) ===');
  const contractSlots = {
    'homeowner.name': 'John & Sarah Chen',
    'homeowner.address': '123 Oak St, Edison, NJ 08820',
    'homeowner.phone': '(732) 555-0123',
    'homeowner.email': 'chen@example.com',
    'scope_categories': ['Interiors', 'MEP'],
    'payment.total_cents': 52000000,
    'timeline.start_date': '2026-08-01',
    'payment.method': 'check',
  };
  const c = await oneshot({
    prompt: 'Kitchen + MEP remodel for John & Sarah Chen',
    template: 'contract',
    providerId: 'cohere',
    userId: NOKEY_USER,
    gatheredSlots: contractSlots,
  });
  ok(c.source === 'deterministic', `expected deterministic source, got ${c.source}`);
  ok(c.provider === 'deterministic', `expected deterministic provider, got ${c.provider}`);
  const cParsed = ContractPayload.safeParse(c.payload);
  ok(cParsed.success, 'contract payload not schema-valid: ' + (cParsed.success?'':JSON.stringify(cParsed.error.issues.slice(0,3))));
  ok(c.payload.homeowner.name === 'John & Sarah Chen', `name lost: ${c.payload.homeowner.name}`);
  ok(c.total_cents === 52000000, `total_cents wrong: ${c.total_cents}`);
  const scopeSum = c.payload.scope_of_work.groups.reduce((s,g)=>s+g.tasks.reduce((t,x)=>t+x.amount_cents,0),0);
  ok(scopeSum === 52000000, `Bug J: scope sum ${scopeSum} != 52000000`);
  ok(c.payload.timeline.start_date === '2026-08-01', `Bug G: start_date ${c.payload.timeline.start_date}`);
  ok(c.payload.scope_of_work.groups.length === 2, `should be 2 categories, got ${c.payload.scope_of_work.groups.length}`);
  console.log(`   provider_failures: ${(c.provider_failures||[]).join(', ')}`);

  // ── INVOICE via deterministic backstop ──
  console.log('\n=== invoice: deterministic backstop (no keys) ===');
  const inv = await oneshot({
    prompt: 'Deposit invoice for the Chen contract',
    template: 'invoice',
    providerId: 'cohere',
    userId: NOKEY_USER,
    gatheredSlots: { 'linked_contract_id': 'CTR-2026-0001', 'milestone_label': 'Deposit' },
    invoiceContext: { contractTotalCents: 52000000, contractRef: 'CTR-2026-0001', billTo: { client_name: 'John & Sarah Chen', property_address: '123 Oak St', recipient_email: 'chen@example.com' } },
  });
  ok(inv.source === 'deterministic', `expected deterministic, got ${inv.source}`);
  const iParsed = InvoicePayload.safeParse(inv.payload);
  ok(iParsed.success, 'invoice not schema-valid: ' + (iParsed.success?'':JSON.stringify(iParsed.error.issues.slice(0,3))));
  ok(inv.payload.milestone.percent === 15, `deposit percent ${inv.payload.milestone.percent}`);
  ok(inv.payload.milestone.subtotal_cents === Math.round(52000000*0.15), `subtotal ${inv.payload.milestone.subtotal_cents}`);
  ok(inv.payload.totals.total_due_cents === inv.payload.totals.subtotal_cents + inv.payload.totals.tax_cents, `total_due mismatch`);
  ok(inv.payload.contract.total_cents === 52000000, `contract total not carried: ${inv.payload.contract.total_cents}`);
  ok(inv.total_cents === inv.payload.totals.total_due_cents, `top-level total_cents mismatch`);

  console.log(`\n──────────\nPASS ${pass}  FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
