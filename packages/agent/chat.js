// Chat orchestrator — used by /api/agent/chat.
// Runs a tool-loop for up to N iterations. On each turn:
//   1. Ask provider.chat() with the current messages + tool defs
//   2. Execute any tool_calls locally against a working copy of the payload
//   3. Append tool results back into the message history
//   4. Repeat until the model returns a plain text reply (no tool_calls) OR we hit the limit
//
// The caller (agent-chat.js) is responsible for persisting the final payload + revision + agent messages.

import { getProvider } from './providers/index.js';
import { executeToolCall, toolDefs } from './tools.js';
import { isLocked } from '../../netlify/functions/_shared/locks.js';

const MAX_ITERATIONS = 6;

const CHAT_SYSTEM = (template) => `You are Sunvic Construction's document assistant, helping edit a ${template} in progress.
You have tools that modify the document payload safely. Use them instead of asking the user to make edits themselves.

Rules:
- Prefer calling tools over describing changes. When the user asks for a change, DO it.
- After making changes, offer a brief confirmation naming what changed. Do not repeat the whole doc.
- Never modify contractor identity, licensing, or legal blocks (warranties/permits/insurance/dispute_resolution/right_to_cancel) — they are locked. If asked, explain that legal text is locked by default and can be unlocked in the editor.
- Sum-of-percents in payment.schedule (contract) must equal 100. Fix mismatches automatically.
- When adding phases, use itemized tasks with realistic New Jersey pricing.
- If the user wants to email or generate a PDF, call the corresponding tool.
- Keep replies short. Never dump the entire JSON payload back to the user.`;

/**
 * Run one chat turn.
 * @param {object} args
 * @param {string} args.providerId
 * @param {string} [args.model]
 * @param {'contract'|'invoice'} args.template
 * @param {object} args.payload
 * @param {object} args.locks
 * @param {string} args.docId
 * @param {Array<{role: 'user'|'assistant'|'tool', content: string, tool_calls?: Array, tool_call_id?: string}>} args.history
 * @param {function} [args.dispatch] — async ({ name, args, docId }) → any (invoked for generate_pdf / email_document)
 * @returns {Promise<{reply: string, updated_payload: object, applied_tool_calls: Array, refused: Array, iterations: number}>}
 */
export async function runChatTurn({
  providerId = 'cohere',
  model,
  template,
  payload,
  locks,
  docId,
  history,
  dispatch,
}) {
  const provider = getProvider(providerId, { model });
  if (!provider.supportsTools()) {
    throw new Error(`Provider "${providerId}" does not support tools. Use the one-shot generator instead.`);
  }

  const tools = toolDefs(template);
  const messages = [...history];
  let workingPayload = payload;
  const appliedCalls = [];
  const refused = [];
  let finalReply = '';
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const { text, tool_calls } = await provider.chat({
      system: CHAT_SYSTEM(template),
      messages,
      tools,
      temperature: 0.3,
      max_tokens: 1200,
    });

    // If the model returned plain text with no tool calls, we're done.
    if (!tool_calls?.length) {
      finalReply = text || '';
      messages.push({ role: 'assistant', content: finalReply });
      break;
    }

    // Otherwise execute each tool call.
    messages.push({ role: 'assistant', content: text || '', tool_calls });

    for (const call of tool_calls) {
      // Pre-check locks for set_field early to avoid unnecessary work.
      if (call.name === 'set_field') {
        const path = call.arguments?.path;
        if (path && isLocked(locks, path)) {
          refused.push({ tool: call.name, path, reason: 'locked' });
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({ ok: false, error: 'locked', locked_paths: [path] }),
          });
          continue;
        }
      }

      const result = await executeToolCall({
        payload: workingPayload,
        template,
        locks,
        docId,
        dispatch,
        call,
      });

      if (result.applied) {
        workingPayload = result.payload;
        appliedCalls.push({ tool: call.name, args: call.arguments, ...(result.side_effect ? { side_effect: result.side_effect } : {}) });
      } else {
        refused.push({ tool: call.name, args: call.arguments, error: result.error, locked: result.refused_locks });
      }

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify({
          ok: !!result.applied,
          error: result.error,
          side_effect: result.side_effect,
        }),
      });
    }
  }

  if (!finalReply && iterations === MAX_ITERATIONS) {
    finalReply = 'I made the changes requested. (Reached the tool-call limit — let me know if you want to keep going.)';
  }

  return { reply: finalReply, updated_payload: workingPayload, applied_tool_calls: appliedCalls, refused, iterations };
}
