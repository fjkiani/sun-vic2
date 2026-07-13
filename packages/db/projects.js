// CRUD helpers for the `projects` table (server-side).
//
// A project groups a homeowner + property. Documents (contracts, invoices) can
// belong to a project via documents.project_id. Row-level security enforces
// owner-only access; these helpers use the service-role client and always pass
// the created_by check explicitly for defense in depth.

import { serviceClient } from './supabase.js';

export async function listProjects(userId, opts = {}) {
  const svc = serviceClient();
  let q = svc
    .from('projects')
    .select('id, name, homeowner_name, homeowner_email, property_address, status, contract_total_cents, created_at, updated_at')
    .eq('created_by', userId)
    .order('updated_at', { ascending: false });
  if (opts.status) q = q.eq('status', opts.status);
  if (opts.q) q = q.or(`name.ilike.%${opts.q}%,homeowner_name.ilike.%${opts.q}%,property_address.ilike.%${opts.q}%`);
  const { data, error } = await q.limit(opts.limit || 200);
  if (error) throw new Error(`listProjects: ${error.message}`);
  return data || [];
}

export async function getProject(userId, id) {
  const svc = serviceClient();
  const { data, error } = await svc
    .from('projects')
    .select('*')
    .eq('id', id)
    .eq('created_by', userId)
    .maybeSingle();
  if (error) throw new Error(`getProject: ${error.message}`);
  return data || null;
}

export async function createProject(userId, patch) {
  const svc = serviceClient();
  const row = {
    name: (patch.name || '').trim() || 'Untitled project',
    homeowner_name: patch.homeowner_name || null,
    homeowner_email: patch.homeowner_email || null,
    homeowner_phone: patch.homeowner_phone || null,
    property_address: patch.property_address || null,
    status: patch.status || 'active',
    contract_total_cents: patch.contract_total_cents ?? 0,
    notes: patch.notes || null,
    created_by: userId,
  };
  const { data, error } = await svc.from('projects').insert(row).select('*').single();
  if (error) throw new Error(`createProject: ${error.message}`);
  return data;
}

export async function updateProject(userId, id, patch) {
  const svc = serviceClient();
  const updates = {};
  for (const k of ['name','homeowner_name','homeowner_email','homeowner_phone','property_address','status','notes','contract_total_cents']) {
    if (patch[k] !== undefined) updates[k] = patch[k];
  }
  if (Object.keys(updates).length === 0) {
    return getProject(userId, id);
  }
  const { data, error } = await svc
    .from('projects')
    .update(updates)
    .eq('id', id)
    .eq('created_by', userId)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`updateProject: ${error.message}`);
  return data;
}

