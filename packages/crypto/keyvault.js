// Node-side AES-256-GCM for user API keys.
// Master key derived from SESSION_JWT_SECRET.

import crypto from 'node:crypto';

function getMasterKey() {
  const secret = process.env.SESSION_JWT_SECRET || process.env.KEYVAULT_MASTER_KEY;
  if (!secret) throw new Error('KEYVAULT_MASTER_KEY_MISSING: set SESSION_JWT_SECRET');
  if (/^[0-9a-fA-F]{64}$/.test(secret)) return Buffer.from(secret, 'hex');
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptKey(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('encryptKey: plaintext must be non-empty string');
  }
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString('base64');
}

export function decryptKey(blobB64) {
  if (typeof blobB64 !== 'string') throw new Error('decryptKey: expected base64 string');
  const blob = Buffer.from(blobB64, 'base64');
  if (blob.length < 12 + 16) throw new Error('decryptKey: blob too short');
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(blob.length - 16);
  const ct = blob.subarray(12, blob.length - 16);
  const key = getMasterKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  return pt;
}

export function fingerprintKey(plaintext) {
  const s = String(plaintext);
  return s.length <= 6 ? s : s.slice(-6);
}
