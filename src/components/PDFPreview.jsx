import React, { useMemo, useState, useEffect } from 'react';
import { PDFViewer } from '@react-pdf/renderer';
import { InvoicePDF, ContractPDF } from '../../packages/templates/pdf/index.js';

function useDebounced(value, ms = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function PDFPreview({ template, payload, docNumber }) {
  const logoUrl = useMemo(() => '/logo/sunvic.png', []);
  const Component = template === 'contract' ? ContractPDF : InvoicePDF;

  const debouncedPayload = useDebounced(payload, 400);
  const regenerating = payload !== debouncedPayload;

  return (
    <div className="pdf-frame overflow-hidden h-full relative bg-neutral-800">
      {regenerating && (
        <div className="absolute top-2 right-2 z-10 bg-sunvic-500 text-white text-xs px-2 py-1 rounded shadow">
          Regenerating…
        </div>
      )}
      <PDFViewer style={{ width: '100%', height: '100%', border: 0 }} showToolbar>
        <Component payload={debouncedPayload} docNumber={docNumber} logoUrl={logoUrl} />
      </PDFViewer>
    </div>
  );
}

export default PDFPreview;
