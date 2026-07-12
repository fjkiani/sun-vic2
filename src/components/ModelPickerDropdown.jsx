import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { usePersistedState } from '../lib/hooks.js';

// Global model choice — read by the agent panel and the new-doc prompt.
// Persisted in localStorage so the user's selection sticks across sessions.

const KEY = 'sunvic.modelChoice';

export function useModelChoice() {
  const [choice, setChoice] = usePersistedState(KEY, { provider: 'cohere', model: null });
  return [choice, setChoice];
}

export function ModelPickerDropdown() {
  const [choice, setChoice] = useModelChoice();
  const { data } = useQuery({ queryKey: ['models'], queryFn: api.listModels });
  const providers = data?.providers || [];
  useEffect(() => {
    // If the selected provider is no longer available, fall back to the first available one.
    const p = providers.find((x) => x.id === choice.provider);
    if (providers.length && !p?.available) {
      const first = providers.find((x) => x.available);
      if (first && first.id !== choice.provider) setChoice({ provider: first.id, model: first.default_model });
    }
  }, [providers, choice.provider, setChoice]);

  return (
    <label className="text-sm flex items-center gap-2">
      <span className="text-neutral-500">Model:</span>
      <select
        className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sunvic-500"
        value={choice.provider}
        onChange={(e) => {
          const p = providers.find((x) => x.id === e.target.value);
          setChoice({ provider: e.target.value, model: p?.default_model || null });
        }}
      >
        {providers.length === 0 && <option value="cohere">Cohere (default)</option>}
        {providers.map((p) => (
          <option key={p.id} value={p.id} disabled={!p.available}>
            {p.label}{!p.available ? ' — not configured' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
