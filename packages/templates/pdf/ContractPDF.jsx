// Sunvic 10-page NJ Home Improvement Contract — mirrors the sample PDF page-for-page.
// Sections: Cover, A (Agreement Background), B (Scope of Work), C (Payment Terms),
// D (Timeline), E (Warranties), F (Permits), G (Insurance), H (Dispute Resolution),
// I (Right to Cancel), J (Signature).

import React from 'react';
import { Document, Page, Text, View, Image } from '@react-pdf/renderer';
import { s, colors } from './styles.js';
import { fmtUSDFromCents, milestoneAmountCents } from '../format.js';

// ── Page decorations ──────────────────────────────────────────
function PageChrome({ logoUrl, showWatermark = true, showSigStub = true, pageNumber, totalPages }) {
  return (
    <>
      {/* Top-left small logo + wordmark */}
      <View style={s.header} fixed>
        {logoUrl && <Image src={logoUrl} style={s.logoImg} />}
      </View>

      {/* Center watermark (light) */}
      {logoUrl && showWatermark && (
        <Image src={logoUrl} style={s.watermark} fixed />
      )}

      {/* Signature stub above footer (omitted on cover page) */}
      {showSigStub && (
        <View style={s.sigStub} fixed>
          <Text style={s.sigStubLine}>Homeowner Signature: _______________________________</Text>
          <Text style={s.sigStubLine}>Contractor Signature: ________________________________</Text>
        </View>
      )}

      {/* Footer */}
      <View style={s.footer} fixed>
        <Text style={s.footerLine}>Sunvic Contractors LLC</Text>
        <Text style={s.footerLine}>6 Stone Ridge Rd ,Old Bridge, NJ, 08857</Text>
        <Text style={s.footerLine}>+1 (732) 824-9203</Text>
        <Text
          style={s.footerPageNumber}
          render={({ pageNumber: pn, totalPages: tp }) => `Page ${pn} / ${tp}`}
        />
      </View>
    </>
  );
}

function SectionBar({ letter, title, suffix }) {
  return (
    <View style={s.sectionBar}>
      <Text style={s.sectionBarText}>
        {letter} - {title}
        {suffix ? <Text style={s.sectionBarTextWithSuffix}>  {suffix}</Text> : null}
      </Text>
    </View>
  );
}

function SubBar({ text }) {
  return (
    <View style={s.subBar}>
      <Text style={s.subBarText}>{text}</Text>
    </View>
  );
}

function KVRow({ label, value, isLink }) {
  return (
    <View style={s.kvRow}>
      <Text style={s.kvLabel}>{label}</Text>
      <Text style={isLink ? s.kvValueLink : s.kvValue}>{value || ''}</Text>
    </View>
  );
}

function Checkbox({ checked }) {
  return (
    <View style={s.checkbox}>
      <Text style={s.checkboxChecked}>{checked ? 'X' : ' '}</Text>
    </View>
  );
}

// ── Cover page ────────────────────────────────────────────────
function CoverPage({ payload, logoUrl }) {
  return (
    <Page size="LETTER" style={s.page}>
      <PageChrome logoUrl={logoUrl} showWatermark={false} showSigStub={false} />

      {logoUrl && <Image src={logoUrl} style={s.coverBigLogo} />}

      <Text style={s.coverBig}>HOME IMPROVEMENT CONTRACT</Text>

      <View style={s.coverField}>
        <Text style={s.coverFieldLabel}>JOB NO.</Text>
        <Text style={s.coverFieldValue}>{payload.job_no || ''}</Text>
      </View>

      <View style={s.coverField}>
        <Text style={s.coverFieldLabel}>FOR</Text>
        <Text style={s.coverFieldValue}>{payload.for_label || payload.homeowner?.name || ''}</Text>
      </View>

      <View style={s.coverField}>
        <Text style={s.coverFieldLabel}>PREPARED BY:</Text>
        <Text style={s.coverFieldValue}>SUNVIC CONTRACTORS LLC</Text>
      </View>

      <View style={s.coverField}>
        <Text style={s.coverFieldLabel}>PREPARED ON</Text>
        <Text style={s.coverFieldValue}>{payload.prepared_on || ''}</Text>
      </View>
    </Page>
  );
}

