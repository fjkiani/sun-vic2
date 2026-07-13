// DocumentMirror — dispatches to HtmlContractMirror or HtmlInvoiceMirror based on template.
// Forwards a ref to the scroll container for scroll-sync.

import React, { forwardRef } from 'react';
import { HtmlContractMirror } from './HtmlContractMirror.jsx';
import { HtmlInvoiceMirror } from './HtmlInvoiceMirror.jsx';

export const DocumentMirror = forwardRef(function DocumentMirror(
  { template, payload, onSave, locks, onToggleLock, docNumber },
  ref
) {
  if (template === 'contract') {
    return (
      <HtmlContractMirror
        scrollRef={ref}
        payload={payload}
        template={template}
        onSave={onSave}
        locks={locks}
        onToggleLock={onToggleLock}
      />
    );
  }
  if (template === 'invoice') {
    return (
      <HtmlInvoiceMirror
        scrollRef={ref}
        payload={payload}
        onSave={onSave}
        locks={locks}
        onToggleLock={onToggleLock}
        docNumber={docNumber}
      />
    );
  }
  return (
    <div className="p-4 text-sm text-neutral-500">
      Mirror not available for template: {template}
    </div>
  );
});

export default DocumentMirror;
