// Unit test for the deterministic composer (compose.js).
// Validates against the REAL Zod schema. No network, no LLM.
import {
  composeContractFromSlots,
  composeInvoiceFromSlots,
  reconcileContractWithSlots,
  reconcileInvoiceWithSlots,
  allocateByWeight,
  computeInvoiceMath,
  buildScopeGroups,
} from '../packages/templates/compose.js';
import { ContractPayload, InvoicePayload } from '../packages/schema/documents.js';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', msg); } }
function section(t) { console.log('\n=== ' + t + ' ==='); }

// ── allocateByWeight: parts sum EXACTLY to total ──
section('allocateByWeight');
for (const [total, weights] of [[100000, [15,30,40,15]], [999999, [1,1,1]], [7, [3,3,3]], [0,[1,2]], [520000,[40,15]]]) {
  const parts = allocateByWeight(total, weights);
  const sum = parts.reduce((a,b)=>a+b,0);
  ok(sum === total, `alloc(${total},[${weights}]) sum=${sum} !== ${total}`);
  ok(parts.every((p)=>Number.isInteger(p) && p>=0), `alloc parts not non-neg ints: ${parts}`);
}

// ── computeInvoiceMath: internal consistency ──
section('computeInvoiceMath');
{
  const m = computeInvoiceMath({ contractTotalCents: 52000000, percent: 15, taxRatePercent: 6.625, taxAppliesTo: 'materials_only' });
  ok(m.subtotal_cents === Math.round(52000000*0.15), `subtotal ${m.subtotal_cents}`);
  ok(m.labor_portion_cents + m.materials_portion_cents === m.subtotal_cents, `labor+mat != subtotal`);
  ok(m.tax_cents === Math.round(m.materials_portion_cents*6.625/100), `tax base wrong ${m.tax_cents}`);
  ok(m.total_due_cents === m.subtotal_cents + m.tax_cents, `total_due wrong`);
}
{
  const m = computeInvoiceMath({ contractTotalCents: 10000000, percent: 100, taxAppliesTo: 'none' });
  ok(m.tax_cents === 0, `tax should be 0 for applies_to=none`);
}

// ── buildScopeGroups: task sum === total, only selected categories ──
section('buildScopeGroups (Bug J)');
{
  const { groups, totalCents } = buildScopeGroups(['Interiors','MEP'], 52000000);
  ok(groups.length === 2, `expected 2 groups got ${groups.length}`);
  ok(groups.map(g=>g.category).sort().join(',') === 'Interiors,MEP', `wrong categories`);
  const sum = groups.reduce((s,g)=>s+g.tasks.reduce((t,x)=>t+x.amount_cents,0),0);
  ok(sum === 52000000, `scope task sum ${sum} !== 52000000`);
  ok(totalCents === 52000000, `returned totalCents ${totalCents}`);
}

// ── Contract backstop from slots ──
section('composeContractFromSlots (backstop) — schema-valid + Bug G/J');
{
  const slots = {
    'homeowner.name': 'John & Sarah Chen',
    'homeowner.address': '123 Oak St, Edison, NJ',
    'homeowner.phone': '(732) 555-0123',
    'homeowner.email': 'chen@example.com',
    'scope_categories': ['Interiors','MEP'],
    'payment.total_cents': 52000000,
    'timeline.start_date': '2026-08-01',
    'agreement_summary.months_to_complete': 5,
    'payment.method': 'wire',
  };
  const c = composeContractFromSlots(slots, { jobNo: 'CTR-2026-0001' });
  const parsed = ContractPayload.safeParse(c);
  ok(parsed.success, 'contract not schema-valid: ' + (parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0,4))));
  ok(c.homeowner.name === 'John & Sarah Chen', `homeowner name lost: ${c.homeowner.name}`);
  ok(c.payment.total_cents === 52000000, `total wrong ${c.payment.total_cents}`);
  const scopeSum = c.scope_of_work.groups.reduce((s,g)=>s+g.tasks.reduce((t,x)=>t+x.amount_cents,0),0);
  ok(scopeSum === c.payment.total_cents, `Bug J: scope sum ${scopeSum} != total ${c.payment.total_cents}`);
  ok(c.scope_of_work.total_cents === c.payment.total_cents, `scope.total_cents ${c.scope_of_work.total_cents} != total`);
  ok(c.timeline.start_date === '2026-08-01', `Bug G: start_date lost: ${c.timeline.start_date}`);
  ok(c.timeline.substantial_completion_date === '2027-01-01', `substantial date wrong: ${c.timeline.substantial_completion_date}`);
  ok(c.payment.labor_cost_cents + c.payment.materials_cost_cents === c.payment.total_cents, `labor+mat != total`);
  ok(c.payment.method === 'ach', `payment method map wire->ach failed: ${c.payment.method}`);
  ok(c.scope_of_work.groups.length === 2, `should have only 2 selected categories, got ${c.scope_of_work.groups.length}`);
  // canonical legal blocks preserved
  ok((c.contractor?.legal_name||'').includes('SUNVIC'), `contractor identity missing`);
  ok(!!c.right_to_cancel?.text, `right_to_cancel missing`);
}

