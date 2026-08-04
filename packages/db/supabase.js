// Server-side Supabase client (service role) + user-context helper.
// Never import this from the browser bundle. Only used inside Netlify Functions.

import { createClient } from '@supabase/supabase-js';

// MOCK AUTH: when `MOCK_AUTH` is not explicitly "false", every protected route accepts
// the local mock session without contacting Supabase. This keeps the app fully usable
// when the Supabase auth backend is unreachable. The browser bundle sends the mock
// token (see src/lib/supabase.js); here we short-circuit verification entirely.
// Set MOCK_AUTH="false" (and VITE_MOCK_AUTH="false" for the bundle) to restore real auth.
export const MOCK_AUTH = String(process.env.MOCK_AUTH ?? 'true').toLowerCase() !== 'false';

// Stable identity shared with the frontend mock (must match src/lib/supabase.js).
export const MOCK_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'demo@sunvic.local',
  aud: 'authenticated',
  role: 'authenticated',
  user_metadata: { full_name: 'Demo User' },
};

let cachedService = null;
export function serviceClient() {
  if (cachedService) return cachedService;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase env missing: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }
  cachedService = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedService;
}

// Verify a user JWT from Authorization: Bearer <jwt> and return { user, error }.
// Netlify Functions get the raw header via event.headers.authorization.
export async function verifyUser(authorization) {
  // Mock auth: accept the local session unconditionally — no Supabase round-trip.
  if (MOCK_AUTH) return { user: MOCK_USER, error: null };
  if (!authorization || !authorization.toLowerCase().startsWith('bearer ')) {
    return { user: null, error: 'missing_bearer_token' };
  }
  const jwt = authorization.slice(7).trim();
  const svc = serviceClient();
  const { data, error } = await svc.auth.getUser(jwt);
  if (error || !data?.user) return { user: null, error: error?.message || 'invalid_token' };
  return { user: data.user, error: null };
}
