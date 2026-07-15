// Tools that are ONLY exposed inside a chat thread (as opposed to the per-doc
// agent chat panel). These wrap the higher-level workflow verbs the thread agent
// needs: ask a question, generate a doc, look up a prior doc, send to client.
//
// Each entry declares:
//   - name, description (for the LLM's tool catalog)
//   - parameters JSON schema
//
// The actual execution happens in thread-agent.js because it needs access to
// user + DB clients, whereas per-doc tools mutate a payload in place.

export function threadToolDefs() {
  return [
    {
      name: 'ask_user',
      description:
        'Ask the homeowner-lookup user ONE clarifying question. Use this ONLY while gathering info before writing a document. The single question must target the most important missing info (homeowner name+address, scope categories, budget or sqft, or timeline).',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The single, specific question to ask.' },
          hint: {
            type: 'string',
            description: 'Optional short hint or example to help the user answer (e.g. "e.g. 4-6 months").',
          },
        },
        required: ['question'],
      },
    },
    {
      name: 'generate_document',
      description:
        'Create a new document (contract or invoice) from the info gathered so far. Only call after you have all required fields OR the user explicitly told you to guess. This is the write step — do not call it twice for the same document.',
      parameters: {
        type: 'object',
        properties: {
          template: { type: 'string', enum: ['contract', 'invoice'] },
          prompt: {
            type: 'string',
            description:
              'Full natural-language description of the job with EVERY known field (homeowner name+address+phone+email, scope categories with rough dollar breakdown, total budget, timeline). This is fed to the oneshot generator.',
          },
        },
        required: ['template', 'prompt'],
      },
    },
    {
      name: 'lookup_document',
      description:
        'Pull the full payload of a prior document (same user only) so you can reference its totals, homeowner details, or scope when drafting a follow-up doc.',
      parameters: {
        type: 'object',
        properties: {
          doc_id: { type: 'string' },
        },
        required: ['doc_id'],
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
        'Set a short human-readable title for this chat thread (e.g. "Nguyen kitchen reno — 665 Denver"). Call once early when you know what the job is about.',
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
        'Use this as the last resort ONLY when you have already asked 3 clarifying questions and still cannot generate the document. Lists exactly which fields you are missing and asks the user what to do next.',
      parameters: {
        type: 'object',
        properties: {
          missing_fields: {
            type: 'array',
            items: { type: 'string' },
            description:
              'The specific fields you still need — e.g. ["homeowner name", "budget or sqft", "timeline"].',
          },
        },
        required: ['missing_fields'],
      },
    },
  ];
}
