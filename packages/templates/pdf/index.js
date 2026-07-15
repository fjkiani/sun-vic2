// Barrel — picks the right PDF component for a template.

import { InvoicePDF } from './InvoicePDF.js';
import { ContractPDF } from './ContractPDF.js';

export { InvoicePDF, ContractPDF };

export function pdfComponentFor(template) {
  return template === 'contract' ? ContractPDF : InvoicePDF;
}
