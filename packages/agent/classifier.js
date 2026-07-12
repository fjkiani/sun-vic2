// Lightweight template classifier. Uses the LLM to decide whether a raw prompt maps to
// a Contract (scope + phases + payment schedule + legal) or an Invoice (line items + totals).
// Keyword pre-filter runs first to short-circuit obvious cases and save an LLM call.

import { getProvider } from './providers/index.js';

const CONTRACT_HINTS = /\b(contract|agreement|scope of work|payment schedule|deposit|milestone|warranty|permit|kickoff|start date|substantial completion|homeowner)\b/i;
const INVOICE_HINTS  = /\b(invoice|bill|due date|remaining balance|amount due|tax|paid|net-?30|net-?15|receipt)\b/i;

export async function classifyTemplate(prompt, { providerId } = {}) {
  if (!prompt || typeof prompt !== 'string') return 'invoice';

  const contractHit = CONTRACT_HINTS.test(prompt);
  const invoiceHit  = INVOICE_HINTS.test(prompt);
  if (contractHit && !invoiceHit) return 'contract';
  if (invoiceHit && !contractHit) return 'invoice';

  // Ambiguous → LLM classifier.
  const provider = getProvider(providerId || 'cohere');
  const system = 'You are a template classifier for a NJ home-improvement contractor. Return one word only: "contract" or "invoice".';
  const user = [
    'Classify the following user prompt into "contract" or "invoice":',
    '- Choose "contract" when it describes a new job scope, phases, warranty, deposits, or a payment schedule.',
    '- Choose "invoice" when it describes billing, line items with quantities and rates, due dates, or a receipt.',
    'When both are plausible, prefer "contract" if the prompt sounds like the start of a new project, otherwise "invoice".',
    '',
    `PROMPT: ${prompt}`,
  ].join('\n');

  try {
    const { text } = await provider.generate({
      system, prompt: user, temperature: 0, max_tokens: 8,
    });
    const first = (text || '').trim().toLowerCase();
    if (first.startsWith('contract')) return 'contract';
    if (first.startsWith('invoice'))  return 'invoice';
  } catch {
    // fall through
  }
  // Default to contract when both hint patterns hit — more useful for Sunvic's flow.
  return contractHit ? 'contract' : 'invoice';
}
