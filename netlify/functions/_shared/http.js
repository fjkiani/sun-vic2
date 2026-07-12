// Netlify Function HTTP helpers.

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, x-provider',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

export function json(status, body, extraHeaders = {}) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS, ...extraHeaders },
    body: JSON.stringify(body),
  };
}

export function text(status, body, extraHeaders = {}) {
  return {
    statusCode: status,
    headers: { 'content-type': 'text/plain; charset=utf-8', ...CORS_HEADERS, ...extraHeaders },
    body,
  };
}

export function handleOptions(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  return null;
}

export function parseJson(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return null; // signal parse failure
  }
}

export function bearer(event) {
  const h = event.headers || {};
  return h.authorization || h.Authorization || '';
}

export function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new Error(`Missing env: ${missing.join(', ')}`);
}