// Aggregate project stats: documents by template+status, money in vs out, milestone timeline.
export async function getProjectSummary(userId, id) {
  const svc = serviceClient();
  // Ownership check via getProject
  const project = await getProject(userId, id);
  if (!project) return null;
  const { data: docs, error: dErr } = await svc
    .from('documents')
    .select('id, doc_number, template, status, title, total_cents, updated_at, created_at, payload, pdf_generated_at')
    .eq('created_by', userId)
    .eq('project_id', id)
    .order('created_at', { ascending: true });
  if (dErr) throw new Error(`getProjectSummary: ${dErr.message}`);
  const documents = docs || [];

  // ── Aggregate by template
  const contracts = documents.filter((d) => d.template === 'contract');
  const invoices  = documents.filter((d) => d.template === 'invoice');

  // Contract total (sum of latest contract's total_cents — usually just one; if multiple, use the newest)
  const latestContract = contracts.length > 0 ? contracts[contracts.length - 1] : null;
  const contractTotal = latestContract ? Number(latestContract.total_cents) || 0 : 0;

  // Money in = sum of paid invoices' total_cents
  // Money billed = sum of sent+signed+overdue invoice total_cents
  // Money outstanding = billed - paid
  let paid = 0;
  let billed = 0;
  for (const inv of invoices) {
    const t = Number(inv.total_cents) || 0;
    if (inv.status === 'paid') paid += t;
    if (['sent','signed','overdue','paid'].includes(inv.status)) billed += t;
  }
  const outstanding = Math.max(0, billed - paid);
  const remaining = Math.max(0, contractTotal - paid);

  // ── Pipeline buckets (kanban)
  const pipeline = {
    contracts: {
      draft:    contracts.filter((d) => d.status === 'draft'),
      sent:     contracts.filter((d) => d.status === 'sent'),
      signed:   contracts.filter((d) => d.status === 'signed'),
      void:     contracts.filter((d) => d.status === 'void'),
    },
    invoices: {
      draft:    invoices.filter((d) => d.status === 'draft'),
      sent:     invoices.filter((d) => d.status === 'sent'),
      paid:     invoices.filter((d) => d.status === 'paid'),
      overdue:  invoices.filter((d) => d.status === 'overdue'),
    },
  };

  // ── Timeline / milestones
  // For the latest contract, pull the payment.schedule and align each milestone with any invoice.
  const milestones = [];
  if (latestContract?.payload?.payment?.schedule) {
    const sched = latestContract.payload.payment.schedule || [];
    for (const m of sched) {
      const inv = invoices.find((i) => (i.payload?.milestone_label || '').trim() === (m.milestone || '').trim());
      milestones.push({
        milestone: m.milestone || '',
        percent: Number(m.percent) || 0,
        condition: m.condition || '',
        amount_cents: Math.round(contractTotal * (Number(m.percent) || 0) / 100),
        invoice: inv ? { id: inv.id, doc_number: inv.doc_number, status: inv.status, total_cents: inv.total_cents } : null,
      });
    }
  }

  // ── Money-over-time series for chart (cumulative billed vs paid, grouped by month)
  const byMonth = {};
  for (const inv of invoices) {
    const dateStr = inv.payload?.invoice_date || inv.created_at?.slice(0, 10);
    if (!dateStr) continue;
    const month = dateStr.slice(0, 7); // YYYY-MM
    if (!byMonth[month]) byMonth[month] = { month, billed_cents: 0, paid_cents: 0 };
    const t = Number(inv.total_cents) || 0;
    if (['sent','signed','overdue','paid'].includes(inv.status)) byMonth[month].billed_cents += t;
    if (inv.status === 'paid') byMonth[month].paid_cents += t;
  }
  const series = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));

  return {
    project,
    documents,
    money: {
      contract_total_cents: contractTotal,
      billed_cents: billed,
      paid_cents: paid,
      outstanding_cents: outstanding,
      remaining_cents: remaining,
    },
    pipeline,
    milestones,
    series,
    latest_contract_id: latestContract?.id || null,
  };
}

// ── Idempotent "find or create" — called from the documents create endpoint so
// every new document lands under a project. Matches on (created_by, homeowner_email)
// or (created_by, homeowner_name+property_address).
export async function findOrCreateProjectForDocument(userId, payload, template) {
  const svc = serviceClient();
  const homeownerName = template === 'invoice'
    ? (payload?.bill_to?.client_name || '')
    : (payload?.homeowner?.name || '');
  const homeownerEmail = template === 'invoice'
    ? (payload?.bill_to?.recipient_email || '')
    : (payload?.homeowner?.email || '');
  const propertyAddress = template === 'invoice'
    ? (payload?.bill_to?.property_address || '')
    : (payload?.homeowner?.address || '');
  const homeownerPhone = template === 'invoice'
    ? (payload?.bill_to?.recipient_phone || '')
    : (payload?.homeowner?.phone || '');

  const key = [homeownerName, homeownerEmail, propertyAddress].filter(Boolean).join('|').trim();
  if (!key) {
    // no identifying info — create an ad-hoc project
    return createProject(userId, {
      name: 'Untitled project',
      homeowner_name: homeownerName || null,
      homeowner_email: homeownerEmail || null,
      homeowner_phone: homeownerPhone || null,
      property_address: propertyAddress || null,
    });
  }

  // Try to find an existing project by email OR by name+address
  let match = null;
  if (homeownerEmail) {
    const { data, error } = await svc
      .from('projects')
      .select('*')
      .eq('created_by', userId)
      .eq('homeowner_email', homeownerEmail)
      .limit(1);
    if (error) throw new Error(`findOrCreateProjectForDocument (email): ${error.message}`);
    match = data?.[0] || null;
  }
  if (!match && (homeownerName || propertyAddress)) {
    let q = svc.from('projects').select('*').eq('created_by', userId);
    if (homeownerName) q = q.eq('homeowner_name', homeownerName);
    if (propertyAddress) q = q.eq('property_address', propertyAddress);
    const { data, error } = await q.limit(1);
    if (error) throw new Error(`findOrCreateProjectForDocument (name+addr): ${error.message}`);
    match = data?.[0] || null;
  }
  if (match) return match;

  const projectName = propertyAddress || homeownerName || 'Untitled project';
  return createProject(userId, {
    name: projectName,
    homeowner_name: homeownerName || null,
    homeowner_email: homeownerEmail || null,
    homeowner_phone: homeownerPhone || null,
    property_address: propertyAddress || null,
  });
}
