// react-pdf styles shared by both PDF templates. Sunvic-orange system.

import { StyleSheet } from '@react-pdf/renderer';

const ORANGE = '#f97316';
const ORANGE_LIGHT = '#fff7ed';
const ORANGE_BORDER = '#fb923c';
const GRAY = '#374151';
const GRAY_LIGHT = '#6b7280';
const GRAY_BORDER = '#e5e7eb';

export const colors = { ORANGE, ORANGE_LIGHT, ORANGE_BORDER, GRAY, GRAY_LIGHT, GRAY_BORDER };

export const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: 'Helvetica', color: GRAY },

  // Header
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 3,
    borderBottomColor: ORANGE_BORDER,
    paddingBottom: 12,
    marginBottom: 18,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 56, height: 56, objectFit: 'contain' },
  companyBlock: { marginLeft: 10 },
  companyName: { fontSize: 16, fontWeight: 700, color: '#111827' },
  companyAddress: { fontSize: 9, color: GRAY_LIGHT, marginTop: 2 },
  companyMeta: { fontSize: 8, color: ORANGE, marginTop: 4, fontWeight: 600 },
  bigTitle: { fontSize: 34, fontWeight: 800, color: ORANGE, letterSpacing: 1 },
  bigNumber: { fontSize: 12, fontWeight: 700, color: '#111827', marginTop: 4, textAlign: 'right' },
  bigTagline: { fontSize: 8, color: GRAY_LIGHT, marginTop: 2, textAlign: 'right' },

  // Sections
  section: { marginTop: 16 },
  sectionHeader: {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: GRAY_LIGHT,
    letterSpacing: 1, marginBottom: 6,
  },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 6 },
  labelValueRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  label: { fontWeight: 700, color: GRAY, width: '30%' },
  value: { color: GRAY, width: '70%' },

  // Bill To
  billToGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  billToLeft:  { width: '55%' },
  billToRight: { width: '40%' },
  clientName: { fontSize: 14, fontWeight: 700, color: '#111827' },
  clientAddress: { fontSize: 10, color: GRAY, marginTop: 2 },

  // Phase table
  phaseBlock: { marginTop: 12, borderTopWidth: 1, borderTopColor: GRAY_BORDER, paddingTop: 8 },
  phaseTitle: { fontSize: 12, fontWeight: 700, color: '#111827' },
  phaseDescription: { fontSize: 9, color: GRAY_LIGHT, marginTop: 2, marginBottom: 6 },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: ORANGE_LIGHT,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: ORANGE_BORDER,
    paddingVertical: 4, paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5, borderBottomColor: GRAY_BORDER,
    paddingVertical: 4, paddingHorizontal: 4,
  },
  th: { fontWeight: 700, fontSize: 9, color: '#111827' },
  td: { fontSize: 9, color: GRAY },
  colDesc:   { width: '58%' },
  colQty:    { width: '10%', textAlign: 'right' },
  colRate:   { width: '16%', textAlign: 'right' },
  colAmount: { width: '16%', textAlign: 'right' },

  // Totals
  totalsBlock: { marginTop: 12, alignItems: 'flex-end' },
  totalRow: { flexDirection: 'row', width: 200, justifyContent: 'space-between', marginBottom: 3 },
  totalLabel: { color: GRAY_LIGHT, fontWeight: 700 },
  totalValue: { color: '#111827', fontWeight: 700 },
  totalFinalRow: {
    flexDirection: 'row', width: 200, justifyContent: 'space-between',
    marginTop: 5, paddingTop: 5, borderTopWidth: 2, borderTopColor: ORANGE_BORDER,
  },
  totalFinalLabel: { color: '#111827', fontSize: 12, fontWeight: 800 },
  totalFinalValue: { color: ORANGE, fontSize: 12, fontWeight: 800 },

  // Notes / warranty / footer
  notesBlock: { marginTop: 16, padding: 8, backgroundColor: ORANGE_LIGHT, borderLeftWidth: 3, borderLeftColor: ORANGE_BORDER },
  notesHeader: { fontSize: 10, fontWeight: 700, color: '#111827', marginBottom: 4 },
  notesText: { fontSize: 9, color: GRAY, lineHeight: 1.4 },
  warrantyBlock: { marginTop: 14 },
  warrantyTitle: { fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 4 },
  warrantyText: { fontSize: 9, color: GRAY, lineHeight: 1.4, marginBottom: 4 },
  footer: {
    position: 'absolute', left: 36, right: 36, bottom: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: ORANGE_BORDER, paddingTop: 6,
  },
  footerText: { fontSize: 8, color: GRAY_LIGHT },
  pageNumber: { fontSize: 8, color: GRAY_LIGHT },

  // Contract-specific
  contractTag: {
    alignSelf: 'flex-end', backgroundColor: ORANGE, color: 'white',
    paddingHorizontal: 8, paddingVertical: 2, fontSize: 9, fontWeight: 700,
  },
  legalBlock: { marginTop: 12, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: GRAY_BORDER },
  legalTitle: { fontSize: 11, fontWeight: 700, color: '#111827', marginBottom: 4 },
  legalText:  { fontSize: 9, color: GRAY, lineHeight: 1.4 },
  signatureGrid: { flexDirection: 'row', marginTop: 24, justifyContent: 'space-between' },
  signatureBox: { width: '45%', borderTopWidth: 1, borderTopColor: '#111827', paddingTop: 4 },
  signatureLabel: { fontSize: 9, fontWeight: 700, color: '#111827' },
  signatureMeta:  { fontSize: 8, color: GRAY_LIGHT, marginTop: 2 },
  scheduleRow: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: GRAY_BORDER },
  scheduleMs:  { width: '65%', fontSize: 9, color: GRAY },
  schedulePct: { width: '15%', textAlign: 'right', fontSize: 9, color: GRAY, fontWeight: 700 },
  scheduleAmt: { width: '20%', textAlign: 'right', fontSize: 9, color: '#111827', fontWeight: 700 },
});
