// react-pdf template for the 10-page Sunvic Home Improvement Contract.
// Mirrors sections A–J of the reference PDF. Legal blocks (warranties/permits/insurance/
// dispute resolution/right-to-cancel) pull from the payload — which was pre-populated from
// packages/templates/legal.js on creation. Locking is enforced upstream, not here.

import React from 'react';
import { Document, Page, Text, View, Image } from '@react-pdf/renderer';
import { s } from './styles.js';
import { fmtUSD, fmtDate, phaseCost, contractTotals } from '../format.js';

function SectionHeader({ letter, title }) {
  return (
    <View style={{ backgroundColor: '#f97316', paddingVertical: 4, paddingHorizontal: 8, marginTop: 12, marginBottom: 8 }}>
      <Text style={{ color: 'white', fontSize: 11, fontWeight: 800 }}>
        {letter}. {title.toUpperCase()}
      </Text>
    </View>
  );
}

function Footer({ contractor }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>
        {contractor.legal_name} • Licensed & Insured • {contractor.license_number} • {contractor.website}
      </Text>
      <Text style={s.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

// eslint-disable-next-line react/prop-types
export function ContractPDF({ payload, docNumber, logoUrl }) {
  const c = payload || {};
  const contractor = c.contractor || {};
  const homeowner  = c.homeowner || {};
  const phases     = c.scope_of_work?.phases || [];
  const payment    = c.payment || {};
  const timeline   = c.timeline || {};
  const signatures = c.signatures || {};
  const { subtotal, total } = contractTotals(c);
  const scheduleTotal = total || (Number(payment.total_cents) || 0) / 100;

  return (
    <Document title={`Sunvic Contract ${docNumber || ''}`} author="Sunvic Construction">
      {/* ─────────── PAGE 1 — Cover + Section A ─────────── */}
      <Page size="A4" style={s.page}>
        <View style={s.headerBar}>
          <View style={s.headerLeft}>
            {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
            <View style={s.companyBlock}>
              <Text style={s.companyName}>{contractor.legal_name}</Text>
              <Text style={s.companyAddress}>{contractor.address}</Text>
              <Text style={s.companyMeta}>
                Licensed & Insured • {contractor.license_number} • {contractor.website} • {contractor.phone}
              </Text>
            </View>
          </View>
          <View>
            <Text style={[s.bigTitle, { fontSize: 24 }]}>HOME IMPROVEMENT</Text>
            <Text style={[s.bigTitle, { fontSize: 24 }]}>CONTRACT</Text>
            <Text style={s.bigNumber}>#{docNumber || ''}</Text>
            <Text style={s.bigTagline}>State of New Jersey • N.J.S.A. 56:8-136</Text>
          </View>
        </View>

        <Text style={s.notesText}>{c.agreement_summary}</Text>

        <SectionHeader letter="A" title="Contractor Information" />
        <View style={s.labelValueRow}><Text style={s.label}>Legal Name:</Text><Text style={s.value}>{contractor.legal_name}</Text></View>
        <View style={s.labelValueRow}><Text style={s.label}>Address:</Text><Text style={s.value}>{contractor.address}</Text></View>
        <View style={s.labelValueRow}><Text style={s.label}>Phone:</Text><Text style={s.value}>{contractor.phone}</Text></View>
        <View style={s.labelValueRow}><Text style={s.label}>Email:</Text><Text style={s.value}>{contractor.email}</Text></View>
        <View style={s.labelValueRow}><Text style={s.label}>NJ License #:</Text><Text style={s.value}>{contractor.license_number}</Text></View>
        <View style={s.labelValueRow}><Text style={s.label}>Website:</Text><Text style={s.value}>{contractor.website}</Text></View>

        <SectionHeader letter="B" title="Homeowner Information" />
        <View style={s.labelValueRow}><Text style={s.label}>Name:</Text><Text style={s.value}>{homeowner.name || '—'}</Text></View>
        <View style={s.labelValueRow}><Text style={s.label}>Property Address:</Text><Text style={s.value}>{homeowner.address || '—'}</Text></View>
        <View style={s.labelValueRow}><Text style={s.label}>Phone:</Text><Text style={s.value}>{homeowner.phone || '—'}</Text></View>
        <View style={s.labelValueRow}><Text style={s.label}>Email:</Text><Text style={s.value}>{homeowner.email || '—'}</Text></View>

        <SectionHeader letter="C" title="Contract Type" />
        <Text style={s.notesText}>
          This is a{' '}
          <Text style={{ fontWeight: 700 }}>
            {c.contract_type === 'home_improvement' ? 'Home Improvement Contract' :
              c.contract_type === 'new_construction' ? 'New Construction Contract' : 'Repair Contract'}
          </Text>{' '}
          entered into under the New Jersey Home Improvement Contract Act.
        </Text>

        <Footer contractor={contractor} />
      </Page>

      {/* ─────────── PAGE 2 — Section D: Scope of Work ─────────── */}
      <Page size="A4" style={s.page}>
        <View style={s.headerBar}>
          <View style={s.headerLeft}>
            {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
            <View style={s.companyBlock}>
              <Text style={s.companyName}>{contractor.legal_name}</Text>
              <Text style={s.companyAddress}>Contract #{docNumber || ''}</Text>
            </View>
          </View>
        </View>

        <SectionHeader letter="D" title="Scope of Work" />
        {phases.length === 0 ? (
          <Text style={s.notesText}>No project phases defined yet.</Text>
        ) : (
          phases.map((p) => (
            <View key={p.id || p.title} style={s.phaseBlock} wrap={false}>
              <Text style={s.phaseTitle}>{p.title}</Text>
              {p.description ? <Text style={s.phaseDescription}>{p.description}</Text> : null}
              <View style={s.tableHead}>
                <Text style={[s.th, s.colDesc]}>Task</Text>
                <Text style={[s.th, s.colQty]}>Qty</Text>
                <Text style={[s.th, s.colRate]}>Rate</Text>
                <Text style={[s.th, s.colAmount]}>Amount</Text>
              </View>
              {(p.items || []).map((it, i) => (
                <View key={i} style={s.tableRow}>
                  <View style={s.colDesc}>
                    <Text style={[s.td, { fontWeight: 700, color: '#111827' }]}>{it.desc || '—'}</Text>
                    {it.details ? <Text style={[s.td, { color: '#6b7280', fontSize: 8, marginTop: 1 }]}>{it.details}</Text> : null}
                  </View>
                  <Text style={[s.td, s.colQty]}>{it.qty}</Text>
                  <Text style={[s.td, s.colRate]}>{fmtUSD(it.rate)}</Text>
                  <Text style={[s.td, s.colAmount, { fontWeight: 700, color: '#111827' }]}>
                    {fmtUSD((Number(it.qty) || 0) * (Number(it.rate) || 0))}
                  </Text>
                </View>
              ))}
              <View style={[s.tableRow, { backgroundColor: '#fff7ed' }]}>
                <Text style={[s.td, s.colDesc, { fontWeight: 700 }]}>Phase subtotal</Text>
                <Text style={[s.td, s.colQty]}></Text>
                <Text style={[s.td, s.colRate]}></Text>
                <Text style={[s.td, s.colAmount, { fontWeight: 700, color: '#f97316' }]}>{fmtUSD(phaseCost(p))}</Text>
              </View>
            </View>
          ))
        )}

        <View style={s.totalsBlock}>
          <View style={s.totalFinalRow}>
            <Text style={s.totalFinalLabel}>Contract Total</Text>
            <Text style={s.totalFinalValue}>{fmtUSD(subtotal)}</Text>
          </View>
        </View>

        <Footer contractor={contractor} />
      </Page>

      {/* ─────────── PAGE 3 — Section E: Payment Terms ─────────── */}
      <Page size="A4" style={s.page}>
        <View style={s.headerBar}>
          <View style={s.headerLeft}>
            {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
            <View style={s.companyBlock}>
              <Text style={s.companyName}>{contractor.legal_name}</Text>
              <Text style={s.companyAddress}>Contract #{docNumber || ''}</Text>
            </View>
          </View>
        </View>

        <SectionHeader letter="E" title="Payment Terms & Schedule" />
        <Text style={s.notesText}>
          The Homeowner agrees to pay the total contract price of{' '}
          <Text style={{ fontWeight: 700 }}>{fmtUSD(scheduleTotal)}</Text>
          {' '}on the following milestone-based schedule. Payment method: {payment.method || 'check'}.
        </Text>

        <View style={[s.tableHead, { marginTop: 8 }]}>
          <Text style={[s.th, { width: '65%' }]}>Milestone</Text>
          <Text style={[s.th, { width: '15%', textAlign: 'right' }]}>%</Text>
          <Text style={[s.th, { width: '20%', textAlign: 'right' }]}>Amount</Text>
        </View>
        {(payment.schedule || []).map((m, i) => (
          <View key={i} style={s.scheduleRow}>
            <Text style={s.scheduleMs}>{m.milestone}</Text>
            <Text style={s.schedulePct}>{m.percent}%</Text>
            <Text style={s.scheduleAmt}>{fmtUSD((scheduleTotal * m.percent) / 100)}</Text>
          </View>
        ))}
        <View style={[s.scheduleRow, { borderBottomWidth: 2, borderBottomColor: '#f97316' }]}>
          <Text style={[s.scheduleMs, { fontWeight: 800, color: '#111827' }]}>Total</Text>
          <Text style={[s.schedulePct, { fontWeight: 800, color: '#111827' }]}>
            {(payment.schedule || []).reduce((sum, m) => sum + m.percent, 0)}%
          </Text>
          <Text style={[s.scheduleAmt, { color: '#f97316' }]}>{fmtUSD(scheduleTotal)}</Text>
        </View>
        {payment.notes ? (
          <View style={s.notesBlock}><Text style={s.notesText}>{payment.notes}</Text></View>
        ) : null}

        <Footer contractor={contractor} />
      </Page>

      {/* ─────────── PAGE 4 — Section F: Timeline ─────────── */}
      <Page size="A4" style={s.page}>
        <View style={s.headerBar}>
          <View style={s.headerLeft}>
            {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
            <View style={s.companyBlock}>
              <Text style={s.companyName}>{contractor.legal_name}</Text>
              <Text style={s.companyAddress}>Contract #{docNumber || ''}</Text>
            </View>
          </View>
        </View>

        <SectionHeader letter="F" title="Timeline" />
        <View style={s.labelValueRow}><Text style={s.label}>Start Date:</Text><Text style={s.value}>{fmtDate(timeline.start_date)}</Text></View>
        <View style={s.labelValueRow}><Text style={s.label}>Substantial Completion:</Text><Text style={s.value}>{fmtDate(timeline.substantial_completion_date)}</Text></View>
        <View style={s.labelValueRow}><Text style={s.label}>Final Completion:</Text><Text style={s.value}>{fmtDate(timeline.final_completion_date)}</Text></View>
        <Text style={[s.notesText, { marginTop: 10 }]}>
          Timeline dates are estimates and may shift due to permits, inspections, weather, or Homeowner-directed changes.
          The Contractor will keep the Homeowner informed of any material changes to the schedule in writing.
        </Text>

        <Footer contractor={contractor} />
      </Page>

      {/* ─────────── PAGE 5 — Section G: Warranties ─────────── */}
      <Page size="A4" style={s.page}>
        <View style={s.headerBar}>
          <View style={s.headerLeft}>
            {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
            <View style={s.companyBlock}>
              <Text style={s.companyName}>{contractor.legal_name}</Text>
              <Text style={s.companyAddress}>Contract #{docNumber || ''}</Text>
            </View>
          </View>
        </View>
        <SectionHeader letter="G" title="Warranties" />
        <Text style={s.legalText}>{c.warranties?.text}</Text>
        <Footer contractor={contractor} />
      </Page>

      {/* ─────────── PAGE 6 — Section H: Permits ─────────── */}
      <Page size="A4" style={s.page}>
        <View style={s.headerBar}>
          <View style={s.headerLeft}>
            {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
            <View style={s.companyBlock}>
              <Text style={s.companyName}>{contractor.legal_name}</Text>
              <Text style={s.companyAddress}>Contract #{docNumber || ''}</Text>
            </View>
          </View>
        </View>
        <SectionHeader letter="H" title="Permits" />
        <Text style={s.legalText}>{c.permits?.text}</Text>
        <Footer contractor={contractor} />
      </Page>

      {/* ─────────── PAGE 7 — Section I: Insurance ─────────── */}
      <Page size="A4" style={s.page}>
        <View style={s.headerBar}>
          <View style={s.headerLeft}>
            {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
            <View style={s.companyBlock}>
              <Text style={s.companyName}>{contractor.legal_name}</Text>
              <Text style={s.companyAddress}>Contract #{docNumber || ''}</Text>
            </View>
          </View>
        </View>
        <SectionHeader letter="I" title="Insurance" />
        <Text style={s.legalText}>{c.insurance?.text}</Text>
        <Footer contractor={contractor} />
      </Page>

      {/* ─────────── PAGE 8 — Dispute Resolution ─────────── */}
      <Page size="A4" style={s.page}>
        <View style={s.headerBar}>
          <View style={s.headerLeft}>
            {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
            <View style={s.companyBlock}>
              <Text style={s.companyName}>{contractor.legal_name}</Text>
              <Text style={s.companyAddress}>Contract #{docNumber || ''}</Text>
            </View>
          </View>
        </View>
        <SectionHeader letter="J" title="Dispute Resolution" />
        <Text style={s.legalText}>{c.dispute_resolution?.text}</Text>
        <Footer contractor={contractor} />
      </Page>

      {/* ─────────── PAGE 9 — Right to Cancel ─────────── */}
      <Page size="A4" style={s.page}>
        <View style={s.headerBar}>
          <View style={s.headerLeft}>
            {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
            <View style={s.companyBlock}>
              <Text style={s.companyName}>{contractor.legal_name}</Text>
              <Text style={s.companyAddress}>Contract #{docNumber || ''}</Text>
            </View>
          </View>
        </View>
        <SectionHeader letter="K" title="Homeowner Right to Cancel" />
        <Text style={s.legalText}>{c.right_to_cancel?.text}</Text>
        <Footer contractor={contractor} />
      </Page>

      {/* ─────────── PAGE 10 — Signatures ─────────── */}
      <Page size="A4" style={s.page}>
        <View style={s.headerBar}>
          <View style={s.headerLeft}>
            {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
            <View style={s.companyBlock}>
              <Text style={s.companyName}>{contractor.legal_name}</Text>
              <Text style={s.companyAddress}>Contract #{docNumber || ''}</Text>
            </View>
          </View>
        </View>
        <SectionHeader letter="L" title="Signatures" />
        <Text style={s.notesText}>
          By signing below, the parties agree to be bound by all terms and conditions in this Agreement.
          Homeowner acknowledges receipt of the Three-Day Right to Cancel notice on the preceding page.
        </Text>
        <View style={s.signatureGrid}>
          <View style={s.signatureBox}>
            <Text style={s.signatureLabel}>Contractor Representative</Text>
            <Text style={s.signatureMeta}>{signatures.contractor?.signer_name || contractor.legal_name}</Text>
            <Text style={s.signatureMeta}>{signatures.contractor?.signed_at ? `Signed: ${fmtDate(signatures.contractor.signed_at)}` : 'Signed: __________________'}</Text>
          </View>
          <View style={s.signatureBox}>
            <Text style={s.signatureLabel}>Homeowner</Text>
            <Text style={s.signatureMeta}>{signatures.homeowner?.signer_name || homeowner.name || '—'}</Text>
            <Text style={s.signatureMeta}>{signatures.homeowner?.signed_at ? `Signed: ${fmtDate(signatures.homeowner.signed_at)}` : 'Signed: __________________'}</Text>
          </View>
        </View>
        <Footer contractor={contractor} />
      </Page>
    </Document>
  );
}
