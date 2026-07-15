// POST /api/threads/:id/turn
// Body: { message: string, provider?: string, model?: string }
// Runs one thread-agent turn against the given thread id.

import { json, handleOptions, parseJson, bearer } from './_shared/http.js';
import { verifyUser } from '../../packages/db/supabase.js';
import { getThread, listMessages } from '../../packages/db/threads.js';
import { runThreadTurn } from '../../packages/agent/thread-agent.js';

// Same dispatcher shape as agent-chat.js so send_to_client (which fans
// out to generate_pdf + email_document) can reuse existing endpoints.
async function makeDispatcher({ event }) {
  const baseUrl =
    process.env.URL ||
    process.env.PUBLIC_SITE_URL ||
    (event.headers?.origin ? String(event.headers.origin) : null) ||
    'http://localhost:8888';
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  return async function dispatch({ name, args, docId }) {
    if (name === 'generate_pdf') {
      const res = await fetch(`${baseUrl}/api/documents/${docId}/pdf`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      });
      return res.ok ? await res.json() : { error: 'pdf_dispatch_failed', status: res.status };
    }
    if (name === 'email_document') {
      const res = await fetch(`${baseUrl}/api/documents/${docId}/email`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: args.to }),
      });
      return res.ok ? await res.json() : { error: 'email_dispatch_failed', status: res.status };
    }
    return { error: 'unknown_dispatch' };
  };
}

export const handler = async (event) => {
  const pre = handleOptions(event);
  if (pre) return pre;
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const { user, error: authErr } = await verifyUser(bearer(event));
  if (!user) return json(401, { error: 'unauthorized', detail: authErr });

  const pathNoQuery = String(event.path || '').split('?')[0];
  const parts = pathNoQuery.split('/').filter(Boolean);
  // /api/threads/:id/turn  →  parts = ['api','threads',':id','turn']
  // Vercel may also set event.queryStringParameters.id
  const threadId = event.queryStringParameters?.id || parts[parts.length - 2];
  if (!threadId) return json(400, { error: 'missing_thread_id' });

  const body = parseJson(event);
  if (!body) return json(400, { error: 'invalid_json' });
  const { message, provider = 'openrouter', model } = body;
  if (!message || !String(message).trim()) return json(400, { error: 'empty_message' });

  const thread = await getThread(threadId, user.id);
  if (!thread) return json(404, { error: 'thread_not_found' });

  const messages = await listMessages(threadId);

  try {
    const dispatch = await makeDispatcher({ event });
    const turn = await runThreadTurn({
      thread,
      messages,
      userMessage: message,
      user,
      providerId: provider,
      model,
      dispatch,
    });
    return json(200, {
      thread: turn.thread,
      reply: turn.assistant_message,
      applied_tool_calls: turn.applied_tool_calls,
      refused: turn.refused,
      new_documents: turn.new_documents.map((d) => ({
        id: d.id,
        template: d.template,
        doc_number: d.doc_number,
        status: d.status,
        title: d.title,
        total_cents: d.total_cents,
        project_id: d.project_id,
      })),
      iterations: turn.iterations,
    });
  } catch (e) {
    return json(500, { error: 'thread_turn_failed', detail: String(e?.message || e) });
  }
};
