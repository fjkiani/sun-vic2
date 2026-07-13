// Sunvic Invoice PDF — 2-page milestone invoice linked to a parent contract.
// Header shows contract ref + milestone; body itemises work covered; totals include NJ tax
// on materials portion only. Payment methods + 1-business-day terms clause borrowed from
// Section C of the master contract.

import React from 'react';
import { Document, Page, Text, View, Image } from '@react-pdf/renderer';
import { s, colors } from './styles.js';
import { fmtUSDFromCents, fmtDate, fmtDateShort } from '../format.js';

function PageChrome({ logoUrl, showWatermark = true }) {
  return (
    <>
      <View style={s.header} fixed>
        {logoUrl && <Image src={logoUrl} style={s.logoImg} />}
      </View>
      {logoUrl && showWatermark && (
        <Image src={logoUrl} style={s.watermark} fixed />
      )}
      <View style={s.footer} fixed>
        <Text style={s.footerLine}>Sunvic Contractors LLC</Text>
        <Text style={s.footerLine}>6 Stone Ridge Rd ,Old Bridge, NJ, 08857</Text>
        <Text style={s.footerLine}>+1 (732) 824-9203</Text>
        <Text
          style={s.footerPageNumber}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
        />
      </View>
    </>
  );
}

function SectionBar({ letter, title, suffix }) {
  return (
    <View style={s.sectionBar}>
      <Text style={s.sectionBarText}>
        {letter ? `${letter} - ${title}` : title}
        {suffix ? <Text style={s.sectionBarTextWithSuffix}>  {suffix}</Text> : null}
      </Text>
    </View>
  );
}

