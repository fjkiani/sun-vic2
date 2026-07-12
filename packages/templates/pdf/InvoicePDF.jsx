// react-pdf template for Sunvic Invoice. Runs both in the browser preview (via BlobProvider)
// and in Netlify Functions (via renderToStream). Pure @react-pdf/renderer primitives — no DOM.

import React from 'react';
import { Document, Page, Text, View, Image } from '@react-pdf/renderer';
import { s } from './styles.js';
import { fmtUSD, fmtDate, phaseCost, phaseCostPerSqft, invoiceTotals } from '../format.js';

// eslint-disable-next-line react/prop-types
export function InvoicePDF({ payload, docNumber, logoUrl }) {
  const inv = payload || {};
  const contractor = inv.contractor || {};
  const billTo = inv.bill_to || {};
  const phases = (inv.phases || []).filter((p) => !p.excluded);
  const { subtotal, tax, total } = invoiceTotals(inv);
  const totalSqft = phases.reduce((s2, p) => s2 + (Number(p.sqft) || 0), 0);
  const invoiceNumber = inv.invoice_number || docNumber || '';

  return (
    <Document title={`Sunvic Invoice ${invoiceNumber}`} author="Sunvic Construction">
      {/* Page 1 — invoice */}
      <Page size="A4" style={s.page}>
        <View style={s.headerBar}>
          <View style={s.headerLeft}>
            {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
            <View style={s.companyBlock}>
              <Text style={s.companyName}>{contractor.legal_name || 'Sunvic, LLC Contractors'}</Text>
              <Text style={s.companyAddress}>{contractor.address}</Text>
              <Text style={s.companyMeta}>
                Licensed & Insured • {contractor.license_number} • {contractor.website} • {contractor.phone}
              </Text>
            </View>
          </View>
          <View>
            <Text style={s.bigTitle}>INVOICE</Text>
            <Text style={s.bigNumber}>#{invoiceNumber}</Text>
            <Text style={s.bigTagline}>Engineering Excellence in Every Project</Text>
          </View>
        </View>

        <View style={s.billToGrid}>
          <View style={s.billToLeft}>
            <Text style={s.sectionHeader}>Bill To</Text>
            <Text style={s.clientName}>{billTo.client_name || 'Client Name'}</Text>
            <Text style={s.clientAddress}>{billTo.client_address || ''}</Text>
          </View>
          <View style={s.billToRight}>
            <View style={s.labelValueRow}><Text style={s.label}>Date:</Text><Text style={s.value}>{fmtDate(inv.invoice_date)}</Text></View>
            <View style={s.labelValueRow}><Text style={s.label}>Due Date:</Text><Text style={s.value}>{fmtDate(inv.due_date)}</Text></View>
            <View style={s.labelValueRow}><Text style={s.label}>Project Ref:</Text><Text style={s.value}>{inv.project_ref || '—'}</Text></View>
            <View style={s.labelValueRow}><Text style={s.label}>Status:</Text><Text style={s.value}>{(inv.status || 'draft').toUpperCase()}</Text></View>
          </View>
        </View>

        {phases.map((p) => (
          <View key={p.id || p.title} style={s.phaseBlock}>
            <Text style={s.phaseTitle}>{p.title}</Text>
            {p.description ? <Text style={s.phaseDescription}>{p.description}</Text> : null}
            <View style={s.tableHead}>
              <Text style={[s.th, s.colDesc]}>Description</Text>
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
          </View>
        ))}

        <View style={s.totalsBlock}>
          <View style={s.totalRow}><Text style={s.totalLabel}>Subtotal</Text><Text style={s.totalValue}>{fmtUSD(subtotal)}</Text></View>
          <View style={s.totalRow}><Text style={s.totalLabel}>Tax ({inv.tax_rate_percent || 0}%)</Text><Text style={s.totalValue}>{fmtUSD(tax)}</Text></View>
          <View style={s.totalFinalRow}><Text style={s.totalFinalLabel}>Total</Text><Text style={s.totalFinalValue}>{fmtUSD(total)}</Text></View>
        </View>

        <View style={s.notesBlock}>
          <Text style={s.notesHeader}>Notes & Payment Terms</Text>
          <Text style={s.notesText}>{inv.notes}</Text>
        </View>

        <View style={s.warrantyBlock}>
          <Text style={s.warrantyTitle}>Our Commitment & Warranty</Text>
          <Text style={s.warrantyText}>
            Sunvic Construction stands behind all workmanship with a one-year warranty from substantial completion.
            We use high-quality materials from reputable suppliers and are fully licensed and insured in the state of
            New Jersey. Your peace of mind is our top priority.
          </Text>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            {contractor.legal_name} • Licensed & Insured • {contractor.license_number} • {contractor.website}
          </Text>
          <Text style={s.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* Page 2 — Project Cost Analysis & Market Comparison (optional) */}
      {inv.include_cost_analysis && phases.length > 0 && (
        <Page size="A4" style={s.page}>
          <View style={s.headerBar}>
            <View style={s.headerLeft}>
              {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
              <View style={s.companyBlock}>
                <Text style={s.companyName}>{contractor.legal_name}</Text>
              </View>
            </View>
            <View>
              <Text style={[s.bigTitle, { fontSize: 20 }]}>COST ANALYSIS</Text>
              <Text style={s.bigTagline}>Full-Transparency Estimate Breakdown</Text>
            </View>
          </View>

          <Text style={s.sectionTitle}>Phase-by-Phase Estimate Breakdown</Text>
          <View style={s.tableHead}>
            <Text style={[s.th, { width: '40%' }]}>Project Phase</Text>
            <Text style={[s.th, { width: '20%', textAlign: 'right' }]}>Phase Cost</Text>
            <Text style={[s.th, { width: '20%', textAlign: 'right' }]}>Approx. Sq. Ft.</Text>
            <Text style={[s.th, { width: '20%', textAlign: 'right' }]}>Cost / Sq. Ft.</Text>
          </View>
          {phases.map((p) => (
            <View key={`ca-${p.id || p.title}`} style={s.tableRow}>
              <Text style={[s.td, { width: '40%' }]}>{p.title}</Text>
              <Text style={[s.td, { width: '20%', textAlign: 'right' }]}>{fmtUSD(phaseCost(p))}</Text>
              <Text style={[s.td, { width: '20%', textAlign: 'right' }]}>{(p.sqft || 0).toLocaleString()}</Text>
              <Text style={[s.td, { width: '20%', textAlign: 'right' }]}>{fmtUSD(phaseCostPerSqft(p))}</Text>
            </View>
          ))}
          <View style={[s.tableRow, { backgroundColor: '#f3f4f6' }]}>
            <Text style={[s.td, { width: '40%', fontWeight: 700 }]}>Total Project</Text>
            <Text style={[s.td, { width: '20%', textAlign: 'right', fontWeight: 700 }]}>{fmtUSD(subtotal)}</Text>
            <Text style={[s.td, { width: '20%', textAlign: 'right', fontWeight: 700 }]}>{totalSqft.toLocaleString()}</Text>
            <Text style={[s.td, { width: '20%', textAlign: 'right', fontWeight: 700 }]}>
              {fmtUSD(totalSqft > 0 ? subtotal / totalSqft : 0)}
            </Text>
          </View>

          <View style={{ marginTop: 20 }}>
            <Text style={s.sectionTitle}>Market Context & Comparison</Text>
            <Text style={[s.notesText, { marginBottom: 8 }]}>
              For a home addition in New Jersey, homeowners can expect to pay between $176 and $328 per square foot.
              Full gut renovations start around $200 per square foot. Second-story additions range $200–$500 per square foot.
              Our blended rate falls competitively within this range.
            </Text>
            <Text style={[s.notesText, { marginBottom: 8 }]}>
              Your estimate reflects the specific complexities of the project, including structural work, MEP replacement,
              and high-quality finishes specified in the architectural plans.
            </Text>
            <Text style={s.notesText}>
              While comprehensive, our estimate is built on efficiency. Established supplier relationships and an experienced
              in-house team let us manage costs without compromising on the build.
            </Text>
          </View>

          <View style={s.footer} fixed>
            <Text style={s.footerText}>
              {contractor.legal_name} • {contractor.website} • {contractor.phone}
            </Text>
            <Text style={s.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}
    </Document>
  );
}