// ── Contract reconciliation over a BROKEN LLM payload (Bug G/J repair) ──
section('reconcileContractWithSlots (repair broken LLM output)');
{
  const slots = {
    'homeowner.name': 'Maria Lopez',
    'scope_categories': ['Demolition & Foundation','Interiors','MEP'],
    'payment.total_cents': 30000000,
    'timeline.start_date': '2026-09-15',
  };
  // Simulate a bad LLM payload: wrong scope sum, null start_date, zero scope total
  const brokenLLM = composeContractFromSlots({ 'homeowner.name':'Maria Lopez' }); // minimal
  brokenLLM.scope_of_work.groups = [{ category:'Interiors', tasks:[{ task:'x', description:[], qty:'1', unit_price_cents: 92000000, amount_cents: 92000000 }] }];
  brokenLLM.payment.total_cents = 0;
  brokenLLM.timeline.start_date = null;
  const fixed = reconcileContractWithSlots(brokenLLM, slots);
  const parsed = ContractPayload.safeParse(fixed);
  ok(parsed.success, 'reconciled contract not valid: ' + (parsed.success?'':JSON.stringify(parsed.error.issues.slice(0,4))));
  ok(fixed.payment.total_cents === 30000000, `total not corrected: ${fixed.payment.total_cents}`);
  const scopeSum = fixed.scope_of_work.groups.reduce((s,g)=>s+g.tasks.reduce((t,x)=>t+x.amount_cents,0),0);
  ok(scopeSum === 30000000, `Bug J repair failed: scope sum ${scopeSum} != 30000000`);
  ok(fixed.timeline.start_date === '2026-09-15', `Bug G repair failed: ${fixed.timeline.start_date}`);
}

// ── Invoice backstop from slots + contract total ──
section('composeInvoiceFromSlots (backstop) — schema-valid + math');
{
  const slots = { 'linked_contract_id': 'CTR-2026-0001', 'milestone_label': 'Deposit', 'bill_to.recipient_email': 'chen@example.com' };
  const inv = composeInvoiceFromSlots(slots, { contractTotalCents: 52000000, contractRef: 'CTR-2026-0001', billTo: { client_name: 'John & Sarah Chen', property_address:'123 Oak St', recipient_email:'chen@example.com' } });
  const parsed = InvoicePayload.safeParse(inv);
  ok(parsed.success, 'invoice not schema-valid: ' + (parsed.success?'':JSON.stringify(parsed.error.issues.slice(0,4))));
  ok(inv.milestone.percent === 15, `deposit percent wrong: ${inv.milestone.percent}`);
  ok(inv.milestone.subtotal_cents === Math.round(52000000*0.15), `subtotal wrong: ${inv.milestone.subtotal_cents}`);
  ok(inv.totals.total_due_cents === inv.totals.subtotal_cents + inv.totals.tax_cents, `total_due != subtotal+tax`);
  ok(inv.tax.amount_cents === Math.round(inv.milestone.materials_portion_cents*6.625/100), `tax wrong`);
  ok(inv.contract.total_cents === 52000000, `contract total not carried`);
  ok(inv.bill_to.client_name === 'John & Sarah Chen', `bill_to lost`);
  const liSum = inv.line_items.reduce((s,x)=>s+x.amount_cents,0);
  ok(liSum === inv.milestone.subtotal_cents, `line items sum ${liSum} != subtotal`);
  ok(inv.status === 'draft', `status wrong ${inv.status}`);
}

// ── Invoice: Final milestone (5%) ──
section('invoice Final milestone');
{
  const inv = composeInvoiceFromSlots({ 'milestone_label':'Final' }, { contractTotalCents: 52000000 });
  ok(inv.milestone.percent === 5, `final percent wrong ${inv.milestone.percent}`);
  ok(inv.milestone.subtotal_cents === Math.round(52000000*0.05), `final subtotal wrong`);
}

console.log(`\n──────────\nPASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
