import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { usePersistedState } from '../lib/hooks.js';

// Global model choice — read by the agent panel and the new-doc prompt.
// Persisted in localStorage so the user's selection sticks across sessions.

const KEY = 'sunvic.modelChoice';

export function useModelChoice() {
  const [choice, setChoice] = usePersistedState(KEY, { provider: 'cohere', model: null });
  return [choice, setChoice];
}

/**
 * Paste-in-place popover: when a user selects a provider that isn't configured,
 * open a small popover to paste an API key inline.
 */
function InlineKeyPopover({ providerId, providerLabel, onClose, onSaved }) {
  const [value, setValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [error, setError] = useState(null);
  const qc = useQueryClient();
  const saveMut = useMutation({
    mutationFn: (v) => api.saveUserKey(providerId, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['models'] });
      qc.invalidateQueries({ queryKey: ['user-keys'] });
      onSaved?.();
    },
    onError: (e) => setError(e?.message || String(e)),
  });

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center pt-20"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg shadow-xl border border-neutral-200 p-4 w-96"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-neutral-900">Add {providerLabel} key</div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900">×</button>
        </div>
        <p className="text-xs text-neutral-600 mb-3">
          Paste your API key — it's encrypted with AES-256-GCM before storage. Falls back to environment key if unset.
        </p>
        <div className="flex gap-2 mb-2">
          <input
            type={showValue ? 'text' : 'password'}
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            placeholder="Paste key"
            className="flex-1 border border-neutral-300 rounded px-2 py-1 text-sm font-mono"
            autoFocus
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowValue((s) => !s)}
            disabled={!value}
            className="px-2 py-1 border border-neutral-300 rounded text-xs disabled:opacity-40"
          >
            {showValue ? 'Hide' : 'Reveal'}
          </button>
        </div>
        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mb-2">
            {error}
          </div>
        )}
        <div className="flex justify-between items-center">
          <a href="/settings" className="text-xs text-sunvic-600 hover:underline">Open Settings</a>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1 text-sm text-neutral-600">
              Cancel
            </button>
            <button
              disabled={!value || saveMut.isPending}
              onClick={() => saveMut.mutate(value)}
              className="px-4 py-1 bg-sunvic-500 text-white text-sm rounded disabled:opacity-40"
            >
              {saveMut.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModelPickerDropdown() {
  const [choice, setChoice] = useModelChoice();
  const { data } = useQuery({ queryKey: ['models'], queryFn: api.listModels });
  const providers = data?.providers || [];
  const [popoverFor, setPopoverFor] = useState(null);

  useEffect(() => {
    // If the selected provider is no longer available AND user has no user_key stored for it,
    // fall back to first available.
    const p = providers.find((x) => x.id === choice.provider);
    if (providers.length && !p?.available) {
      const first = providers.find((x) => x.available);
      if (first && first.id !== choice.provider) setChoice({ provider: first.id, model: first.default_model });
    }
  }, [providers, choice.provider, setChoice]);

  const activeProvider = providers.find((p) => p.id === choice.provider);
  const showAddKey = activeProvider && !activeProvider.available;

  return (
    <>
      <label className="text-sm flex items-center gap-2">
        <span className="text-neutral-500">Model:</span>
        <select
          className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sunvic-500"
          value={choice.provider}
          onChange={(e) => {
            const p = providers.find((x) => x.id === e.target.value);
            setChoice({ provider: e.target.value, model: p?.default_model || null });
            if (p && !p.available) {
              // Immediately prompt for key paste
              setPopoverFor({ id: p.id, label: p.label });
            }
          }}
        >
          {providers.length === 0 && <option value="cohere">Cohere (default)</option>}
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}{!p.available ? ' — add key' : (p.user_key_present ? ' ✓' : '')}
            </option>
          ))}
        </select>
        {showAddKey && (
          <button
            type="button"
            onClick={() => setPopoverFor({ id: activeProvider.id, label: activeProvider.label })}
            className="text-xs px-2 py-0.5 bg-amber-100 text-amber-800 rounded border border-amber-300 hover:bg-amber-200"
          >
            + Add key
          </button>
        )}
      </label>
      {popoverFor && (
        <InlineKeyPopover
          providerId={popoverFor.id}
          providerLabel={popoverFor.label}
          onClose={() => setPopoverFor(null)}
          onSaved={() => setPopoverFor(null)}
        />
      )}
    </>
  );
}
