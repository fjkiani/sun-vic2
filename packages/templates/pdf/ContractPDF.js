import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import React from "react";
import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { s, colors } from "./styles.js";
import { fmtUSDFromCents, milestoneAmountCents } from "../format.js";
function PageChrome({ logoUrl, showWatermark = true, showSigStub = true, pageNumber, totalPages }) {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(View, { style: s.header, fixed: true, children: logoUrl && /* @__PURE__ */ jsx(Image, { src: logoUrl, style: s.logoImg }) }),
    logoUrl && showWatermark && /* @__PURE__ */ jsx(Image, { src: logoUrl, style: s.watermark, fixed: true }),
    showSigStub && /* @__PURE__ */ jsxs(View, { style: s.sigStub, fixed: true, children: [
      /* @__PURE__ */ jsx(Text, { style: s.sigStubLine, children: "Homeowner Signature: _______________________________" }),
      /* @__PURE__ */ jsx(Text, { style: s.sigStubLine, children: "Contractor Signature: ________________________________" })
    ] }),
    /* @__PURE__ */ jsxs(View, { style: s.footer, fixed: true, children: [
      /* @__PURE__ */ jsx(Text, { style: s.footerLine, children: "Sunvic Contractors LLC" }),
      /* @__PURE__ */ jsx(Text, { style: s.footerLine, children: "6 Stone Ridge Rd ,Old Bridge, NJ, 08857" }),
      /* @__PURE__ */ jsx(Text, { style: s.footerLine, children: "+1 (732) 824-9203" }),
      /* @__PURE__ */ jsx(
        Text,
        {
          style: s.footerPageNumber,
          render: ({ pageNumber: pn, totalPages: tp }) => `Page ${pn} / ${tp}`
        }
      )
    ] })
  ] });
}
function SectionBar({ letter, title, suffix }) {
  return /* @__PURE__ */ jsx(View, { style: s.sectionBar, children: /* @__PURE__ */ jsxs(Text, { style: s.sectionBarText, children: [
    letter,
    " - ",
    title,
    suffix ? /* @__PURE__ */ jsxs(Text, { style: s.sectionBarTextWithSuffix, children: [
      "  ",
      suffix
    ] }) : null
  ] }) });
}
function SubBar({ text }) {
  return /* @__PURE__ */ jsx(View, { style: s.subBar, children: /* @__PURE__ */ jsx(Text, { style: s.subBarText, children: text }) });
}
function KVRow({ label, value, isLink }) {
  return /* @__PURE__ */ jsxs(View, { style: s.kvRow, children: [
    /* @__PURE__ */ jsx(Text, { style: s.kvLabel, children: label }),
    /* @__PURE__ */ jsx(Text, { style: isLink ? s.kvValueLink : s.kvValue, children: value || "" })
  ] });
}
function Checkbox({ checked }) {
  return /* @__PURE__ */ jsx(View, { style: s.checkbox, children: /* @__PURE__ */ jsx(Text, { style: s.checkboxChecked, children: checked ? "X" : " " }) });
}
function CoverPage({ payload, logoUrl }) {
  return /* @__PURE__ */ jsxs(Page, { size: "LETTER", style: s.page, children: [
    /* @__PURE__ */ jsx(PageChrome, { logoUrl, showWatermark: false, showSigStub: false }),
    logoUrl && /* @__PURE__ */ jsx(Image, { src: logoUrl, style: s.coverBigLogo }),
    /* @__PURE__ */ jsx(Text, { style: s.coverBig, children: "HOME IMPROVEMENT CONTRACT" }),
    /* @__PURE__ */ jsxs(View, { style: s.coverField, children: [
      /* @__PURE__ */ jsx(Text, { style: s.coverFieldLabel, children: "JOB NO." }),
      /* @__PURE__ */ jsx(Text, { style: s.coverFieldValue, children: payload.job_no || "" })
    ] }),
    /* @__PURE__ */ jsxs(View, { style: s.coverField, children: [
      /* @__PURE__ */ jsx(Text, { style: s.coverFieldLabel, children: "FOR" }),
      /* @__PURE__ */ jsx(Text, { style: s.coverFieldValue, children: payload.for_label || payload.homeowner?.name || "" })
    ] }),
    /* @__PURE__ */ jsxs(View, { style: s.coverField, children: [
      /* @__PURE__ */ jsx(Text, { style: s.coverFieldLabel, children: "PREPARED BY:" }),
      /* @__PURE__ */ jsx(Text, { style: s.coverFieldValue, children: "SUNVIC CONTRACTORS LLC" })
    ] }),
    /* @__PURE__ */ jsxs(View, { style: s.coverField, children: [
      /* @__PURE__ */ jsx(Text, { style: s.coverFieldLabel, children: "PREPARED ON" }),
      /* @__PURE__ */ jsx(Text, { style: s.coverFieldValue, children: payload.prepared_on || "" })
    ] })
  ] });
}
function SectionAPage({ payload, logoUrl }) {
  const c = payload.contractor || {};
  const h = payload.homeowner || {};
  return /* @__PURE__ */ jsxs(Page, { size: "LETTER", style: s.page, children: [
    /* @__PURE__ */ jsx(PageChrome, { logoUrl }),
    /* @__PURE__ */ jsx(SectionBar, { letter: "A", title: "AGREEMENT BACKGROUND" }),
    /* @__PURE__ */ jsx(Text, { style: s.para, children: "This Agreement is made and entered into as of the date this Agreement is signed by both Parties, by and between:" }),
    /* @__PURE__ */ jsx(SubBar, { text: "1 - GENERAL CONTRACTOR INFORMATION" }),
    /* @__PURE__ */ jsx(KVRow, { label: "General Contractor's Legal Name:", value: c.legal_name }),
    /* @__PURE__ */ jsx(KVRow, { label: "Business Address:", value: c.address }),
    /* @__PURE__ */ jsx(KVRow, { label: "License No:", value: c.license_number }),
    /* @__PURE__ */ jsx(KVRow, { label: "Email Address:", value: c.email, isLink: true }),
    /* @__PURE__ */ jsx(SubBar, { text: "2 - HOMEOWNER INFORMATION" }),
    /* @__PURE__ */ jsx(KVRow, { label: "Homeowner(s) Name:", value: h.name }),
    /* @__PURE__ */ jsx(KVRow, { label: "Property Address:", value: h.address }),
    /* @__PURE__ */ jsx(KVRow, { label: "Phone Number:", value: h.phone }),
    /* @__PURE__ */ jsx(KVRow, { label: "Email Address:", value: h.email }),
    /* @__PURE__ */ jsx(SubBar, { text: "3 - CONTRACT TYPE" }),
    /* @__PURE__ */ jsx(Text, { style: s.para, children: payload.contract_type || "Lump Sum Contract" }),
    /* @__PURE__ */ jsx(SubBar, { text: "4 - AGREEMENT SUMMARY" }),
    /* @__PURE__ */ jsx(Text, { style: s.para, children: payload.agreement_summary?.text || "" })
  ] });
}
function SectionBScope({ payload, logoUrl }) {
  const scope = payload.scope_of_work || {};
  const groups = scope.groups || [];
  const total = payload.payment?.total_cents || 0;
  return /* @__PURE__ */ jsxs(Page, { size: "LETTER", style: s.page, children: [
    /* @__PURE__ */ jsx(PageChrome, { logoUrl }),
    /* @__PURE__ */ jsx(SectionBar, { letter: "B", title: "SCOPE OF WORK" }),
    /* @__PURE__ */ jsx(Text, { style: s.paraTight, children: scope.intro }),
    /* @__PURE__ */ jsx(Text, { style: s.scopeTitleBar, children: "WORK TO BE PERFORMED" }),
    /* @__PURE__ */ jsxs(View, { style: s.scopeTable, children: [
      /* @__PURE__ */ jsxs(View, { style: s.scopeHeaderRow, children: [
        /* @__PURE__ */ jsx(View, { style: [s.scopeHeaderCell, { width: 60 }], children: /* @__PURE__ */ jsx(Text, { children: "Task" }) }),
        /* @__PURE__ */ jsx(View, { style: [s.scopeHeaderCell, { width: 110 }], children: /* @__PURE__ */ jsx(Text, { children: " " }) }),
        /* @__PURE__ */ jsx(View, { style: [s.scopeHeaderCell, { flex: 1 }], children: /* @__PURE__ */ jsx(Text, { children: "Description" }) }),
        /* @__PURE__ */ jsx(View, { style: [s.scopeHeaderCell, { width: 62 }], children: /* @__PURE__ */ jsx(Text, { children: "Quantity" }) }),
        /* @__PURE__ */ jsx(View, { style: [s.scopeHeaderCell, { width: 58 }], children: /* @__PURE__ */ jsx(Text, { children: "Unit Price" }) }),
        /* @__PURE__ */ jsx(View, { style: [s.scopeHeaderCell, { width: 68, borderRightWidth: 0 }], children: /* @__PURE__ */ jsx(Text, { children: "Amount" }) })
      ] }),
      groups.map((g, gi) => {
        const tasks = g.tasks || [];
        return /* @__PURE__ */ jsxs(View, { style: s.scopeGroupRow, wrap: false, children: [
          /* @__PURE__ */ jsx(View, { style: s.scopeCategoryCell, children: /* @__PURE__ */ jsx(Text, { style: s.scopeCategoryText, children: g.category }) }),
          /* @__PURE__ */ jsx(View, { style: s.scopeTasksCol, children: tasks.map((t, ti) => /* @__PURE__ */ jsxs(
            View,
            {
              style: ti === tasks.length - 1 ? s.scopeTaskRowLast : s.scopeTaskRow,
              wrap: false,
              children: [
                /* @__PURE__ */ jsx(View, { style: s.scopeTaskLabel, children: /* @__PURE__ */ jsx(Text, { children: t.task || "" }) }),
                /* @__PURE__ */ jsx(View, { style: s.scopeTaskDesc, children: (t.description || []).map((d, di) => /* @__PURE__ */ jsxs(Text, { style: s.scopeTaskDescLine, children: [
                  "\u2500 ",
                  d
                ] }, di)) }),
                /* @__PURE__ */ jsx(View, { style: s.scopeQtyCell, children: /* @__PURE__ */ jsx(Text, { children: t.qty || "Lump Sump" }) }),
                /* @__PURE__ */ jsx(View, { style: s.scopePriceCell, children: /* @__PURE__ */ jsx(Text, { children: t.unit_price_cents ? fmtUSDFromCents(t.unit_price_cents) : "" }) }),
                /* @__PURE__ */ jsx(View, { style: s.scopeAmountCell, children: /* @__PURE__ */ jsx(Text, { children: t.amount_cents ? fmtUSDFromCents(t.amount_cents) : "" }) })
              ]
            },
            ti
          )) })
        ] }, gi);
      }),
      /* @__PURE__ */ jsxs(View, { style: s.scopeTotalRow, children: [
        /* @__PURE__ */ jsx(View, { style: s.scopeTotalLabelCell, children: /* @__PURE__ */ jsx(Text, { children: "TOTAL" }) }),
        /* @__PURE__ */ jsx(View, { style: s.scopeAmountCell, children: /* @__PURE__ */ jsx(Text, { children: fmtUSDFromCents(total) }) })
      ] })
    ] })
  ] });
}
function SectionCPage({ payload, logoUrl }) {
  const p = payload.payment || {};
  const total = p.total_cents || 0;
  const schedule = p.schedule || [];
  const homeownerName = payload.homeowner?.name?.trim() || "____________________";
  return /* @__PURE__ */ jsxs(Page, { size: "LETTER", style: s.page, children: [
    /* @__PURE__ */ jsx(PageChrome, { logoUrl }),
    /* @__PURE__ */ jsx(SectionBar, { letter: "C", title: "PAYMENT TERMS" }),
    /* @__PURE__ */ jsxs(Text, { style: s.para, children: [
      "By signing this agreement, the Homeowner",
      "  ",
      /* @__PURE__ */ jsx(Text, { style: s.bold, children: homeownerName }),
      "  ",
      "agrees to the ",
      /* @__PURE__ */ jsx(Text, { style: s.bold, children: "Total Contract Value" }),
      " below."
    ] }),
    /* @__PURE__ */ jsxs(View, { style: s.costBox, children: [
      /* @__PURE__ */ jsxs(View, { style: s.costRow, children: [
        /* @__PURE__ */ jsx(Text, { style: s.costLabel, children: "Labor Cost" }),
        /* @__PURE__ */ jsx(Text, { style: s.costValue, children: p.labor_cost_cents ? fmtUSDFromCents(p.labor_cost_cents) : "" })
      ] }),
      /* @__PURE__ */ jsxs(View, { style: s.costRow, children: [
        /* @__PURE__ */ jsx(Text, { style: s.costLabel, children: "Materials Cost" }),
        /* @__PURE__ */ jsx(Text, { style: s.costValue, children: p.materials_cost_cents ? fmtUSDFromCents(p.materials_cost_cents) : "" })
      ] }),
      /* @__PURE__ */ jsxs(View, { style: s.costTotalRow, children: [
        /* @__PURE__ */ jsx(Text, { style: s.costTotalLabel, children: "Total Contract Value" }),
        /* @__PURE__ */ jsx(Text, { style: s.costTotalValue, children: fmtUSDFromCents(total) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs(Text, { style: s.para, children: [
      "By signing this agreement, the Homeowner ",
      /* @__PURE__ */ jsx(Text, { style: s.bold, children: homeownerName }),
      " ",
      "agrees to pay the Contract Value of ",
      /* @__PURE__ */ jsx(Text, { style: s.bold, children: fmtUSDFromCents(total) }),
      " in installments, as outlined in the ",
      /* @__PURE__ */ jsx(Text, { style: s.bold, children: "Payment Schedule" }),
      " below :"
    ] }),
    /* @__PURE__ */ jsxs(View, { style: s.schedTable, children: [
      /* @__PURE__ */ jsxs(View, { style: s.schedHeaderRow, children: [
        /* @__PURE__ */ jsx(View, { style: [s.schedHeaderCell, s.schedStage], children: /* @__PURE__ */ jsx(Text, { children: "Payment Stage" }) }),
        /* @__PURE__ */ jsx(View, { style: [s.schedHeaderCell, s.schedPct], children: /* @__PURE__ */ jsx(Text, { children: "%" }) }),
        /* @__PURE__ */ jsx(View, { style: [s.schedHeaderCell, s.schedAmount], children: /* @__PURE__ */ jsx(Text, { children: "Amount" }) }),
        /* @__PURE__ */ jsx(View, { style: [s.schedHeaderCell, s.schedCond, { borderRightWidth: 0 }], children: /* @__PURE__ */ jsx(Text, { children: "Due Condition" }) })
      ] }),
      schedule.map((m, i) => /* @__PURE__ */ jsxs(View, { style: s.schedRow, children: [
        /* @__PURE__ */ jsx(View, { style: [s.schedCell, s.schedStage], children: /* @__PURE__ */ jsx(Text, { children: m.milestone }) }),
        /* @__PURE__ */ jsx(View, { style: [s.schedCell, s.schedPct], children: /* @__PURE__ */ jsxs(Text, { children: [
          m.percent,
          "%"
        ] }) }),
        /* @__PURE__ */ jsx(View, { style: [s.schedCell, s.schedAmount], children: /* @__PURE__ */ jsx(Text, { children: total ? fmtUSDFromCents(milestoneAmountCents(total, m.percent)) : "" }) }),
        /* @__PURE__ */ jsx(View, { style: [s.schedCell, s.schedCond, { borderRightWidth: 0 }], children: /* @__PURE__ */ jsx(Text, { children: m.condition }) })
      ] }, i))
    ] }),
    /* @__PURE__ */ jsx(View, { style: s.subBar, children: /* @__PURE__ */ jsx(Text, { style: s.subBarText, children: "\u2014 Accepted Payment Methods" }) }),
    /* @__PURE__ */ jsxs(View, { style: s.bulletRow, children: [
      /* @__PURE__ */ jsx(Text, { style: s.bulletDot, children: "\u2212" }),
      /* @__PURE__ */ jsx(Text, { style: s.bulletText, children: "Personal or Business Check (made payable to SUNVIC CONTRACTORS LLC)" })
    ] }),
    /* @__PURE__ */ jsxs(View, { style: s.bulletRow, children: [
      /* @__PURE__ */ jsx(Text, { style: s.bulletDot, children: "\u2212" }),
      /* @__PURE__ */ jsx(Text, { style: s.bulletText, children: "Credit or Debit Card (subject to a 4% processing fee)" })
    ] }),
    /* @__PURE__ */ jsxs(View, { style: s.bulletRow, children: [
      /* @__PURE__ */ jsx(Text, { style: s.bulletDot, children: "\u2212" }),
      /* @__PURE__ */ jsx(Text, { style: s.bulletText, children: "Bank Transfer (ACH or Wire Transfer)" })
    ] }),
    /* @__PURE__ */ jsxs(View, { style: s.bulletRow, children: [
      /* @__PURE__ */ jsx(Text, { style: s.bulletDot, children: "\u2212" }),
      /* @__PURE__ */ jsx(Text, { style: s.bulletText, children: "Cash (ONLY accepted with a signed receipt)" })
    ] }),
    /* @__PURE__ */ jsx(Text, { style: [s.para, { marginTop: 10 }], children: payload.invoice_terms?.text || "" })
  ] });
}
function SectionUnforeseenPage({ payload, logoUrl }) {
  return /* @__PURE__ */ jsxs(Page, { size: "LETTER", style: s.page, children: [
    /* @__PURE__ */ jsx(PageChrome, { logoUrl }),
    /* @__PURE__ */ jsxs(View, { style: { marginTop: 20 }, children: [
      /* @__PURE__ */ jsxs(Text, { style: s.para, children: [
        "By signing this agreement, the Homeowner",
        " ",
        /* @__PURE__ */ jsx(Text, { style: s.bold, children: payload.homeowner?.name?.trim() || "____________________" }),
        " agrees that:"
      ] }),
      /* @__PURE__ */ jsx(SubBar, { text: "\u2014 Material Options and Brand Selection:" }),
      /* @__PURE__ */ jsx(Text, { style: s.para, children: payload.material_selection?.text }),
      /* @__PURE__ */ jsx(SubBar, { text: "\u2014 Changes to Work and Materials:" }),
      /* @__PURE__ */ jsx(Text, { style: s.para, children: payload.change_orders?.text }),
      /* @__PURE__ */ jsx(SubBar, { text: "\u2014 Unforeseen Conditions During the Project:" }),
      /* @__PURE__ */ jsx(Text, { style: s.para, children: payload.unforeseen?.text }),
      /* @__PURE__ */ jsx(Text, { style: [s.para, s.bold], children: "(Option-1)" }),
      /* @__PURE__ */ jsx(Text, { style: s.para, children: payload.unforeseen?.option_1?.replace("(Option-1)\n", "") }),
      /* @__PURE__ */ jsx(Text, { style: [s.para, s.bold], children: "(Option-2)" }),
      /* @__PURE__ */ jsx(Text, { style: s.para, children: payload.unforeseen?.option_2?.replace("(Option-2)\n", "") })
    ] })
  ] });
}
function SectionDEFGPage({ payload, logoUrl }) {
  const t = payload.timeline || {};
  const w = payload.warranties || {};
  const perm = payload.permits || {};
  const ins = payload.insurance || {};
  return /* @__PURE__ */ jsxs(Page, { size: "LETTER", style: s.page, children: [
    /* @__PURE__ */ jsx(PageChrome, { logoUrl }),
    /* @__PURE__ */ jsx(SectionBar, { letter: "D", title: "ESTIMATED PROJECT TIMELINE" }),
    /* @__PURE__ */ jsxs(Text, { style: s.paraTight, children: [
      "By signing this agreement, the Homeowner",
      " ",
      /* @__PURE__ */ jsx(Text, { style: s.bold, children: payload.homeowner?.name?.trim() || "____________________" }),
      " ",
      "agrees project will finish within the estimated timeframe :"
    ] }),
    /* @__PURE__ */ jsxs(View, { style: s.bulletRow, children: [
      /* @__PURE__ */ jsx(Text, { style: s.bulletDot, children: "\u2022" }),
      /* @__PURE__ */ jsxs(Text, { style: s.bulletText, children: [
        "Estimated Start Date   ",
        /* @__PURE__ */ jsxs(Text, { style: s.bold, children: [
          t.weeks_to_start ?? 2,
          " weeks"
        ] }),
        " of contract approval and receipt of deposit payment."
      ] })
    ] }),
    /* @__PURE__ */ jsxs(View, { style: s.bulletRow, children: [
      /* @__PURE__ */ jsx(Text, { style: s.bulletDot, children: "\u2022" }),
      /* @__PURE__ */ jsxs(Text, { style: s.bulletText, children: [
        "Estimated Completion Date   ",
        /* @__PURE__ */ jsxs(Text, { style: s.bold, children: [
          t.months_to_complete ?? 6,
          " months"
        ] }),
        " of the project start date."
      ] })
    ] }),
    /* @__PURE__ */ jsx(Text, { style: [s.paraTight, { marginTop: 4 }], children: t.disclaimer }),
    /* @__PURE__ */ jsx(SectionBar, { letter: "E", title: "WARRANTIES" }),
    /* @__PURE__ */ jsx(Text, { style: s.paraTight, children: w.text }),
    /* @__PURE__ */ jsx(Text, { style: s.paraTight, children: w.start_text }),
    /* @__PURE__ */ jsx(Text, { style: s.paraTight, children: w.materials_text }),
    /* @__PURE__ */ jsx(SectionBar, { letter: "F", title: "PERMITS & COMPLIANCE", suffix: "(Check the appropriate box to indicate responsibility.)" }),
    /* @__PURE__ */ jsxs(View, { style: s.checkboxRow, children: [
      /* @__PURE__ */ jsx(Checkbox, { checked: !!perm.contractor_responsible }),
      /* @__PURE__ */ jsx(Text, { style: s.paraTight, children: "SUNVIC CONTRACTORS LLC is responsible for obtaining all required permits necessary for the work." })
    ] }),
    /* @__PURE__ */ jsxs(View, { style: s.checkboxRow, children: [
      /* @__PURE__ */ jsx(Checkbox, { checked: !!perm.homeowner_responsible }),
      /* @__PURE__ */ jsx(Text, { style: s.paraTight, children: "The Homeowner is responsible for obtaining all required permits" })
    ] }),
    /* @__PURE__ */ jsx(SectionBar, { letter: "G", title: "INSURANCE INFORMATION" }),
    /* @__PURE__ */ jsx(Text, { style: s.paraTight, children: ins.text })
  ] });
}
function SectionHIJPage({ payload, logoUrl }) {
  const d = payload.dispute_resolution || {};
  const r = payload.right_to_cancel || {};
  const sig = payload.signature || {};
  return /* @__PURE__ */ jsxs(Page, { size: "LETTER", style: s.page, children: [
    /* @__PURE__ */ jsx(PageChrome, { logoUrl }),
    /* @__PURE__ */ jsx(SectionBar, { letter: "H", title: "DISPUTE RESOLUTION" }),
    /* @__PURE__ */ jsx(Text, { style: s.paraTight, children: d.intro }),
    (d.steps || []).map((step, i) => /* @__PURE__ */ jsxs(Text, { style: s.paraTight, children: [
      /* @__PURE__ */ jsxs(Text, { style: s.bold, children: [
        i + 1,
        "- ",
        step.name,
        " "
      ] }),
      "\u2013 ",
      step.text
    ] }, i)),
    /* @__PURE__ */ jsx(Text, { style: s.paraTight, children: d.footer }),
    /* @__PURE__ */ jsx(SectionBar, { letter: "I", title: "RIGHT TO CANCEL" }),
    /* @__PURE__ */ jsx(View, { style: s.rtcBox, children: (r.text || "").split("\n\n").map((para, i) => {
      const isBigCap = i === 0;
      return /* @__PURE__ */ jsx(Text, { style: isBigCap ? s.rtcLine : s.rtcLineNormal, children: para }, i);
    }) }),
    /* @__PURE__ */ jsx(SectionBar, { letter: "J", title: "SINGNATURE" }),
    /* @__PURE__ */ jsx(Text, { style: s.paraTight, children: sig.intro?.split("\n")[0] }),
    /* @__PURE__ */ jsx(Text, { style: s.paraTight, children: sig.intro?.split("\n").slice(1).join(" ") }),
    /* @__PURE__ */ jsxs(View, { style: s.sigGrid, children: [
      /* @__PURE__ */ jsxs(View, { style: s.sigColumn, children: [
        /* @__PURE__ */ jsx(Text, { style: s.sigColHeader, children: "General Contractor" }),
        /* @__PURE__ */ jsxs(View, { style: s.sigColRow, children: [
          /* @__PURE__ */ jsx(Text, { style: s.sigColLabel, children: "Printed Name:" }),
          /* @__PURE__ */ jsx(Text, { style: s.sigColBlank, children: sig.contractor?.printed_name || "" })
        ] }),
        /* @__PURE__ */ jsxs(View, { style: s.sigColRow, children: [
          /* @__PURE__ */ jsx(Text, { style: s.sigColLabel, children: "Signature:" }),
          /* @__PURE__ */ jsx(Text, { style: s.sigColBlank, children: " " })
        ] })
      ] }),
      /* @__PURE__ */ jsxs(View, { style: s.sigColumn, children: [
        /* @__PURE__ */ jsx(Text, { style: s.sigColHeader, children: "Homeowner" }),
        /* @__PURE__ */ jsxs(View, { style: s.sigColRow, children: [
          /* @__PURE__ */ jsx(Text, { style: s.sigColLabel, children: "Printed Name:" }),
          /* @__PURE__ */ jsx(Text, { style: s.sigColBlank, children: sig.homeowner?.printed_name || "" })
        ] }),
        /* @__PURE__ */ jsxs(View, { style: s.sigColRow, children: [
          /* @__PURE__ */ jsx(Text, { style: s.sigColLabel, children: "Signature:" }),
          /* @__PURE__ */ jsx(Text, { style: s.sigColBlank, children: " " })
        ] }),
        /* @__PURE__ */ jsxs(View, { style: s.sigColRow, children: [
          /* @__PURE__ */ jsx(Text, { style: s.sigColLabel, children: "Date:" }),
          /* @__PURE__ */ jsx(Text, { style: s.sigColBlank, children: sig.homeowner?.dated || "" })
        ] })
      ] })
    ] })
  ] });
}
function ContractPDF({ payload, logoUrl }) {
  return /* @__PURE__ */ jsxs(Document, { children: [
    /* @__PURE__ */ jsx(CoverPage, { payload, logoUrl }),
    /* @__PURE__ */ jsx(SectionAPage, { payload, logoUrl }),
    /* @__PURE__ */ jsx(SectionBScope, { payload, logoUrl }),
    /* @__PURE__ */ jsx(SectionUnforeseenPage, { payload, logoUrl }),
    /* @__PURE__ */ jsx(SectionCPage, { payload, logoUrl }),
    /* @__PURE__ */ jsx(SectionDEFGPage, { payload, logoUrl }),
    /* @__PURE__ */ jsx(SectionHIJPage, { payload, logoUrl })
  ] });
}
var ContractPDF_default = ContractPDF;
export {
  ContractPDF,
  ContractPDF_default as default
};
