// Barrel — picks the right PDF component for a template.

import { InvoicePDF } from './InvoicePDF.jsx';
import { ContractPDF } from './ContractPDF.jsx';

export { InvoicePDF, ContractPDF };

export function pdfComponentFor(template) {
  return template === 'contract' ? ContractPDF : InvoicePDF;
}
