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

const ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

export function PDFPreview({ template, payload, docNumber }) {
  const logoUrl = useMemo(() => '/logo/sunvic.png', []);
  const Component = template === 'contract' ? ContractPDF : InvoicePDF;

  const debouncedPayload = useDebounced(payload, 400);
  const regenerating = payload !== debouncedPayload;

  const [zoom, setZoom] = useState(1.0);

  const zoomIn  = () => {
    const cur = ZOOM_LEVELS.findIndex((z) => Math.abs(z - zoom) < 0.001);
    const next = cur < ZOOM_LEVELS.length - 1 ? ZOOM_LEVELS[cur + 1] : ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
    setZoom(next);
  };
  const zoomOut = () => {
    const cur = ZOOM_LEVELS.findIndex((z) => Math.abs(z - zoom) < 0.001);
    const next = cur > 0 ? ZOOM_LEVELS[cur - 1] : ZOOM_LEVELS[0];
    setZoom(next);
  };
  const zoomReset = () => setZoom(1.0);

  return (
    <div className="pdf-frame overflow-hidden h-full relative bg-neutral-800 flex flex-col">
      {/* Zoom toolbar */}
      <div className="flex-shrink-0 bg-neutral-900 text-white text-xs px-2 py-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            className="w-6 h-6 rounded hover:bg-neutral-700 disabled:opacity-40"
            disabled={zoom <= ZOOM_LEVELS[0]}
            title="Zoom out"
          >−</button>
          <button
            onClick={zoomReset}
            className="min-w-[3.5rem] px-2 py-0.5 rounded hover:bg-neutral-700 font-mono"
            title="Reset to 100%"
          >{Math.round(zoom * 100)}%</button>
          <button
            onClick={zoomIn}
            className="w-6 h-6 rounded hover:bg-neutral-700 disabled:opacity-40"
            disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
            title="Zoom in"
          >+</button>
        </div>
        {regenerating && (
          <div className="bg-sunvic-500 text-white text-[10px] px-2 py-0.5 rounded">Regenerating…</div>
        )}
        <div className="text-[10px] text-neutral-400">PDF preview</div>
      </div>
      {/* PDF surface with scaled inner iframe */}
      <div className="flex-1 overflow-auto bg-neutral-800">
        <div
          style={{
            width: `${100 / zoom}%`,
            height: `${100 / zoom}%`,
            transform: `scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          <PDFViewer style={{ width: '100%', height: '100%', border: 0 }} showToolbar={false}>
            <Component payload={debouncedPayload} docNumber={docNumber} logoUrl={logoUrl} />
          </PDFViewer>
        </div>
      </div>
    </div>
  );
}

export default PDFPreview;
