import React from 'react';

// Work — unified Projects + Documents, filterable. WS-A provides the shell; WS-F fills
// the body (tabs All/Projects/Contracts/Invoices + status filters + search).
export function WorkPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-neutral-900 mb-1">Work</h1>
      <p className="text-sm text-neutral-500">Projects, contracts, and invoices in one place.</p>
      {/* WS-F: WorkFilters + unified list */}
    </div>
  );
}
