// Thin fetch wrapper — attaches the Supabase JWT and handles JSON.

import { getAccessToken } from './supabase.js';

async function request(method, path, body) {
  const token = await getAccessToken();
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  updateDocument: (id, body) => request('PATCH', `/api/documents/${id}`, body),
  deleteDocument: (id) => request('DELETE', `/api/documents/${id}`),
  generatePdf:    (id) => request('POST', `/api/documents/${id}/pdf`),
  emailDocument:  (id, body) => request('POST', `/api/documents/${id}/email`, body),

  // Agent
  agentOneshot:   (body) => request('POST', '/api/agent/oneshot', body),
  agentChat:      (body) => request('POST', '/api/agent/chat', body),

  // Meta
  listModels:     () => request('GET', '/api/models'),

  // User API keys
  listUserKeys:   () => request('GET', '/api/user-keys'),
  saveUserKey:    (provider, key) => request('POST', '/api/user-keys', { provider, key }),
  deleteUserKey:  (provider) => request('DELETE', '/api/user-keys', { provider }),
};
