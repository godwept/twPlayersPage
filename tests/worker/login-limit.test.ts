import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { isLoginAllowed, recordLoginFailure } from '../../worker/auth/login-limit';

describe('login throttling', () => {
  it('limits repeated failures per visitor without storing their address', async () => {
    for (let i = 0; i < 5; i++) await recordLoginFailure(env.DB, '192.0.2.1', 'test-pepper');
    await expect(isLoginAllowed(env.DB, '192.0.2.1', 'test-pepper')).resolves.toBe(false);
    await expect(isLoginAllowed(env.DB, '192.0.2.2', 'test-pepper')).resolves.toBe(true);
    const rows = await env.DB.prepare('SELECT address_key FROM login_attempts').all<{ address_key: string }>();
    expect(rows.results.map((row) => row.address_key)).not.toContain('192.0.2.1');
  });
});
