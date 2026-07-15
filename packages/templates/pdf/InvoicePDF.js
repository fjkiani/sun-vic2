import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import React from "react";
import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { s, colors } from "./styles.js";
import { fmtUSDFromCents, fmtDate, fmtDateShort } from "../format.js";
function PageChrome({ logoUrl, showWatermark = true }) {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(View, { style: s.header, fixed: true, children: logoUrl && /* @__PURE__ */ jsx(Image, { src: logoUrl, style: s.logoImg }) }),
    logoUrl && showWatermark && /* @__PURE__ */ jsx(Image, { src: logoUrl, style: s.watermark, fixed: true }),
    /* @__PURE__ */ jsxs(View, { style: s.footer, fixed: true, children: [
      /* @__PURE__ */ jsx(Text, { style: s.footerLine, children: "Sunvic Contractors LLC" }),
      /* @__PURE__ */ jsx(Text, { style: s.footerLine, children: "6 Stone Ridge Rd ,Old Bridge, NJ, 08857" }),
      /* @__PURE__ */ jsx(Text, { style: s.footerLine, children: "+1 (732) 824-9203" }),
      /* @__PURE__ */ jsx(
        Text,
        {
          style: s.footerPageNumber,
          render: ({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`
        }
      )
    ] })
  ] });
}
function SectionBar({ letter, title, suffix }) {
  return /* @__PURE__ */ jsx(View, { style: s.sectionBar, children: /* @__PURE__ */ jsxs(Text, { style: s.sectionBarText, children: [
    letter ? `${letter} - ${title}` : title,
    suffix ? /* @__PURE__ */ jsxs(Text, { style: s.sectionBarTextWithSuffix, children: [
      "  ",
      suffix
    ] }) : null
  ] }) });
}
function InvoiceHeader({ payload }) {
  return /* @__PURE__ */ jsxs(View, { style: s.invHeaderRow, children: [
    /* @__PURE__ */ jsxs(View, { style: s.invTitleCol, children: [
      /* @__PURE__ */ jsx(Text, { style: s.invBigTitle, children: "INVOICE" }),
      /* @__PURE__ */ jsx(Text, { style: { fontSize: 9, color: colors.GRAY_MUTED, marginTop: 6 }, children: "SUNVIC CONTRACTORS LLC \xB7 License #13VH12429600" }),
      /* @__PURE__ */ jsx(Text, { style: { fontSize: 9, marginTop: 2 }, children: "6 Stone Ridge Rd ,Old Bridge, NJ, 08857" }),
      /* @__PURE__ */ jsx(Text, { style: { fontSize: 9 }, children: "+1 (732) 824-9203  \xB7  Contact@sunvicnj.com" })
    ] }),
    /* @__PURE__ */ jsx(View, { style: { width: 240 }, children: /* @__PURE__ */ jsxs(View, { style: s.invMetaTable, children: [
      /* @__PURE__ */ jsxs(View, { style: s.invMetaRow, children: [
        /* @__PURE__ */ jsx(Text, { style: s.invMetaLabel, children: "Invoice No." }),
        /* @__PURE__ */ jsx(Text, { style: s.invMetaValue, children: payload.invoice_number || "" })
      ] }),
      /* @__PURE__ */ jsxs(View, { style: s.invMetaRow, children: [
        /* @__PURE__ */ jsx(Text, { style: s.invMetaLabel, children: "Invoice Date" }),
        /* @__PURE__ */ jsx(Text, { style: s.invMetaValue, children: fmtDate(payload.invoice_date) })
      ] }),
      /* @__PURE__ */ jsxs(View, { style: s.invMetaRow, children: [
        /* @__PURE__ */ jsx(Text, { style: s.invMetaLabel, children: "Due Date" }),
        /* @__PURE__ */ jsx(Text, { style: s.invMetaValue, children: fmtDate(payload.due_date) })
      ] }),
      /* @__PURE__ */ jsxs(View, { style: s.invMetaRow, children: [
        /* @__PURE__ */ jsx(Text, { style: s.invMetaLabel, children: "Contract Ref." }),
        /* @__PURE__ */ jsx(Text, { style: s.invMetaValue, children: payload.contract_ref || "" })
      ] }),
      /* @__PURE__ */ jsxs(View, { style: s.invMetaRow, children: [
        /* @__PURE__ */ jsx(Text, { style: s.invMetaLabel, children: "Milestone" }),
        /* @__PURE__ */ jsx(Text, { style: s.invMetaValue, children: payload.milestone_label || "" })
      ] }),
      /* @__PURE__ */ jsxs(View, { style: [s.invMetaRow, { borderBottomWidth: 0 }], children: [
        /* @__PURE__ */ jsx(Text, { style: s.invMetaLabel, children: "Status" }),
        /* @__PURE__ */ jsx(Text, { style: [s.invMetaValue, { textTransform: "uppercase", fontWeight: 700 }], children: payload.status || "draft" })
      ] })
    ] }) })
  ] });
}
function BillToBlock({ payload }) {
  const b = payload.bill_to || {};
  return /* @__PURE__ */ jsxs(View, { style: s.billToBlock, children: [
    /* @__PURE__ */ jsx(Text, { style: s.billToLabel, children: "Bill To" }),
    /* @__PURE__ */ jsx(Text, { style: s.billToName, children: b.client_name || "\u2014" }),
    b.property_address ? /* @__PURE__ */ jsx(Text, { style: s.billToLine, children: b.property_address }) : null,
    b.recipient_email ? /* @__PURE__ */ jsx(Text, { style: s.billToLine, children: b.recipient_email }) : null,
    b.recipient_phone ? /* @__PURE__ */ jsx(Text, { style: s.billToLine, children: b.recipient_phone }) : null
  ] });
}
function MilestoneSummaryBox({ payload }) {
  const cTotal = payload.contract?.total_cents || 0;
  const mPct = payload.milestone?.percent || 0;
  const mSub = payload.milestone?.subtotal_cents || 0;
  const labor = payload.milestone?.labor_portion_cents || 0;
  const mats = payload.milestone?.materials_portion_cents || 0;
  return /* @__PURE__ */ jsxs(View, { style: { marginTop: 12, borderWidth: 0.5, borderColor: "#000", backgroundColor: colors.ORANGE_LIGHT }, children: [
    /* @__PURE__ */ jsxs(View, { style: [s.invMetaRow, { borderBottomWidth: 0.5, borderBottomColor: "#000" }], children: [
      /* @__PURE__ */ jsx(Text, { style: [s.invMetaLabel, { backgroundColor: colors.GRAY_BAR, width: 160 }], children: "Milestone" }),
      /* @__PURE__ */ jsxs(Text, { style: [s.invMetaValue, { fontWeight: 700 }], children: [
        payload.milestone_label,
        " \u2014 ",
        mPct,
        "% of contract"
      ] })
    ] }),
    /* @__PURE__ */ jsxs(View, { style: [s.invMetaRow, { borderBottomWidth: 0.5, borderBottomColor: "#000" }], children: [
      /* @__PURE__ */ jsx(Text, { style: [s.invMetaLabel, { backgroundColor: colors.GRAY_BAR, width: 160 }], children: "Contract Total" }),
      /* @__PURE__ */ jsx(Text, { style: s.invMetaValue, children: fmtUSDFromCents(cTotal) })
    ] }),
    /* @__PURE__ */ jsxs(View, { style: [s.invMetaRow, { borderBottomWidth: 0.5, borderBottomColor: "#000" }], children: [
      /* @__PURE__ */ jsx(Text, { style: [s.invMetaLabel, { backgroundColor: colors.GRAY_BAR, width: 160 }], children: "Milestone Amount" }),
      /* @__PURE__ */ jsx(Text, { style: [s.invMetaValue, { fontWeight: 700 }], children: fmtUSDFromCents(mSub) })
    ] }),
    /* @__PURE__ */ jsxs(View, { style: [s.invMetaRow, { borderBottomWidth: 0.5, borderBottomColor: "#000" }], children: [
      /* @__PURE__ */ jsx(Text, { style: [s.invMetaLabel, { backgroundColor: colors.GRAY_BAR, width: 160 }], children: "Labor Portion" }),
      /* @__PURE__ */ jsx(Text, { style: s.invMetaValue, children: fmtUSDFromCents(labor) })
    ] }),
    /* @__PURE__ */ jsxs(View, { style: [s.invMetaRow, { borderBottomWidth: 0 }], children: [
      /* @__PURE__ */ jsx(Text, { style: [s.invMetaLabel, { backgroundColor: colors.GRAY_BAR, width: 160 }], children: "Materials Portion" }),
      /* @__PURE__ */ jsx(Text, { style: s.invMetaValue, children: fmtUSDFromCents(mats) })
    ] }),
    /* @__PURE__ */ jsxs(View, { style: [s.invMetaRow, { borderBottomWidth: 0, backgroundColor: "#fff" }], children: [
      /* @__PURE__ */ jsx(Text, { style: [s.invMetaLabel, { backgroundColor: "#fff", width: 160, fontSize: 8, color: colors.GRAY_MUTED, fontWeight: 400 }], children: "Due condition" }),
      /* @__PURE__ */ jsx(Text, { style: [s.invMetaValue, { fontSize: 8, color: colors.GRAY_MUTED }], children: payload.milestone_condition || "" })
    ] })
  ] });
}
function LineItemsTable({ payload }) {
  const items = payload.line_items || [];
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(SectionBar, { title: "WORK COMPLETED IN THIS MILESTONE" }),
    /* @__PURE__ */ jsxs(View, { style: s.invLineTable, children: [
      /* @__PURE__ */ jsxs(View, { style: s.invLineHeader, children: [
        /* @__PURE__ */ jsx(Text, { style: [s.invLineHeaderCell, s.invColDesc], children: "Description" }),
        /* @__PURE__ */ jsx(Text, { style: [s.invLineHeaderCell, s.invColQty], children: "Qty" }),
        /* @__PURE__ */ jsx(Text, { style: [s.invLineHeaderCell, s.invColRate], children: "Rate" }),
        /* @__PURE__ */ jsx(Text, { style: [s.invLineHeaderCell, s.invColAmount, { borderRightWidth: 0 }], children: "Amount" })
      ] }),
      items.map((li, i) => /* @__PURE__ */ jsxs(View, { style: s.invLineRow, children: [
        /* @__PURE__ */ jsx(Text, { style: [s.invLineCell, s.invColDesc], children: li.desc }),
        /* @__PURE__ */ jsx(Text, { style: [s.invLineCell, s.invColQty], children: li.qty }),
        /* @__PURE__ */ jsx(Text, { style: [s.invLineCell, s.invColRate], children: fmtUSDFromCents(li.rate_cents) }),
        /* @__PURE__ */ jsx(Text, { style: [s.invLineCell, s.invColAmount, { borderRightWidth: 0 }], children: fmtUSDFromCents(li.amount_cents) })
      ] }, i))
    ] })
  ] });
}
function TotalsBlock({ payload }) {
  const t = payload.totals || {};
  return /* @__PURE__ */ jsxs(View, { style: s.invTotalsBlock, wrap: false, children: [
    /* @__PURE__ */ jsxs(View, { style: s.invTotalRow, children: [
      /* @__PURE__ */ jsx(Text, { style: s.invTotalLabel, children: "Subtotal" }),
      /* @__PURE__ */ jsx(Text, { style: s.invTotalValue, children: fmtUSDFromCents(t.subtotal_cents) })
    ] }),
    /* @__PURE__ */ jsxs(View, { style: s.invTotalRow, children: [
      /* @__PURE__ */ jsxs(Text, { style: s.invTotalLabel, children: [
        "NJ Sales Tax (",
        payload.tax?.rate_percent,
        "% on ",
        payload.tax?.applies_to === "materials_only" ? "materials" : "total",
        ")"
      ] }),
      /* @__PURE__ */ jsx(Text, { style: s.invTotalValue, children: fmtUSDFromCents(t.tax_cents) })
    ] }),
    /* @__PURE__ */ jsxs(View, { style: s.invGrandRow, children: [
      /* @__PURE__ */ jsx(Text, { style: s.invGrandLabel, children: "Total Due" }),
      /* @__PURE__ */ jsx(Text, { style: s.invGrandValue, children: fmtUSDFromCents(t.total_due_cents) })
    ] })
  ] });
}
function PriorPaymentsBlock({ payload }) {
  const priors = payload.prior_payments || [];
  const priorSum = priors.reduce((s2, p) => s2 + (p.amount_cents || 0), 0);
  if (!priors.length) return null;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(SectionBar, { title: "PAYMENTS RECEIVED TO DATE" }),
    /* @__PURE__ */ jsxs(View, { style: s.invLineTable, children: [
      /* @__PURE__ */ jsxs(View, { style: s.invLineHeader, children: [
        /* @__PURE__ */ jsx(Text, { style: [s.invLineHeaderCell, s.invColDesc], children: "Milestone" }),
        /* @__PURE__ */ jsx(Text, { style: [s.invLineHeaderCell, { width: 90, borderRightWidth: 0.5, borderRightColor: "#000" }], children: "Date" }),
        /* @__PURE__ */ jsx(Text, { style: [s.invLineHeaderCell, s.invColAmount, { borderRightWidth: 0 }], children: "Amount" })
      ] }),
      priors.map((p, i) => /* @__PURE__ */ jsxs(View, { style: s.invLineRow, children: [
        /* @__PURE__ */ jsx(Text, { style: [s.invLineCell, s.invColDesc], children: p.label }),
        /* @__PURE__ */ jsx(Text, { style: [s.invLineCell, { width: 90, borderRightWidth: 0.5, borderRightColor: "#000" }], children: fmtDateShort(p.date) }),
        /* @__PURE__ */ jsx(Text, { style: [s.invLineCell, s.invColAmount, { borderRightWidth: 0 }], children: fmtUSDFromCents(p.amount_cents) })
      ] }, i)),
      /* @__PURE__ */ jsxs(View, { style: [s.invLineRow, { backgroundColor: colors.GRAY_SUB, borderBottomWidth: 0 }], children: [
        /* @__PURE__ */ jsx(Text, { style: [s.invLineCell, s.invColDesc, { fontWeight: 700 }], children: "Total received prior to this invoice" }),
        /* @__PURE__ */ jsx(Text, { style: [s.invLineCell, { width: 90, borderRightWidth: 0.5, borderRightColor: "#000" }], children: " " }),
        /* @__PURE__ */ jsx(Text, { style: [s.invLineCell, s.invColAmount, { fontWeight: 700, borderRightWidth: 0 }], children: fmtUSDFromCents(priorSum) })
      ] })
    ] })
  ] });
}
function PaymentMethodsBlock({ payload }) {
  const methods = payload.payment_methods || [];
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(SectionBar, { title: "ACCEPTED PAYMENT METHODS" }),
    methods.map((m, i) => /* @__PURE__ */ jsxs(View, { style: s.bulletRow, children: [
      /* @__PURE__ */ jsx(Text, { style: s.bulletDot, children: "\u2212" }),
      /* @__PURE__ */ jsx(Text, { style: s.bulletText, children: m })
    ] }, i)),
    /* @__PURE__ */ jsx(Text, { style: [s.paraTight, { marginTop: 8 }], children: payload.invoice_terms?.text || "" })
  ] });
}
function InvoicePDF({ payload, logoUrl }) {
  return /* @__PURE__ */ jsxs(Document, { children: [
    /* @__PURE__ */ jsxs(Page, { size: "LETTER", style: s.page, children: [
      /* @__PURE__ */ jsx(PageChrome, { logoUrl }),
      /* @__PURE__ */ jsx(InvoiceHeader, { payload }),
      /* @__PURE__ */ jsx(BillToBlock, { payload }),
      /* @__PURE__ */ jsx(MilestoneSummaryBox, { payload }),
      /* @__PURE__ */ jsx(LineItemsTable, { payload }),
      /* @__PURE__ */ jsx(TotalsBlock, { payload })
    ] }),
    /* @__PURE__ */ jsxs(Page, { size: "LETTER", style: s.page, children: [
      /* @__PURE__ */ jsx(PageChrome, { logoUrl }),
      /* @__PURE__ */ jsxs(View, { style: { marginTop: 20 }, children: [
        /* @__PURE__ */ jsx(PriorPaymentsBlock, { payload }),
        /* @__PURE__ */ jsx(PaymentMethodsBlock, { payload }),
        payload.contract?.total_cents ? /* @__PURE__ */ jsxs(View, { style: { marginTop: 16, borderWidth: 0.5, borderColor: "#000" }, children: [
          /* @__PURE__ */ jsxs(View, { style: [s.invMetaRow, { borderBottomWidth: 0.5, borderBottomColor: "#000" }], children: [
            /* @__PURE__ */ jsx(Text, { style: [s.invMetaLabel, { backgroundColor: colors.GRAY_BAR, width: 220 }], children: "Contract Total" }),
            /* @__PURE__ */ jsx(Text, { style: s.invMetaValue, children: fmtUSDFromCents(payload.contract.total_cents) })
          ] }),
          /* @__PURE__ */ jsxs(View, { style: [s.invMetaRow, { borderBottomWidth: 0.5, borderBottomColor: "#000" }], children: [
            /* @__PURE__ */ jsx(Text, { style: [s.invMetaLabel, { backgroundColor: colors.GRAY_BAR, width: 220 }], children: "Paid prior to this invoice" }),
            /* @__PURE__ */ jsxs(Text, { style: s.invMetaValue, children: [
              "\u2212",
              fmtUSDFromCents((payload.prior_payments || []).reduce((s2, p) => s2 + (p.amount_cents || 0), 0))
            ] })
          ] }),
          /* @__PURE__ */ jsxs(View, { style: [s.invMetaRow, { borderBottomWidth: 0.5, borderBottomColor: "#000" }], children: [
            /* @__PURE__ */ jsx(Text, { style: [s.invMetaLabel, { backgroundColor: colors.GRAY_BAR, width: 220 }], children: "This invoice (Total Due)" }),
            /* @__PURE__ */ jsxs(Text, { style: [s.invMetaValue, { fontWeight: 700 }], children: [
              "\u2212",
              fmtUSDFromCents(payload.totals?.total_due_cents || 0)
            ] })
          ] }),
          /* @__PURE__ */ jsxs(View, { style: [s.invMetaRow, { borderBottomWidth: 0 }], children: [
            /* @__PURE__ */ jsx(Text, { style: [s.invMetaLabel, { backgroundColor: colors.ORANGE_LIGHT, width: 220, fontWeight: 700 }], children: "Contract balance after this invoice" }),
            /* @__PURE__ */ jsx(Text, { style: [s.invMetaValue, { fontWeight: 700 }], children: fmtUSDFromCents(payload.totals?.remaining_after_cents || 0) })
          ] })
        ] }) : null
      ] })
    ] })
  ] });
}
var InvoicePDF_default = InvoicePDF;
export {
  InvoicePDF,
  InvoicePDF_default as default
};
