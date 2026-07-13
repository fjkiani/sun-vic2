import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';

/**
 * Settings page — manage per-user API keys.
 * Users paste keys here; the server stores them AES-256-GCM encrypted.
 */

const PROVIDERS = [
  { id: 'openrouter', label: 'OpenRouter', help: 'sk-or-v1-... — used for gpt-oss and OpenAI-compatible models.' },
  { id: 'cohere', label: 'Cohere', help: 'cohere_... — Command A tool-calling.' },
  { id: 'gemma', label: 'Google Gemma', help: 'Google AI Studio API key — no tool-calling, oneshot mode only.' },
  { id: 'resend', label: 'Resend (email)', help: 're_... — for outbound email delivery.' },
];

function KeyRow({ provider }) {
  const qc = useQueryClient();
  const { data: models } = useQuery({ queryKey: ['models'], queryFn: api.listModels });
  const { data: keys } = useQuery({ queryKey: ['user-keys'], queryFn: api.listUserKeys });
  const existing = (keys?.keys || []).find((k) => k.provider === provider.id);
  const modelStatus = (models?.providers || []).find((p) => p.id === provider.id);

  const [value, setValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [error, setError] = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const saveMut = useMutation({
    mutationFn: (v) => api.saveUserKey(provider.id, v),
    onSuccess: () => {
      setValue('');
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
      qc.invalidateQueries({ queryKey: ['user-keys'] });
      qc.invalidateQueries({ queryKey: ['models'] });
    },
    onError: (e) => setError(e?.message || String(e)),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.deleteUserKey(provider.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-keys'] });
      qc.invalidateQueries({ queryKey: ['models'] });
    },
  });

  return (
    <div className="border border-neutral-200 rounded-lg p-4 mb-4 bg-white">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="font-semibold text-neutral-900">{provider.label}</div>
          <div className="text-xs text-neutral-500 mt-1">{provider.help}</div>
        </div>
        <div className="text-xs text-right">
          <div>
            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-mono ${
              modelStatus?.available ? 'bg-green-100 text-green-800' : 'bg-neutral-200 text-neutral-600'
            }`}>
              {modelStatus?.available ? 'READY' : 'NOT CONFIGURED'}
            </span>
          </div>
          {existing && (
            <div className="text-neutral-500 mt-1">
              Ends in <span className="font-mono">•••{existing.fingerprint}</span>
            </div>
          )}
          {modelStatus?.user_key_present && (
            <div className="text-sunvic-600 mt-1 text-[10px]">
              Using your key
            </div>
          )}
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-xs text-neutral-600 mb-1">
          {existing ? 'Replace key' : 'Paste key'}
        </label>
        <div className="flex gap-2">
          <input
            type={showValue ? 'text' : 'password'}
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            placeholder={`Paste your ${provider.label} API key`}
            className="flex-1 border border-neutral-300 rounded px-3 py-2 text-sm font-mono"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowValue((s) => !s)}
            className="px-3 py-2 border border-neutral-300 rounded text-xs hover:bg-neutral-50"
            disabled={!value}
          >
            {showValue ? 'Hide' : 'Reveal'}
          </button>
          <button
            type="button"
            disabled={!value || saveMut.isPending}
            onClick={() => saveMut.mutate(value)}
            className="px-4 py-2 bg-sunvic-500 text-white text-sm font-medium rounded disabled:opacity-40 hover:bg-sunvic-600"
          >
            {saveMut.isPending ? 'Saving…' : (existing ? 'Update' : 'Save')}
          </button>
          {existing && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete stored ${provider.label} key?`)) deleteMut.mutate();
              }}
              className="px-3 py-2 border border-red-300 text-red-700 text-xs rounded hover:bg-red-50"
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? '…' : 'Delete'}
            </button>
          )}
        </div>
        {error && (
          <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
            {error}
          </div>
        )}
        {savedFlash && (
          <div className="mt-2 text-xs text-green-800 bg-green-50 border border-green-200 rounded px-2 py-1">
            Saved. Encrypted with AES-256-GCM.
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-neutral-900 mb-1">Settings</h1>
      <p className="text-sm text-neutral-600 mb-6">
        Manage your API keys. Keys are encrypted with AES-256-GCM before being stored; the server never returns
        the plaintext. If both an environment key and your key are present, your key wins.
      </p>

      <h2 className="text-lg font-semibold text-neutral-800 mb-3">API Keys</h2>
      {PROVIDERS.map((p) => <KeyRow key={p.id} provider={p} />)}
    </div>
  );
}