// ── Section A — Agreement Background ──────────────────────────
function SectionAPage({ payload, logoUrl }) {
  const c = payload.contractor || {};
  const h = payload.homeowner || {};
  return (
    <Page size="LETTER" style={s.page}>
      <PageChrome logoUrl={logoUrl} />

      <SectionBar letter="A" title="AGREEMENT BACKGROUND" />
      <Text style={s.para}>
        This Agreement is made and entered into as of the date this Agreement is signed by both Parties, by and between:
      </Text>

      <SubBar text="1 - GENERAL CONTRACTOR INFORMATION" />
      <KVRow label="General Contractor's Legal Name:" value={c.legal_name} />
      <KVRow label="Business Address:" value={c.address} />
      <KVRow label="License No:" value={c.license_number} />
      <KVRow label="Email Address:" value={c.email} isLink />

      <SubBar text="2 - HOMEOWNER INFORMATION" />
      <KVRow label="Homeowner(s) Name:" value={h.name} />
      <KVRow label="Property Address:" value={h.address} />
      <KVRow label="Phone Number:" value={h.phone} />
      <KVRow label="Email Address:" value={h.email} />

      <SubBar text="3 - CONTRACT TYPE" />
      <Text style={s.para}>{payload.contract_type || 'Lump Sum Contract'}</Text>

      <SubBar text="4 - AGREEMENT SUMMARY" />
      <Text style={s.para}>{payload.agreement_summary?.text || ''}</Text>
    </Page>
  );
}

