import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useModelChoice } from '../components/ModelPickerDropdown.jsx';

// Two paths in one page:
//   1. Manual: pick template → immediately POST /api/documents with defaults → go to editor
//   2. Agentic: type a prompt → POST /api/documents with { prompt, template? } → go to editor
//
// We do NOT ask the user to choose the template for the agentic path — the classifier decides
// (or the user can force it via the "template hint" dropdown).

export function NewDocumentPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const initialTemplate = params.get('template') || 'contract';
  const [prompt, setPrompt] = useState('');
  const [templateHint, setTemplateHint] = useState(initialTemplate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [choice] = useModelChoice();

  async function createManual() {
    setBusy(true); setError('');
    try {
      const { document } = await api.createDocument({ template: templateHint });
      nav(`/documents/${document.id}`);
    } catch (e) { setError(e.message || String(e)); } finally { setBusy(false); }
  }
  async function createAgentic() {
    if (!prompt.trim()) return;
    setBusy(true); setError('');
    try {
      const { document } = await api.createDocument({
        prompt: prompt.trim(),
        template: templateHint || undefined,
        provider: choice.provider,
        model: choice.model,
      });
      nav(`/documents/${document.id}`);
    } catch (e) { setError(e.message || String(e)); } finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">New Document</h1>

      {/* Agentic */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Generate with agent</h2>
          <p className="text-sm text-neutral-500">Describe the job in plain English. The agent picks the right template and fills phases, pricing, and payment schedule.</p>
        </div>
        <textarea rows={6} placeholder="e.g. Full home reno at 665 Denver Blvd, 3200 sqft, gut kitchen + 2 baths + second-story addition"
          value={prompt} onChange={(e) => setPrompt(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sunvic-500 focus:outline-none" />
        <div className="flex items-center gap-3">
          <label className="text-sm flex items-center gap-2">
            <span className="text-neutral-500">Template:</span>
            <select value={templateHint} onChange={(e) => setTemplateHint(e.target.value)} className="rounded-md border border-neutral-300 px-2 py-1 text-sm">
              <option value="">Let the agent decide</option>
              <option value="contract">Contract</option>
              <option value="invoice">Invoice</option>
            </select>
          </label>
          <div className="flex-1" />
          <button disabled={busy || !prompt.trim()} onClick={createAgentic}
            className="px-4 py-2 rounded-md bg-sunvic-500 hover:bg-sunvic-600 text-white text-sm font-semibold disabled:opacity-60">
            {busy ? 'Generating…' : 'Generate document'}
          </button>
        </div>
        {error ? (
          <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded p-3">
            <div className="font-medium">{error}</div>
            {(error.includes('oneshot_failed') || error.includes('no_api_key') || error.includes('quota')) && (
              <div className="text-xs mt-2 text-rose-700">
                Add a valid API key on the <a href="/settings" className="underline font-semibold">Settings page</a>.
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Manual */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Start blank</h2>
          <p className="text-sm text-neutral-500">Create an empty document and edit fields manually.</p>
        </div>
        <div className="flex gap-3">
          <button disabled={busy} onClick={() => { setTemplateHint('contract'); createManual(); }}
            className="px-4 py-2 rounded-md bg-white border border-sunvic-500 text-sunvic-600 hover:bg-sunvic-50 text-sm font-semibold">
            New blank Contract
          </button>
          <button disabled={busy} onClick={() => { setTemplateHint('invoice'); createManual(); }}
            className="px-4 py-2 rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 text-sm font-semibold">
            New blank Invoice
          </button>
        </div>
      </div>
    </div>
  );
}
