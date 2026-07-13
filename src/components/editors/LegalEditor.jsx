import React from 'react';
import { LockableField } from '../LockableField.jsx';

export function LegalEditor({ doc, onSave, onToggleLock }) {
  const p = doc.payload;
  const locks = doc.locks || {};
  const isContract = doc.template === 'contract';
  return (
    <div className="space-y-3">
      <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-2 py-2">
        Legal blocks are <strong>locked by default</strong>. Unlock only if a specific job requires custom terms — the defaults reflect canonical Sunvic language and NJ Home Improvement Contract Act requirements.
      </div>

      {isContract && ['warranties','permits','insurance','dispute_resolution','right_to_cancel'].map((key) => (
        <SectionCard key={key} title={key.replace(/_/g,' ').replace(/\b\w/g, (c) => c.toUpperCase())}>
          <LockableField label="Text" path={`${key}.text`} as="textarea" rows={10}
            value={p[key]?.text} locked={locks[`${key}.text`]}
            onToggleLock={() => onToggleLock(`${key}.text`)}
            onChange={(v) => onSave({ [`${key}.text`]: v })} />
        </SectionCard>
      ))}

      <SectionCard title="Contractor">
        {['legal_name','address','phone','email','license_number','website'].map((k) => (
          <LockableField key={k} label={k.replace(/_/g,' ')} path={`contractor.${k}`}
            value={p.contractor?.[k]} locked={locks[`contractor.${k}`]}
            onToggleLock={() => onToggleLock(`contractor.${k}`)}
            onChange={(v) => onSave({ [`contractor.${k}`]: v })} />
        ))}
      </SectionCard>
    </div>
  );
}
