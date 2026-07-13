// react-pdf styles — matched to the 10-page NJ Home Improvement Contract sample.

import { StyleSheet } from '@react-pdf/renderer';

const ORANGE       = '#f79420';   // Sunvic logo orange
const ORANGE_DARK  = '#e07800';
const ORANGE_LIGHT = '#fff2e0';
const GRAY_BAR     = '#d9d9d9';   // section header bar in sample
const GRAY_SUB     = '#ececec';   // sub-section header
const GRAY_BORDER  = '#000000';   // table borders in sample are near-black
const GRAY_TEXT    = '#000000';   // sample uses black body text
const GRAY_MUTED   = '#4a4a4a';
const WARN         = '#c02020';   // triangle warning icon color

export const colors = {
  ORANGE, ORANGE_DARK, ORANGE_LIGHT,
  GRAY_BAR, GRAY_SUB, GRAY_BORDER, GRAY_TEXT, GRAY_MUTED, WARN,
};

export const s = StyleSheet.create({
  // ── Page shell ───────────────────────────────────────────────
  page: {
    paddingTop: 60,
    paddingBottom: 90,
    paddingHorizontal: 42,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: GRAY_TEXT,
    position: 'relative',
  },

  // ── Header (top-left logo + wordmark) ────────────────────────
  header: {
    position: 'absolute',
    top: 24,
    left: 42,
    right: 42,
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoImg: { width: 54, height: 54, objectFit: 'contain' },
  logoWordmark: { marginLeft: 6, fontSize: 16, fontWeight: 700, color: ORANGE },
  logoWordmark2: { fontSize: 16, fontWeight: 700, color: ORANGE },

  // ── Watermark (center faint logo) ────────────────────────────
  watermark: {
    position: 'absolute',
    top: 260,
    left: 220,
    width: 200,
    height: 200,
    opacity: 0.08,
    objectFit: 'contain',
  },

  // ── Footer ───────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    left: 42,
    right: 42,
    bottom: 40,
    flexDirection: 'column',
    alignItems: 'center',
  },
  footerLine: { fontSize: 9, color: GRAY_TEXT, marginBottom: 1 },
  footerPageNumber: { fontSize: 8, color: GRAY_MUTED, marginTop: 4 },

  // Signature stub above footer
  sigStub: {
    position: 'absolute',
    left: 42,
    right: 42,
    bottom: 90,
  },
  sigStubLine: { fontSize: 9, marginBottom: 8 },

  // ── Section headers (grey bar with left-aligned label) ───────
  sectionBar: {
    backgroundColor: GRAY_BAR,
    paddingHorizontal: 6,
    paddingVertical: 5,
    marginTop: 14,
    marginBottom: 8,
  },
  sectionBarText: { fontSize: 11, fontWeight: 700, color: '#000000' },
  sectionBarTextWithSuffix: { fontSize: 11, fontWeight: 400, color: '#000000' },

  // Sub-section headers (lighter grey)
  subBar: {
    backgroundColor: GRAY_SUB,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginTop: 8,
    marginBottom: 4,
  },
  subBarText: { fontSize: 10, fontWeight: 400, color: '#000000' },

  // ── Body text ────────────────────────────────────────────────
  para: { fontSize: 10, lineHeight: 1.45, marginBottom: 6, color: GRAY_TEXT },
  paraTight: { fontSize: 10, lineHeight: 1.35, marginBottom: 3, color: GRAY_TEXT },
  bold: { fontWeight: 700 },
  bulletRow: { flexDirection: 'row', marginBottom: 2 },
  bulletDot: { width: 10, fontSize: 10 },
  bulletText: { fontSize: 10, flex: 1, color: GRAY_TEXT },

  // ── Label / value lines used in section A subsections ────────
  kvRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000000',
    paddingBottom: 2,
    paddingTop: 4,
  },
  kvLabel: { width: '35%', fontSize: 10, color: GRAY_TEXT },
  kvValue: { flex: 1, fontSize: 10, color: GRAY_TEXT },
  kvValueLink: { flex: 1, fontSize: 10, color: '#1155cc', textDecoration: 'underline' },

  // ── Cover page ───────────────────────────────────────────────
  coverBigLogo: {
    position: 'absolute',
    top: 110,
    left: 220,
    width: 170,
    height: 170,
    objectFit: 'contain',
    opacity: 0.9,
  },
  coverBig: {
    fontSize: 18, textAlign: 'center',
    marginTop: 290,   // pushed below the big logo
    letterSpacing: 2, fontWeight: 400,
  },
  coverField: {
    marginTop: 28,
    alignSelf: 'center',
    width: 220,
  },
  coverFieldLabel: {
    backgroundColor: GRAY_BAR,
    textAlign: 'center',
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: 700,
  },
  coverFieldValue: {
    textAlign: 'center',
    paddingVertical: 6,
    fontSize: 11,
    fontWeight: 700,
    borderBottomWidth: 0,
  },

  // ── Scope-of-work table ──────────────────────────────────────
  scopeTitleBar: {
    backgroundColor: GRAY_BAR,
    borderWidth: 1,
    borderColor: '#000000',
    borderBottomWidth: 0,
    paddingVertical: 4,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: 700,
  },
  scopeTable: {
    borderWidth: 1,
    borderColor: '#000000',
  },
  scopeHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  scopeHeaderCell: {
    fontSize: 10,
    fontWeight: 700,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRightWidth: 1,
    borderRightColor: '#000000',
  },
  scopeGroupRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  scopeCategoryCell: {
    width: 60,
    borderRightWidth: 1,
    borderRightColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  scopeCategoryText: {
    fontSize: 11,
    fontWeight: 400,
    // simulate rotated text — react-pdf doesn't support transforms cleanly,
    // so we render horizontally but centered; visual difference vs sample is minor
    textAlign: 'center',
  },
  scopeTasksCol: { flex: 1 },
  scopeTaskRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000000',
  },
  scopeTaskRowLast: {
    flexDirection: 'row',
  },
  scopeTaskLabel: {
    width: 110,
    borderRightWidth: 1,
    borderRightColor: '#000000',
    padding: 6,
    justifyContent: 'center',
    fontSize: 10,
  },
  scopeTaskDesc: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#000000',
    padding: 6,
  },
  scopeTaskDescLine: { fontSize: 9, marginBottom: 1, color: GRAY_TEXT },
  scopeQtyCell: {
    width: 62,
    borderRightWidth: 1,
    borderRightColor: '#000000',
    padding: 6,
    fontSize: 9,
    textAlign: 'center',
  },
  scopePriceCell: {
    width: 58,
    borderRightWidth: 1,
    borderRightColor: '#000000',
    padding: 6,
    fontSize: 9,
    textAlign: 'right',
  },
  scopeAmountCell: {
    width: 68,
    padding: 6,
    fontSize: 9,
    textAlign: 'right',
  },
  scopeTotalRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#000000',
  },
  scopeTotalLabelCell: {
    flex: 1,
    padding: 6,
    fontSize: 10,
    fontWeight: 700,
    textAlign: 'right',
    borderRightWidth: 1,
    borderRightColor: '#000000',
  },

  // ── Payment terms box ────────────────────────────────────────
  costBox: {
    borderWidth: 1,
    borderColor: '#000000',
    width: 220,
    marginTop: 4,
    marginBottom: 8,
  },
  costRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000000',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  costLabel: { flex: 1, fontSize: 10 },
  costValue: { fontSize: 10, textAlign: 'right', width: 90 },
  costTotalRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: '#000000',
  },
  costTotalLabel: { flex: 1, fontSize: 10, fontWeight: 700 },
  costTotalValue: { fontSize: 10, fontWeight: 700, textAlign: 'right', width: 90 },

  // Payment schedule
  schedTable: {
    borderWidth: 1,
    borderColor: '#000000',
    marginTop: 4,
  },
  schedHeaderRow: {
    flexDirection: 'row',
    backgroundColor: GRAY_BAR,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  schedHeaderCell: {
    fontSize: 10, fontWeight: 700, paddingHorizontal: 4, paddingVertical: 4,
    borderRightWidth: 1, borderRightColor: '#000000', textAlign: 'center',
  },
  schedRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000000',
  },
  schedCell: {
    fontSize: 10, paddingHorizontal: 4, paddingVertical: 5,
    borderRightWidth: 1, borderRightColor: '#000000',
  },
  schedStage:  { width: 100, textAlign: 'center' },
  schedPct:    { width: 40, textAlign: 'center' },
  schedAmount: { width: 80, textAlign: 'right' },
  schedCond:   { flex: 1, borderRightWidth: 0 },

  // ── Permits checkboxes ───────────────────────────────────────
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, marginTop: 2 },
  checkbox: {
    width: 10, height: 10, borderWidth: 0.8, borderColor: '#000000',
    marginRight: 6,
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxChecked: {
    fontSize: 9, fontWeight: 700, lineHeight: 1, textAlign: 'center',
  },

  // ── Right to Cancel bordered box ─────────────────────────────
  rtcBox: {
    borderWidth: 1.5,
    borderColor: '#000000',
    padding: 16,
    marginTop: 6,
    marginBottom: 10,
  },
  rtcLine: { fontSize: 10, fontWeight: 700, textAlign: 'center', marginBottom: 8 },
  rtcLineNormal: { fontSize: 10, fontWeight: 400, textAlign: 'center', marginBottom: 4 },

  // ── Signature block (2-column, Section J) ────────────────────
  sigGrid: { flexDirection: 'row', marginTop: 10, gap: 12 },
  sigColumn: { flex: 1 },
  sigColHeader: {
    backgroundColor: GRAY_BAR,
    paddingVertical: 4,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: 700,
  },
  sigColRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000000',
    paddingVertical: 6,
  },
  sigColLabel: { width: 90, fontSize: 10 },
  sigColBlank: { flex: 1, fontSize: 10 },

  // ── Invoice-specific ─────────────────────────────────────────
  invHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 30 },
  invTitleCol: { flex: 1 },
  invBigTitle: { fontSize: 30, fontWeight: 700, color: ORANGE, letterSpacing: 3 },
  invMetaTable: {
    marginTop: 6,
    borderWidth: 0.5,
    borderColor: '#000000',
  },
  invMetaRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000000',
  },
  invMetaLabel: {
    width: 120, backgroundColor: GRAY_SUB,
    borderRightWidth: 0.5, borderRightColor: '#000000',
    paddingHorizontal: 6, paddingVertical: 4, fontSize: 9, fontWeight: 700,
  },
  invMetaValue: { flex: 1, paddingHorizontal: 6, paddingVertical: 4, fontSize: 9 },

  billToBlock: { marginTop: 12 },
  billToLabel: { fontSize: 9, fontWeight: 700, marginBottom: 3, color: GRAY_MUTED, textTransform: 'uppercase', letterSpacing: 1 },
  billToName: { fontSize: 12, fontWeight: 700, marginBottom: 2 },
  billToLine: { fontSize: 10, marginBottom: 1 },

  invLineTable: {
    marginTop: 10,
    borderWidth: 0.5,
    borderColor: '#000000',
  },
  invLineHeader: {
    flexDirection: 'row',
    backgroundColor: GRAY_BAR,
    borderBottomWidth: 0.5,
    borderBottomColor: '#000000',
  },
  invLineHeaderCell: { fontSize: 9, fontWeight: 700, paddingHorizontal: 6, paddingVertical: 3, borderRightWidth: 0.5, borderRightColor: '#000000' },
  invLineRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000000',
  },
  invLineCell: { fontSize: 9, paddingHorizontal: 6, paddingVertical: 3, borderRightWidth: 0.5, borderRightColor: '#000000' },
  invColDesc:   { flex: 1 },
  invColQty:    { width: 40, textAlign: 'right' },
  invColRate:   { width: 70, textAlign: 'right' },
  invColAmount: { width: 80, textAlign: 'right', borderRightWidth: 0 },

  invTotalsBlock: { alignSelf: 'flex-end', width: 240, marginTop: 10 },
  invTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, paddingHorizontal: 4 },
  invTotalLabel: { fontSize: 10 },
  invTotalValue: { fontSize: 10, fontWeight: 700 },
  invGrandRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 5, paddingHorizontal: 4,
    marginTop: 4,
    borderTopWidth: 1.5, borderTopColor: '#000000',
    backgroundColor: ORANGE_LIGHT,
  },
  invGrandLabel: { fontSize: 12, fontWeight: 700 },
  invGrandValue: { fontSize: 14, fontWeight: 700, color: ORANGE_DARK },
});
