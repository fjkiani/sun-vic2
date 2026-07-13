import React from 'react';

/**
 * Simple bordered card used to group related fields inside an editor.
 */
export function SectionCard({ title, children }) {
  return (
    <div className="border border-neutral-200 rounded-lg p-3 space-y-2 bg-neutral-50">
      <div className="text-xs uppercase tracking-wide text-neutral-500 font-semibold">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export default SectionCard;
