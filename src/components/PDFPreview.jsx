import React, { useMemo } from 'react';
import { PDFViewer } from '@react-pdf/renderer';
import { InvoicePDF, ContractPDF } from '../../packages/templates/pdf/index.js';

// Live browser preview using @react-pdf/renderer's PDFViewer. This renders the exact same
// component the server renders in document-pdf.js, so what you see is what gets emailed.

export function PDFPreview({ template, payload, docNumber }) {
  const logoUrl = useMemo(() => '/logo/sunvic.png', []);
  const Component = template === 'contract' ? ContractPDF : InvoicePDF;
  return (
    <div className="pdf-frame overflow-hidden h-[80vh]">
      <PDFViewer style={{ width: '100%', height: '100%', border: 0 }} showToolbar>
        <Component payload={payload} docNumber={docNumber} logoUrl={logoUrl} />
      </PDFViewer>
    </div>
  );
}
