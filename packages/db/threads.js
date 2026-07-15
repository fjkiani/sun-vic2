// CRUD helpers for chat_threads + chat_messages, plus a project-scoped memory
// helper used to prime the agent's context.

import { serviceClient } from './supabase.js';

// Turn a Supabase PostgrestError into a plain Error with useful message.
function pgErr(prefix, error) {
  const msg = [
    prefix,
    error?.message,
    error?.code && `code=${error.code}`,
    error?.details,
    error?.hint,
  ].filter(Boolean).join(' | ');
  const e = new Error(msg || prefix);
  e.pgCode = error?.code;
  return e;
}


// ────────────────────────────────────────────────────────────
// Threads
// ────────────────────────────────────────────────────────────

export async function listThreads(userId, { projectId, limit = 40, q } = {}) {
  let query = serviceClient()
    .from('chat_threads')
    .select('id, title, stage, project_id, clarify_count, last_message_at, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (projectId) query = query.eq('project_id', projectId);
  if (q) query = query.ilike('title', `%${q}%`);
  const { data, error } = await query;
  if (error) throw pgErr('listThreads', error);
  return data || [];
}

export async function getThread(threadId, userId) {
  const { data, error } = await serviceClient()
    .from('chat_threads')
    .select('*')
    .eq('id', threadId)
    .eq('user_id', userId)
    .single();
  if (error) return null;
  return data;
}

export async function createThread(userId, { title, projectId } = {}) {
  const insert = {
    user_id: userId,
    title: title || 'New chat',
    project_id: projectId || null,
    stage: 'gathering',
    clarify_count: 0,
  };
  const { data, error } = await serviceClient()
    .from('chat_threads')
    .insert(insert)
    .select('*')
    .single();
  if (error) throw pgErr('threads.write', error);
  return data;
}

export async function updateThread(threadId, userId, patch) {
  const allowed = ['title', 'stage', 'clarify_count', 'project_id', 'last_message_at'];
  const filtered = Object.fromEntries(
    Object.entries(patch || {}).filter(([k]) => allowed.includes(k))
  );
  if (Object.keys(filtered).length === 0) return await getThread(threadId, userId);
  const { data, error } = await serviceClient()
    .from('chat_threads')
    .update(filtered)
    .eq('id', threadId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw pgErr('threads.write', error);
  return data;
}

export async function deleteThread(threadId, userId) {
  const { error } = await serviceClient()
    .from('chat_threads')
    .delete()
    .eq('id', threadId)
    .eq('user_id', userId);
  if (error) throw pgErr('deleteThread', error);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// Messages
// ────────────────────────────────────────────────────────────

export async function listMessages(threadId) {
  const { data, error } = await serviceClient()
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });
  if (error) throw pgErr('listMessages', error);
  return data || [];
}

export async function appendMessage(threadId, message) {
  const row = {
    thread_id: threadId,
    role: message.role,
    content: message.content ?? '',
    tool_calls: message.tool_calls || null,
    tool_call_id: message.tool_call_id || null,
    meta: message.meta || {},
  };
  const { data, error } = await serviceClient()
    .from('chat_messages')
    .insert(row)
    .select('*')
    .single();
  if (error) throw pgErr('appendMessage', error);
  await serviceClient()
    .from('chat_threads')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', threadId);
  return data;
}

export async function appendMessages(threadId, messages) {
  if (!messages?.length) return [];
  const rows = messages.map((m) => ({
    thread_id: threadId,
    role: m.role,
    content: m.content ?? '',
    tool_calls: m.tool_calls || null,
    tool_call_id: m.tool_call_id || null,
    meta: m.meta || {},
  }));
  const { data, error } = await serviceClient()
    .from('chat_messages')
    .insert(rows)
    .select('*');
  if (error) throw pgErr('appendMessages', error);
  await serviceClient()
    .from('chat_threads')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', threadId);
  return data;
}

export async function getThreadWithMessages(threadId, userId) {
  const thread = await getThread(threadId, userId);
  if (!thread) return null;
  const messages = await listMessages(threadId);
  return { thread, messages };
}

// ────────────────────────────────────────────────────────────
// Memory helpers — pull recent projects + doc summaries for a user.
// ────────────────────────────────────────────────────────────

export async function listUserMemory(userId, { limit = 20 } = {}) {
  const svc = serviceClient();
  const [projRes, docRes] = await Promise.all([
    svc
      .from('projects')
      .select('id, name, homeowner_name, property_address, contract_total_cents, status, updated_at')
      .eq('created_by', userId)
      .order('updated_at', { ascending: false })
      .limit(limit),
    svc
      .from('documents')
      .select('id, doc_number, template, status, total_cents, client_name, summary, project_id, updated_at')
      .eq('created_by', userId)
      .order('updated_at', { ascending: false })
      .limit(limit),
  ]);
  if (projRes.error) throw pgErr('memory.projects', projRes.error);
  if (docRes.error) throw pgErr('memory.documents', docRes.error);
  return {
    projects: projRes.data || [],
    documents: docRes.data || [],
  };
}
