import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashAdminPassword, PasswordVerificationError, verifyAdminPassword } from '../../worker/auth/password';

// Generated independently with Node's pbkdf2Sync, matching the secret generator.
const nodeHash = 'pbkdf2_sha256$100000$AAECAwQFBgcICQoLDA0ODw$SdScJfWXhGIJ8Nkud3CrZOHHXpS0zmxQkmXuZxddKh4';

afterEach(() => vi.restoreAllMocks());

describe('administrator password verification', () => {
  it('uses salted PBKDF2-SHA256 and rejects a wrong password', async () => {
    const encoded = await hashAdminPassword('correct horse battery staple', 'local-test-salt-long-enough');
    expect(encoded).toMatch(/^pbkdf2_sha256\$100000\$/);
    await expect(verifyAdminPassword('correct horse battery staple', encoded)).resolves.toBe(true);
    await expect(verifyAdminPassword('wrong password', encoded)).resolves.toBe(false);
  });

  it('rejects malformed and undersized hashes without deriving a key', async () => {
    const derive = vi.spyOn(crypto.subtle, 'deriveBits');
    await expect(verifyAdminPassword('anything', 'plain-text')).resolves.toBe(false);
    await expect(verifyAdminPassword('anything', 'pbkdf2_sha256$1$c2FsdA$YWJj')).resolves.toBe(false);
    await expect(verifyAdminPassword('anything', 'pbkdf2_sha256$100000$A$A')).resolves.toBe(false);
    await expect(verifyAdminPassword('anything', 'pbkdf2_sha256$100000$c2FsdA$YWJj')).resolves.toBe(false);
    await expect(verifyAdminPassword('anything', nodeHash.replace('$100000$', '$600000$'))).resolves.toBe(false);
    await expect(verifyAdminPassword('anything', nodeHash.replace('$100000$', '$99999$'))).resolves.toBe(false);
    expect(derive).not.toHaveBeenCalled();
  });

  it('verifies Node-generated hashes under the hosted 100,000-iteration cap', async () => {
    const nativeDerive = crypto.subtle.deriveBits.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'deriveBits').mockImplementation((algorithm, key, length) => {
      if (typeof algorithm === 'object' && 'iterations' in algorithm && Number(algorithm.iterations) > 100_000) {
        return Promise.reject(new DOMException('Pbkdf2 failed: iteration counts above 100000 are not supported.', 'NotSupportedError'));
      }
      return nativeDerive(algorithm, key, length);
    });
    await expect(verifyAdminPassword('correct horse battery staple', nodeHash)).resolves.toBe(true);
    await expect(verifyAdminPassword('wrong password', nodeHash)).resolves.toBe(false);
  });

  it('accepts surrounding secret whitespace without trimming the submitted password', async () => {
    await expect(verifyAdminPassword('correct horse battery staple', `\r\n${nodeHash}\r\n`)).resolves.toBe(true);
    await expect(verifyAdminPassword(' correct horse battery staple ', nodeHash)).resolves.toBe(false);
  });

  it('distinguishes a hashing failure from an incorrect password', async () => {
    vi.spyOn(crypto.subtle, 'deriveBits').mockRejectedValue(new Error('KDF unavailable'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(verifyAdminPassword('correct horse battery staple', nodeHash)).rejects.toBeInstanceOf(PasswordVerificationError);
    expect(JSON.stringify(log.mock.calls)).not.toContain('correct horse battery staple');
    expect(JSON.stringify(log.mock.calls)).not.toContain(nodeHash);
  });
});