// ── Section B — Scope of Work (paginated across multiple pages) ─
function SectionBScope({ payload, logoUrl }) {
  const scope = payload.scope_of_work || {};
  const groups = scope.groups || [];
  const total = payload.payment?.total_cents || 0;

  return (
    <Page size="LETTER" style={s.page}>
      <PageChrome logoUrl={logoUrl} />

      <SectionBar letter="B" title="SCOPE OF WORK" />
      <Text style={s.paraTight}>{scope.intro}</Text>

      <Text style={s.scopeTitleBar}>WORK TO BE PERFORMED</Text>

      <View style={s.scopeTable}>
        <View style={s.scopeHeaderRow}>
          <View style={[s.scopeHeaderCell, { width: 60 }]}><Text>Task</Text></View>
          <View style={[s.scopeHeaderCell, { width: 110 }]}><Text> </Text></View>
          <View style={[s.scopeHeaderCell, { flex: 1 }]}><Text>Description</Text></View>
          <View style={[s.scopeHeaderCell, { width: 62 }]}><Text>Quantity</Text></View>
          <View style={[s.scopeHeaderCell, { width: 58 }]}><Text>Unit Price</Text></View>
          <View style={[s.scopeHeaderCell, { width: 68, borderRightWidth: 0 }]}><Text>Amount</Text></View>
        </View>

        {groups.map((g, gi) => {
          const tasks = g.tasks || [];
          return (
            <View key={gi} style={s.scopeGroupRow} wrap={false}>
              <View style={s.scopeCategoryCell}>
                <Text style={s.scopeCategoryText}>{g.category}</Text>
              </View>
              <View style={s.scopeTasksCol}>
                {tasks.map((t, ti) => (
                  <View
                    key={ti}
                    style={ti === tasks.length - 1 ? s.scopeTaskRowLast : s.scopeTaskRow}
                    wrap={false}
                  >
                    <View style={s.scopeTaskLabel}>
                      <Text>{t.task || ''}</Text>
                    </View>
                    <View style={s.scopeTaskDesc}>
                      {(t.description || []).map((d, di) => (
                        <Text key={di} style={s.scopeTaskDescLine}>─ {d}</Text>
                      ))}
                    </View>
                    <View style={s.scopeQtyCell}>
                      <Text>{t.qty || 'Lump Sump'}</Text>
                    </View>
                    <View style={s.scopePriceCell}>
                      <Text>{t.unit_price_cents ? fmtUSDFromCents(t.unit_price_cents) : ''}</Text>
                    </View>
                    <View style={s.scopeAmountCell}>
                      <Text>{t.amount_cents ? fmtUSDFromCents(t.amount_cents) : ''}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        <View style={s.scopeTotalRow}>
          <View style={s.scopeTotalLabelCell}>
            <Text>TOTAL</Text>
          </View>
          <View style={s.scopeAmountCell}>
            <Text>{fmtUSDFromCents(total)}</Text>
          </View>
        </View>
      </View>
    </Page>
  );
}

// ── Section C — Payment Terms ────────────────────────────────
function SectionCPage({ payload, logoUrl }) {
  const p = payload.payment || {};
  const total = p.total_cents || 0;
  const schedule = p.schedule || [];
  const homeownerName = payload.homeowner?.name?.trim() || '____________________';

  return (
    <Page size="LETTER" style={s.page}>
      <PageChrome logoUrl={logoUrl} />

      <SectionBar letter="C" title="PAYMENT TERMS" />
      <Text style={s.para}>
        By signing this agreement, the Homeowner{'  '}
        <Text style={s.bold}>{homeownerName}</Text>{'  '}
        agrees to the <Text style={s.bold}>Total Contract Value</Text> below.
      </Text>

      <View style={s.costBox}>
        <View style={s.costRow}>
          <Text style={s.costLabel}>Labor Cost</Text>
          <Text style={s.costValue}>{p.labor_cost_cents ? fmtUSDFromCents(p.labor_cost_cents) : ''}</Text>
        </View>
        <View style={s.costRow}>
          <Text style={s.costLabel}>Materials Cost</Text>
          <Text style={s.costValue}>{p.materials_cost_cents ? fmtUSDFromCents(p.materials_cost_cents) : ''}</Text>
        </View>
        <View style={s.costTotalRow}>
          <Text style={s.costTotalLabel}>Total Contract Value</Text>
          <Text style={s.costTotalValue}>{fmtUSDFromCents(total)}</Text>
        </View>
      </View>

      <Text style={s.para}>
        By signing this agreement, the Homeowner <Text style={s.bold}>{homeownerName}</Text>{' '}
        agrees to pay the Contract Value of <Text style={s.bold}>{fmtUSDFromCents(total)}</Text> in
        installments, as outlined in the <Text style={s.bold}>Payment Schedule</Text> below :
      </Text>

      <View style={s.schedTable}>
        <View style={s.schedHeaderRow}>
          <View style={[s.schedHeaderCell, s.schedStage]}><Text>Payment Stage</Text></View>
          <View style={[s.schedHeaderCell, s.schedPct]}><Text>%</Text></View>
          <View style={[s.schedHeaderCell, s.schedAmount]}><Text>Amount</Text></View>
          <View style={[s.schedHeaderCell, s.schedCond, { borderRightWidth: 0 }]}><Text>Due Condition</Text></View>
        </View>
        {schedule.map((m, i) => (
          <View key={i} style={s.schedRow}>
            <View style={[s.schedCell, s.schedStage]}><Text>{m.milestone}</Text></View>
            <View style={[s.schedCell, s.schedPct]}><Text>{m.percent}%</Text></View>
            <View style={[s.schedCell, s.schedAmount]}>
              <Text>{total ? fmtUSDFromCents(milestoneAmountCents(total, m.percent)) : ''}</Text>
            </View>
            <View style={[s.schedCell, s.schedCond, { borderRightWidth: 0 }]}>
              <Text>{m.condition}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={s.subBar}><Text style={s.subBarText}>— Accepted Payment Methods</Text></View>
      <View style={s.bulletRow}><Text style={s.bulletDot}>−</Text><Text style={s.bulletText}>Personal or Business Check (made payable to SUNVIC CONTRACTORS LLC)</Text></View>
      <View style={s.bulletRow}><Text style={s.bulletDot}>−</Text><Text style={s.bulletText}>Credit or Debit Card (subject to a 4% processing fee)</Text></View>
      <View style={s.bulletRow}><Text style={s.bulletDot}>−</Text><Text style={s.bulletText}>Bank Transfer (ACH or Wire Transfer)</Text></View>
      <View style={s.bulletRow}><Text style={s.bulletDot}>−</Text><Text style={s.bulletText}>Cash (ONLY accepted with a signed receipt)</Text></View>

      <Text style={[s.para, { marginTop: 10 }]}>{payload.invoice_terms?.text || ''}</Text>
    </Page>
  );
}

// ── Section (Materials / Change orders / Unforeseen) ─────────
function SectionUnforeseenPage({ payload, logoUrl }) {
  return (
    <Page size="LETTER" style={s.page}>
      <PageChrome logoUrl={logoUrl} />
      <View style={{ marginTop: 20 }}>
        <Text style={s.para}>
          By signing this agreement, the Homeowner{' '}
          <Text style={s.bold}>{payload.homeowner?.name?.trim() || '____________________'}</Text> agrees that:
        </Text>

        <SubBar text="— Material Options and Brand Selection:" />
        <Text style={s.para}>{payload.material_selection?.text}</Text>

        <SubBar text="— Changes to Work and Materials:" />
        <Text style={s.para}>{payload.change_orders?.text}</Text>

        <SubBar text="— Unforeseen Conditions During the Project:" />
        <Text style={s.para}>{payload.unforeseen?.text}</Text>
        <Text style={[s.para, s.bold]}>(Option-1)</Text>
        <Text style={s.para}>{payload.unforeseen?.option_1?.replace('(Option-1)\n', '')}</Text>
        <Text style={[s.para, s.bold]}>(Option-2)</Text>
        <Text style={s.para}>{payload.unforeseen?.option_2?.replace('(Option-2)\n', '')}</Text>
      </View>
    </Page>
  );
}

// ── Sections D + E + F + G ───────────────────────────────────
function SectionDEFGPage({ payload, logoUrl }) {
  const t = payload.timeline || {};
  const w = payload.warranties || {};
  const perm = payload.permits || {};
  const ins = payload.insurance || {};

  return (
    <Page size="LETTER" style={s.page}>
      <PageChrome logoUrl={logoUrl} />

      <SectionBar letter="D" title="ESTIMATED PROJECT TIMELINE" />
      <Text style={s.paraTight}>
        By signing this agreement, the Homeowner{' '}
        <Text style={s.bold}>{payload.homeowner?.name?.trim() || '____________________'}</Text>{' '}
        agrees project will finish within the estimated timeframe :
      </Text>
      <View style={s.bulletRow}>
        <Text style={s.bulletDot}>•</Text>
        <Text style={s.bulletText}>
          Estimated Start Date   <Text style={s.bold}>{t.weeks_to_start ?? 2} weeks</Text> of contract approval and receipt of deposit payment.
        </Text>
      </View>
      <View style={s.bulletRow}>
        <Text style={s.bulletDot}>•</Text>
        <Text style={s.bulletText}>
          Estimated Completion Date   <Text style={s.bold}>{t.months_to_complete ?? 6} months</Text> of the project start date.
        </Text>
      </View>
      <Text style={[s.paraTight, { marginTop: 4 }]}>{t.disclaimer}</Text>

      <SectionBar letter="E" title="WARRANTIES" />
      <Text style={s.paraTight}>{w.text}</Text>
      <Text style={s.paraTight}>{w.start_text}</Text>
      <Text style={s.paraTight}>{w.materials_text}</Text>

      <SectionBar letter="F" title="PERMITS & COMPLIANCE" suffix="(Check the appropriate box to indicate responsibility.)" />
      <View style={s.checkboxRow}>
        <Checkbox checked={!!perm.contractor_responsible} />
        <Text style={s.paraTight}>SUNVIC CONTRACTORS LLC is responsible for obtaining all required permits necessary for the work.</Text>
      </View>
      <View style={s.checkboxRow}>
        <Checkbox checked={!!perm.homeowner_responsible} />
        <Text style={s.paraTight}>The Homeowner is responsible for obtaining all required permits</Text>
      </View>

      <SectionBar letter="G" title="INSURANCE INFORMATION" />
      <Text style={s.paraTight}>{ins.text}</Text>
    </Page>
  );
}

// ── Sections H + I + J ───────────────────────────────────────
function SectionHIJPage({ payload, logoUrl }) {
  const d = payload.dispute_resolution || {};
  const r = payload.right_to_cancel || {};
  const sig = payload.signature || {};

  return (
    <Page size="LETTER" style={s.page}>
      <PageChrome logoUrl={logoUrl} />

      <SectionBar letter="H" title="DISPUTE RESOLUTION" />
      <Text style={s.paraTight}>{d.intro}</Text>
      {(d.steps || []).map((step, i) => (
        <Text key={i} style={s.paraTight}>
          <Text style={s.bold}>{i + 1}- {step.name} </Text>
          – {step.text}
        </Text>
      ))}
      <Text style={s.paraTight}>{d.footer}</Text>

      <SectionBar letter="I" title="RIGHT TO CANCEL" />
      <View style={s.rtcBox}>
        {(r.text || '').split('\n\n').map((para, i) => {
          const isBigCap = i === 0;
          return (
            <Text key={i} style={isBigCap ? s.rtcLine : s.rtcLineNormal}>
              {para}
            </Text>
          );
        })}
      </View>

      <SectionBar letter="J" title="SINGNATURE" />
      <Text style={s.paraTight}>{sig.intro?.split('\n')[0]}</Text>
      <Text style={s.paraTight}>{sig.intro?.split('\n').slice(1).join(' ')}</Text>

      <View style={s.sigGrid}>
        <View style={s.sigColumn}>
          <Text style={s.sigColHeader}>General Contractor</Text>
          <View style={s.sigColRow}>
            <Text style={s.sigColLabel}>Printed Name:</Text>
            <Text style={s.sigColBlank}>{sig.contractor?.printed_name || ''}</Text>
          </View>
          <View style={s.sigColRow}>
            <Text style={s.sigColLabel}>Signature:</Text>
            <Text style={s.sigColBlank}> </Text>
          </View>
        </View>
        <View style={s.sigColumn}>
          <Text style={s.sigColHeader}>Homeowner</Text>
          <View style={s.sigColRow}>
            <Text style={s.sigColLabel}>Printed Name:</Text>
            <Text style={s.sigColBlank}>{sig.homeowner?.printed_name || ''}</Text>
          </View>
          <View style={s.sigColRow}>
            <Text style={s.sigColLabel}>Signature:</Text>
            <Text style={s.sigColBlank}> </Text>
          </View>
          <View style={s.sigColRow}>
            <Text style={s.sigColLabel}>Date:</Text>
            <Text style={s.sigColBlank}>{sig.homeowner?.dated || ''}</Text>
          </View>
        </View>
      </View>
    </Page>
  );
}

// ── Root ─────────────────────────────────────────────────────
export function ContractPDF({ payload, logoUrl }) {
  return (
    <Document>
      <CoverPage payload={payload} logoUrl={logoUrl} />
      <SectionAPage payload={payload} logoUrl={logoUrl} />
      <SectionBScope payload={payload} logoUrl={logoUrl} />
      <SectionUnforeseenPage payload={payload} logoUrl={logoUrl} />
      <SectionCPage payload={payload} logoUrl={logoUrl} />
      <SectionDEFGPage payload={payload} logoUrl={logoUrl} />
      <SectionHIJPage payload={payload} logoUrl={logoUrl} />
    </Document>
  );
}

export default ContractPDF;
