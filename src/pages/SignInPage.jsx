import React, { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useNavigate } from 'react-router-dom';

export function SignInPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin'); // signin | signup
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const fn = mode === 'signin' ? supabase.auth.signInWithPassword : supabase.auth.signUp;
      const { error: err } = await fn.call(supabase.auth, { email, password });
      if (err) throw err;
      nav('/chat', { replace: true });
    } catch (e2) {
      setError(e2.message || String(e2));
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-sunvic-50 grid place-items-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-neutral-200 p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-lg bg-sunvic-500 text-white grid place-items-center font-bold">S</div>
          <div>
            <div className="text-xl font-bold">Sunvic Documents</div>
            <div className="text-xs text-neutral-500">Sign in to manage contracts & invoices</div>
          </div>
        </div>
        <form className="space-y-3" onSubmit={submit}>
          <label className="block">
            <span className="text-sm text-neutral-600">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 focus:ring-2 focus:ring-sunvic-500 focus:outline-none" />
          </label>
          <label className="block">
            <span className="text-sm text-neutral-600">Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 focus:ring-2 focus:ring-sunvic-500 focus:outline-none" />
          </label>
          {error ? <div className="text-sm text-rose-600">{error}</div> : null}
          <button type="submit" disabled={loading}
            className="w-full py-2 rounded-md bg-sunvic-500 hover:bg-sunvic-600 text-white font-semibold disabled:opacity-60">
            {loading ? '…' : (mode === 'signin' ? 'Sign in' : 'Create account')}
          </button>
        </form>
        <button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="mt-4 text-sm text-sunvic-600 hover:underline w-full text-center">
          {mode === 'signin' ? "Need an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
