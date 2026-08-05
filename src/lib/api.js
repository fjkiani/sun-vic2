// Thin fetch wrapper — attaches the Supabase JWT and handles JSON.

import { getAccessToken } from './supabase.js';

async function request(method, path, body, extraHeaders) {
  const token = await getAccessToken();
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(extraHeaders || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = { raw: await res.text() };
  }
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.detail = data?.detail || data;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  // Documents
  listDocuments:  (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/api/documents${qs ? '?' + qs : ''}`);
  },
  createDocument: (body) => request('POST', '/api/documents', body),
  getDocument:    (id) => request('GET', `/api/documents/${id}`),
  updateDocument: (id, body, opts = {}) => {
    // Optimistic-concurrency token: the updated_at the client last saw.
    //
    // This used to travel as `If-Match`, which is wrong — RFC 9110 says If-Match carries
    // an ETag, and a Postgres timestamp is not one. Vercel's edge evaluates the standard
    // conditional itself and answered 412 PRECONDITION_FAILED before our handler's
    // response could get back, while the write had already landed at the origin. The
    // client then held a stale updated_at, so every subsequent save failed 409
    // "updated in another tab/session" and the editor wedged with no way out.
    // A non-standard header name keeps the CDN out of it.
    const headers = opts.expectedUpdatedAt ? { 'X-Expected-Updated-At': opts.expectedUpdatedAt } : undefined;
    return request('PATCH', `/api/documents/${id}`, body, headers);
  },
  deleteDocument: (id, opts = {}) =>
    request('DELETE', `/api/documents/${id}${opts.permanent ? '?permanent=1' : ''}`),
  restoreDocument: (id) => request('POST', `/api/documents/${id}`, { action: 'restore' }),
  generatePdf:    (id) => request('POST', `/api/documents/${id}/pdf`),
  emailDocument:  (id, body) => request('POST', `/api/documents/${id}/email`, body),

  // Email activity log
  listEmails:     (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/api/emails${qs ? '?' + qs : ''}`);
  },

  // Agent
  agentOneshot:   (body) => request('POST', '/api/agent/oneshot', body),
  agentChat:      (body) => request('POST', '/api/agent/chat', body),

  // Meta
  listModels:     () => request('GET', '/api/models'),

  // User API keys
  listUserKeys:   () => request('GET', '/api/user-keys'),
  saveUserKey:    (provider, key) => request('POST', '/api/user-keys', { provider, key }),
  deleteUserKey:  (provider) => request('DELETE', '/api/user-keys', { provider }),

  // Projects
  listProjects:      (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/api/projects${qs ? '?' + qs : ''}`);
  },
  getProject:        (id) => request('GET', `/api/projects/${id}`),
  createProject:     (body) => request('POST', '/api/projects', body),
  updateProject:     (id, body) => request('PATCH', `/api/projects/${id}`, body),
  deleteProject:     (id, opts = {}) =>
    request('DELETE', `/api/projects/${id}${opts.permanent ? '?permanent=1' : ''}`),
  restoreProject:    (id) => request('POST', `/api/projects/${id}`, { action: 'restore' }),
  getProjectSummary: (id) => request('GET', `/api/projects/${id}/summary`),

  // Chat threads (agentic surface)
  listThreads:   (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/api/threads${qs ? '?' + qs : ''}`);
  },
  getThread:     (id) => request('GET', `/api/threads/${id}`),
  createThread:  (body = {}) => request('POST', '/api/threads', body),
  updateThread:  (id, body) => request('PATCH', `/api/threads/${id}`, body),
  deleteThread:  (id) => request('DELETE', `/api/threads/${id}`),
  postThreadTurn:(id, body) => request('POST', `/api/threads/${id}/turn`, body),
};
