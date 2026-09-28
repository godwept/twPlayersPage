// Owner-approved work factor for native PBKDF2 on hosted Cloudflare Workers.
// Keep scripts/generate-admin-password-hash.mjs in sync with this policy.
const ITERATIONS = 100_000;

export class PasswordVerificationError extends Error {
  constructor() {
    super('Password verification is unavailable');
    this.name = 'PasswordVerificationError';
  }
}

function encode(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decode(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
  const result = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBuffer, iterations }, key, 256);
  return new Uint8Array(result);
}

export async function hashAdminPassword(password: string, salt?: string): Promise<string> {
  const saltBytes = salt ? new TextEncoder().encode(salt) : crypto.getRandomValues(new Uint8Array(16));
  const result = await derive(password, saltBytes, ITERATIONS);
  return `pbkdf2_sha256$${ITERATIONS}$${encode(saltBytes)}$${encode(result)}`;
}

export async function verifyAdminPassword(password: string, encoded: string): Promise<boolean> {
  const match = /^pbkdf2_sha256\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/.exec(encoded.trim());
  if (!match) return false;
  const iterations = Number(match[1]);
  if (iterations !== ITERATIONS) return false;
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = decode(match[2]);
    expected = decode(match[3]);
  } catch {
    return false;
  }
  if (salt.length < 16 || expected.length !== 32) return false;
  let actual: Uint8Array;
  try {
    actual = await derive(password, salt, iterations);
  } catch (error) {
    console.error('Administrator password verification failed:', error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown cryptographic error');
    throw new PasswordVerificationError();
  }
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= actual[i] ^ expected[i];
  return difference === 0;
}

