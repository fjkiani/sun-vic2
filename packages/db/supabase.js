// Server-side Supabase client (service role) + user-context helper.
// Never import this from the browser bundle. Only used inside Netlify Functions.

import { createClient } from '@supabase/supabase-js';

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
  if (!authorization || !authorization.toLowerCase().startsWith('bearer ')) {
    return { user: null, error: 'missing_bearer_token' };
  }
  const jwt = authorization.slice(7).trim();
  const svc = serviceClient();
  const { data, error } = await svc.auth.getUser(jwt);
  if (error || !data?.user) return { user: null, error: error?.message || 'invalid_token' };
  return { user: data.user, error: null };
}
