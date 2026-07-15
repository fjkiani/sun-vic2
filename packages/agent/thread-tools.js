// Tools exposed inside a chat thread.
//
// Slot-driven design: the agent picks a `slot_key` from a fixed enum via
// `ask_slot`, never composes free-form question text. The server renders the
// canonical question from packages/agent/thread-slots.js.
//
// Actual execution lives in thread-agent.js.

import { ALL_SLOT_KEYS } from './thread-slots.js';

export function threadToolDefs() {
  return [
    {
      name: 'ask_slot',
      description:
        'Ask the user to fill exactly ONE named slot from the template checklist. ' +
        'The server will render the canonical question for that slot — you only pick which slot to ask about. ' +
        'Rules: (1) only ask for a slot that is still empty in gathered_slots (visible in the system prompt); ' +
        '(2) pick the highest-priority still-empty REQUIRED slot; ' +
        '(3) never compose your own question text — the server owns it; ' +
        '(4) never bundle multiple slots into one turn.',
      parameters: {
        type: 'object',
        properties: {
          slot_key: {
            type: 'string',
            description: 'Exact slot key from the checklist (e.g. "homeowner.name").',
            enum: ALL_SLOT_KEYS,
          },
        },
        required: ['slot_key'],
      },
    },
    {
      name: 'generate_document',
      description:
        'Create the document once all REQUIRED slots are filled. The server serializes gathered_slots into the oneshot prompt — you do not need to describe the slots in prose. Call this AT MOST ONCE per thread.',
      parameters: {
        type: 'object',
        properties: {
          // Template is inferred from thread.template but allowed as an explicit override.
          template: {
            type: 'string',
            enum: ['contract', 'invoice'],
            description: 'Optional override. Defaults to thread.template.',
          },
          extra_context: {
            type: 'string',
            description:
              'Optional free-text supplement — e.g. specific scope notes the user typed that don\'t map cleanly to a slot. Appended to the oneshot prompt after the structured slot list.',
          },
        },
        required: [],
      },
    },
    {
      name: 'lookup_document',
      description:
        'Pull the full payload of a prior document (same user only). Use when preparing an invoice to inherit totals/homeowner from a contract, or to reference prior context. `identifier` can be a doc UUID, a doc_number like "CTR-2026-0003", or a homeowner name — the server will pick the best match.',
      parameters: {
        type: 'object',
        properties: {
          identifier: {
            type: 'string',
            description: 'UUID, doc_number, or homeowner name.',
          },
        },
        required: ['identifier'],
      },
    },
    {
      name: 'send_to_client',
      description:
        'Generate the PDF for a document and email it to the client. If `to` is omitted, uses homeowner.email (contract) or bill_to.recipient_email (invoice). Flips the document status to "sent".',
      parameters: {
        type: 'object',
        properties: {
          doc_id: { type: 'string' },
          to: { type: 'string', description: 'Optional override email address.' },
        },
        required: ['doc_id'],
      },
    },
    {
      name: 'set_thread_title',
      description:
        'Set a short human-readable title for this chat thread (e.g. "Smith kitchen reno — 123 Oak"). Call once early when you know what the job is about.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
        },
        required: ['title'],
      },
    },
    {
      name: 'refuse_and_summarize',
      description:
        'Use this ONLY when clarify_count has reached the max (3) and required slots are still empty. Lists exactly which slots are still missing and asks the user what to do next.',
      parameters: {
        type: 'object',
        properties: {
          missing_slot_keys: {
            type: 'array',
            items: { type: 'string', enum: ALL_SLOT_KEYS },
            description: 'The specific slot keys that are still missing.',
          },
        },
        required: ['missing_slot_keys'],
      },
    },
  ];
}
