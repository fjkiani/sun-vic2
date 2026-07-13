import React from 'react';
import { getScopePreset } from '../../packages/templates/defaults.js';

/**
 * <PresetLibraryDropdown onInsert={(groups) => ...} />
 * Emits an array of groups (shape: [{category, tasks: [...]}]) via onInsert.
 */
export function PresetLibraryDropdown({ onInsert }) {
  return (
    <select
      className="border border-neutral-300 rounded px-2 py-1 text-xs"
      defaultValue=""
      onChange={(e) => {
        if (!e.target.value) return;
        if (e.target.value === 'full_addition') {
          onInsert(getScopePreset('full_addition'));
        } else {
          alert('Preset coming soon');
        }
        e.target.value = '';
      }}
    >
      <option value="">Insert preset…</option>
      <option value="full_addition">Full addition</option>
      <option value="bath_remodel">Bathroom remodel (coming soon)</option>
      <option value="kitchen_remodel">Kitchen remodel (coming soon)</option>
    </select>
  );
}
