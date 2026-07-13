// CRUD helper for user_api_keys (server-side only).

import { serviceClient } from './supabase.js';
import { encryptKey, decryptKey, fingerprintKey } from '../crypto/keyvault.js';

export async function saveUserKey(userId, provider, plaintext) {
  const svc = serviceClient();
  const ciphertext = encryptKey(plaintext);
  const fingerprint = fingerprintKey(plaintext);
  const { data, error } = await svc
    .from('user_api_keys')
    .upsert(
      { user_id: userId, provider, ciphertext, key_fingerprint: fingerprint },
      { onConflict: 'user_id,provider' }
    )
    .select('provider, key_fingerprint, updated_at')
    .single();
  if (error) throw new Error(`saveUserKey: ${error.message}`);
  return { provider: data.provider, fingerprint: data.key_fingerprint, updated_at: data.updated_at };
}

export async function getUserKey(userId, provider) {
  const svc = serviceClient();
  const { data, error } = await svc
    .from('user_api_keys')
    .select('ciphertext')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();
  if (error) throw new Error(`getUserKey: ${error.message}`);
  if (!data) return null;
  try {
    return decryptKey(data.ciphertext);
  } catch {
    return null;
  }
}

export async function listUserKeys(userId) {
  const svc = serviceClient();
  const { data, error } = await svc
    .from('user_api_keys')
    .select('provider, key_fingerprint, updated_at')
    .eq('user_id', userId);
  if (error) throw new Error(`listUserKeys: ${error.message}`);
  return (data || []).map((r) => ({ provider: r.provider, fingerprint: r.key_fingerprint, updated_at: r.updated_at }));
}

export async function deleteUserKey(userId, provider) {
  const svc = serviceClient();
  const { error } = await svc.from('user_api_keys').delete().eq('user_id', userId).eq('provider', provider);
  if (error) throw new Error(`deleteUserKey: ${error.message}`);
  return true;
}

export async function resolveProviderKey(userId, provider) {
  if (userId) {
    const uk = await getUserKey(userId, provider);
    if (uk) return uk;
  }
  const map = {
    openrouter: process.env.OPENROUTER_API_KEY,
    cohere: process.env.COHERE_API_KEY,
    gemma: process.env.GEMMA_API_KEY,
    resend: process.env.RESEND_API_KEY,
  };
  return map[provider] || null;
}
