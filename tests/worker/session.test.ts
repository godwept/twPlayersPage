import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createSession, revokeSession, validateSession } from '../../worker/auth/session';

describe('administrator sessions', () => {
  it('stores only a token hash and rejects expired or revoked tokens', async () => {
    const session = await createSession(env.DB);
    expect(session.token).toHaveLength(64);
    const row = await env.DB.prepare('SELECT token_hash, expires_at FROM sessions').first<{ token_hash: string; expires_at: string }>();
    expect(row?.token_hash).not.toBe(session.token);
    await expect(validateSession(env.DB, session.token)).resolves.toBe(true);
    await revokeSession(env.DB, session.token);
    await expect(validateSession(env.DB, session.token)).resolves.toBe(false);
  });
});
