// ColumnHeader — sticky header row for each of the 3 editor columns.
// Renders title + collapse toggle + optional extra controls (children).

import React from 'react';

export function ColumnHeader({ title, subtitle, collapsed, onToggleCollapse, children }) {
  return (
    <div className="flex-shrink-0 px-3 py-2 border-b border-neutral-200 bg-white flex items-center justify-between gap-2 min-h-[40px]">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onToggleCollapse}
          className="w-6 h-6 flex-shrink-0 rounded hover:bg-neutral-100 flex items-center justify-center text-neutral-500 text-xs"
          title={collapsed ? 'Expand column' : 'Collapse column'}
        >
          {collapsed ? '›' : '‹'}
        </button>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-xs font-semibold text-neutral-800 truncate">{title}</div>
            {subtitle && <div className="text-[10px] text-neutral-500 truncate">{subtitle}</div>}
          </div>
        )}
      </div>
      {!collapsed && <div className="flex items-center gap-1 flex-shrink-0">{children}</div>}
    </div>
  );
}

export default ColumnHeader;