function InvoiceHeader({ payload }) {
  return (
    <View style={s.invHeaderRow}>
      <View style={s.invTitleCol}>
        <Text style={s.invBigTitle}>INVOICE</Text>
        <Text style={{ fontSize: 9, color: colors.GRAY_MUTED, marginTop: 6 }}>
          SUNVIC CONTRACTORS LLC · License #13VH12429600
        </Text>
        <Text style={{ fontSize: 9, marginTop: 2 }}>6 Stone Ridge Rd ,Old Bridge, NJ, 08857</Text>
        <Text style={{ fontSize: 9 }}>+1 (732) 824-9203  ·  Contact@sunvicnj.com</Text>
      </View>

      <View style={{ width: 240 }}>
        <View style={s.invMetaTable}>
          <View style={s.invMetaRow}>
            <Text style={s.invMetaLabel}>Invoice No.</Text>
            <Text style={s.invMetaValue}>{payload.invoice_number || ''}</Text>
          </View>
          <View style={s.invMetaRow}>
            <Text style={s.invMetaLabel}>Invoice Date</Text>
            <Text style={s.invMetaValue}>{fmtDate(payload.invoice_date)}</Text>
          </View>
          <View style={s.invMetaRow}>
            <Text style={s.invMetaLabel}>Due Date</Text>
            <Text style={s.invMetaValue}>{fmtDate(payload.due_date)}</Text>
          </View>
          <View style={s.invMetaRow}>
            <Text style={s.invMetaLabel}>Contract Ref.</Text>
            <Text style={s.invMetaValue}>{payload.contract_ref || ''}</Text>
          </View>
          <View style={s.invMetaRow}>
            <Text style={s.invMetaLabel}>Milestone</Text>
            <Text style={s.invMetaValue}>{payload.milestone_label || ''}</Text>
          </View>
          <View style={[s.invMetaRow, { borderBottomWidth: 0 }]}>
            <Text style={s.invMetaLabel}>Status</Text>
            <Text style={[s.invMetaValue, { textTransform: 'uppercase', fontWeight: 700 }]}>
              {payload.status || 'draft'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function BillToBlock({ payload }) {
  const b = payload.bill_to || {};
  return (
    <View style={s.billToBlock}>
      <Text style={s.billToLabel}>Bill To</Text>
      <Text style={s.billToName}>{b.client_name || '—'}</Text>
      {b.property_address ? <Text style={s.billToLine}>{b.property_address}</Text> : null}
      {b.recipient_email  ? <Text style={s.billToLine}>{b.recipient_email}</Text> : null}
      {b.recipient_phone  ? <Text style={s.billToLine}>{b.recipient_phone}</Text> : null}
    </View>
  );
}

function MilestoneSummaryBox({ payload }) {
  const cTotal = payload.contract?.total_cents || 0;
  const mPct = payload.milestone?.percent || 0;
  const mSub = payload.milestone?.subtotal_cents || 0;
  const labor = payload.milestone?.labor_portion_cents || 0;
  const mats  = payload.milestone?.materials_portion_cents || 0;

  return (
    <View style={{ marginTop: 12, borderWidth: 0.5, borderColor: '#000', backgroundColor: colors.ORANGE_LIGHT }}>
      <View style={[s.invMetaRow, { borderBottomWidth: 0.5, borderBottomColor: '#000' }]}>
        <Text style={[s.invMetaLabel, { backgroundColor: colors.GRAY_BAR, width: 160 }]}>
          Milestone
        </Text>
        <Text style={[s.invMetaValue, { fontWeight: 700 }]}>
          {payload.milestone_label} — {mPct}% of contract
        </Text>
      </View>
      <View style={[s.invMetaRow, { borderBottomWidth: 0.5, borderBottomColor: '#000' }]}>
        <Text style={[s.invMetaLabel, { backgroundColor: colors.GRAY_BAR, width: 160 }]}>
          Contract Total
        </Text>
        <Text style={s.invMetaValue}>{fmtUSDFromCents(cTotal)}</Text>
      </View>
      <View style={[s.invMetaRow, { borderBottomWidth: 0.5, borderBottomColor: '#000' }]}>
        <Text style={[s.invMetaLabel, { backgroundColor: colors.GRAY_BAR, width: 160 }]}>
          Milestone Amount
        </Text>
        <Text style={[s.invMetaValue, { fontWeight: 700 }]}>{fmtUSDFromCents(mSub)}</Text>
      </View>
      <View style={[s.invMetaRow, { borderBottomWidth: 0.5, borderBottomColor: '#000' }]}>
        <Text style={[s.invMetaLabel, { backgroundColor: colors.GRAY_BAR, width: 160 }]}>
          Labor Portion
        </Text>
        <Text style={s.invMetaValue}>{fmtUSDFromCents(labor)}</Text>
      </View>
      <View style={[s.invMetaRow, { borderBottomWidth: 0 }]}>
        <Text style={[s.invMetaLabel, { backgroundColor: colors.GRAY_BAR, width: 160 }]}>
          Materials Portion
        </Text>
        <Text style={s.invMetaValue}>{fmtUSDFromCents(mats)}</Text>
      </View>
      <View style={[s.invMetaRow, { borderBottomWidth: 0, backgroundColor: '#fff' }]}>
        <Text style={[s.invMetaLabel, { backgroundColor: '#fff', width: 160, fontSize: 8, color: colors.GRAY_MUTED, fontWeight: 400 }]}>
          Due condition
        </Text>
        <Text style={[s.invMetaValue, { fontSize: 8, color: colors.GRAY_MUTED }]}>
          {payload.milestone_condition || ''}
        </Text>
      </View>
    </View>
  );
}

function LineItemsTable({ payload }) {
  const items = payload.line_items || [];
  return (
    <>
      <SectionBar title="WORK COMPLETED IN THIS MILESTONE" />
      <View style={s.invLineTable}>
        <View style={s.invLineHeader}>
          <Text style={[s.invLineHeaderCell, s.invColDesc]}>Description</Text>
          <Text style={[s.invLineHeaderCell, s.invColQty]}>Qty</Text>
          <Text style={[s.invLineHeaderCell, s.invColRate]}>Rate</Text>
          <Text style={[s.invLineHeaderCell, s.invColAmount, { borderRightWidth: 0 }]}>Amount</Text>
        </View>
        {items.map((li, i) => (
          <View key={i} style={s.invLineRow}>
            <Text style={[s.invLineCell, s.invColDesc]}>{li.desc}</Text>
            <Text style={[s.invLineCell, s.invColQty]}>{li.qty}</Text>
            <Text style={[s.invLineCell, s.invColRate]}>{fmtUSDFromCents(li.rate_cents)}</Text>
            <Text style={[s.invLineCell, s.invColAmount, { borderRightWidth: 0 }]}>
              {fmtUSDFromCents(li.amount_cents)}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}

function TotalsBlock({ payload }) {
  const t = payload.totals || {};
  return (
    <View style={s.invTotalsBlock} wrap={false}>
      <View style={s.invTotalRow}>
        <Text style={s.invTotalLabel}>Subtotal</Text>
        <Text style={s.invTotalValue}>{fmtUSDFromCents(t.subtotal_cents)}</Text>
      </View>
      <View style={s.invTotalRow}>
        <Text style={s.invTotalLabel}>
          NJ Sales Tax ({payload.tax?.rate_percent}% on {payload.tax?.applies_to === 'materials_only' ? 'materials' : 'total'})
        </Text>
        <Text style={s.invTotalValue}>{fmtUSDFromCents(t.tax_cents)}</Text>
      </View>
      <View style={s.invGrandRow}>
        <Text style={s.invGrandLabel}>Total Due</Text>
        <Text style={s.invGrandValue}>{fmtUSDFromCents(t.total_due_cents)}</Text>
      </View>
    </View>
  );
}

function PriorPaymentsBlock({ payload }) {
  const priors = payload.prior_payments || [];
  const priorSum = priors.reduce((s, p) => s + (p.amount_cents || 0), 0);
  if (!priors.length) return null;
  return (
    <>
      <SectionBar title="PAYMENTS RECEIVED TO DATE" />
      <View style={s.invLineTable}>
        <View style={s.invLineHeader}>
          <Text style={[s.invLineHeaderCell, s.invColDesc]}>Milestone</Text>
          <Text style={[s.invLineHeaderCell, { width: 90, borderRightWidth: 0.5, borderRightColor: '#000' }]}>Date</Text>
          <Text style={[s.invLineHeaderCell, s.invColAmount, { borderRightWidth: 0 }]}>Amount</Text>
        </View>
        {priors.map((p, i) => (
          <View key={i} style={s.invLineRow}>
            <Text style={[s.invLineCell, s.invColDesc]}>{p.label}</Text>
            <Text style={[s.invLineCell, { width: 90, borderRightWidth: 0.5, borderRightColor: '#000' }]}>
              {fmtDateShort(p.date)}
            </Text>
            <Text style={[s.invLineCell, s.invColAmount, { borderRightWidth: 0 }]}>
              {fmtUSDFromCents(p.amount_cents)}
            </Text>
          </View>
        ))}
        <View style={[s.invLineRow, { backgroundColor: colors.GRAY_SUB, borderBottomWidth: 0 }]}>
          <Text style={[s.invLineCell, s.invColDesc, { fontWeight: 700 }]}>Total received prior to this invoice</Text>
          <Text style={[s.invLineCell, { width: 90, borderRightWidth: 0.5, borderRightColor: '#000' }]}> </Text>
          <Text style={[s.invLineCell, s.invColAmount, { fontWeight: 700, borderRightWidth: 0 }]}>
            {fmtUSDFromCents(priorSum)}
          </Text>
        </View>
      </View>
    </>
  );
}

function PaymentMethodsBlock({ payload }) {
  const methods = payload.payment_methods || [];
  return (
    <>
      <SectionBar title="ACCEPTED PAYMENT METHODS" />
      {methods.map((m, i) => (
        <View key={i} style={s.bulletRow}>
          <Text style={s.bulletDot}>−</Text>
          <Text style={s.bulletText}>{m}</Text>
        </View>
      ))}
      <Text style={[s.paraTight, { marginTop: 8 }]}>{payload.invoice_terms?.text || ''}</Text>
    </>
  );
}

// ── Root ─────────────────────────────────────────────────────
export function InvoicePDF({ payload, logoUrl }) {
  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <PageChrome logoUrl={logoUrl} />
        <InvoiceHeader payload={payload} />
        <BillToBlock payload={payload} />
        <MilestoneSummaryBox payload={payload} />
        <LineItemsTable payload={payload} />
        <TotalsBlock payload={payload} />
      </Page>

      <Page size="LETTER" style={s.page}>
        <PageChrome logoUrl={logoUrl} />
        <View style={{ marginTop: 20 }}>
          <PriorPaymentsBlock payload={payload} />
          <PaymentMethodsBlock payload={payload} />

          {/* Remaining balance summary */}
          {payload.contract?.total_cents ? (
            <View style={{ marginTop: 16, borderWidth: 0.5, borderColor: '#000' }}>
              <View style={[s.invMetaRow, { borderBottomWidth: 0.5, borderBottomColor: '#000' }]}>
                <Text style={[s.invMetaLabel, { backgroundColor: colors.GRAY_BAR, width: 220 }]}>
                  Contract Total
                </Text>
                <Text style={s.invMetaValue}>{fmtUSDFromCents(payload.contract.total_cents)}</Text>
              </View>
              <View style={[s.invMetaRow, { borderBottomWidth: 0.5, borderBottomColor: '#000' }]}>
                <Text style={[s.invMetaLabel, { backgroundColor: colors.GRAY_BAR, width: 220 }]}>
                  Paid prior to this invoice
                </Text>
                <Text style={s.invMetaValue}>
                  −{fmtUSDFromCents((payload.prior_payments || []).reduce((s, p) => s + (p.amount_cents || 0), 0))}
                </Text>
              </View>
              <View style={[s.invMetaRow, { borderBottomWidth: 0.5, borderBottomColor: '#000' }]}>
                <Text style={[s.invMetaLabel, { backgroundColor: colors.GRAY_BAR, width: 220 }]}>
                  This invoice (Total Due)
                </Text>
                <Text style={[s.invMetaValue, { fontWeight: 700 }]}>−{fmtUSDFromCents(payload.totals?.total_due_cents || 0)}</Text>
              </View>
              <View style={[s.invMetaRow, { borderBottomWidth: 0 }]}>
                <Text style={[s.invMetaLabel, { backgroundColor: colors.ORANGE_LIGHT, width: 220, fontWeight: 700 }]}>
                  Contract balance after this invoice
                </Text>
                <Text style={[s.invMetaValue, { fontWeight: 700 }]}>
                  {fmtUSDFromCents(payload.totals?.remaining_after_cents || 0)}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      </Page>
    </Document>
  );
}

export default InvoicePDF;
