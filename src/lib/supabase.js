// Browser Supabase client — anon key only.
//
// MOCK AUTH: when `VITE_MOCK_AUTH` is not explicitly "false", the app runs with a
// fully mocked local session — no Supabase round-trip, no sign-in required. This
// unblocks the app when the Supabase auth backend is unreachable. The backend
// (packages/db/supabase.js verifyUser) honors the same MOCK_AUTH flag, so the
// mock token below is accepted by every protected API route.
// Set VITE_MOCK_AUTH="false" (and MOCK_AUTH="false" on the server) to restore real auth.

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Default ON unless explicitly disabled.
export const MOCK_AUTH = String(import.meta.env.VITE_MOCK_AUTH ?? 'true').toLowerCase() !== 'false';

// Stable identity shared with the backend mock (must match packages/db/supabase.js).
// Uses a REAL auth.users row so reads return that user's actual documents and the
// documents.created_by FK is satisfied on writes. Override with VITE_MOCK_USER_ID /
// VITE_MOCK_USER_EMAIL to point at a different account.
export const MOCK_USER = {
  id: import.meta.env.VITE_MOCK_USER_ID || '6ace8ac8-8dc1-45f8-876a-52051600e02c',
  email: import.meta.env.VITE_MOCK_USER_EMAIL || 'sunvicnj@gmail.com',
  aud: 'authenticated',
  role: 'authenticated',
  user_metadata: { full_name: 'Sunvic (mock session)' },
};
export const MOCK_TOKEN = 'mock-local-token';

const MOCK_SESSION = {
  access_token: MOCK_TOKEN,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'mock-refresh',
  user: MOCK_USER,
};

if (!MOCK_AUTH && (!url || !anonKey)) {
  // eslint-disable-next-line no-console
  console.warn('Supabase env vars missing — auth will not work until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.');
}

export const supabase = createClient(url || 'http://placeholder.local', anonKey || 'placeholder', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export async function getAccessToken() {
  if (MOCK_AUTH) return MOCK_TOKEN;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

// Returns the active session, or the mock session when MOCK_AUTH is on.
export async function getSession() {
  if (MOCK_AUTH) return MOCK_SESSION;
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

export { MOCK_SESSION };
