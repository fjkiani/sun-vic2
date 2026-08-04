// Small hook helpers.

import { useEffect, useState } from 'react';
import { supabase, MOCK_AUTH, MOCK_SESSION } from './supabase.js';

export function useSession() {
  // Mock auth: immediately report a signed-in session, no Supabase round-trip.
  const [session, setSession] = useState(MOCK_AUTH ? MOCK_SESSION : null);
  const [loading, setLoading] = useState(!MOCK_AUTH);
  useEffect(() => {
    if (MOCK_AUTH) return undefined; // already signed in; nothing to subscribe to
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);
  return { session, loading };
}

export function usePersistedState(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw != null ? JSON.parse(raw) : initial;
    } catch { return initial; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
  }, [key, v]);
  return [v, setV];
}
