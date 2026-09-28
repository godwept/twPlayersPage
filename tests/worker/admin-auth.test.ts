import { env, exports } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../../worker/index';

const base = 'http://example.com/api/admin';
const sameOrigin = { Origin: 'http://example.com', 'Content-Type': 'application/json' };

afterEach(() => vi.restoreAllMocks());

describe('administrator auth routes', () => {
  it('rejects wrong passwords, accepts the configured password, reports status and logs out', async () => {
    const wrong = await exports.default.fetch(`${base}/login`, { method: 'POST', headers: sameOrigin, body: JSON.stringify({ password: 'incorrect' }) });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'Invalid credentials' });

    const login = await exports.default.fetch(`${base}/login`, { method: 'POST', headers: sameOrigin, body: JSON.stringify({ password: 'test-only-password-for-workers' }) });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).not.toContain('ADMIN_PASSWORD_HASH');

    const unauthorized = await exports.default.fetch(`${base}/session`);
    expect(unauthorized.status).toBe(401);
    const status = await exports.default.fetch(`${base}/session`, { headers: { Cookie: cookie!.split(';')[0] } });
    expect(await status.json()).toEqual({ authenticated: true });

    const logout = await exports.default.fetch(`${base}/logout`, { method: 'POST', headers: { ...sameOrigin, Cookie: cookie!.split(';')[0] }, body: '{}' });
    expect(logout.status).toBe(200);
    const replay = await exports.default.fetch(`${base}/session`, { headers: { Cookie: cookie!.split(';')[0] } });
    expect(replay.status).toBe(401);
  });

  it('rejects cross-origin and unexpected content-type writes', async () => {
    const crossOrigin = await exports.default.fetch(`${base}/login`, { method: 'POST', headers: { ...sameOrigin, Origin: 'https://attacker.example' }, body: '{}' });
    expect(crossOrigin.status).toBe(403);
    const wrongType = await exports.default.fetch(`${base}/login`, { method: 'POST', headers: { Origin: 'http://example.com', 'Content-Type': 'text/plain' }, body: '{}' });
    expect(wrongType.status).toBe(415);
  });

  it('reports hashing outages as unavailable without counting them as bad passwords', async () => {
    const before = await env.DB.prepare('SELECT count(*) AS count FROM login_attempts').first();
    vi.spyOn(crypto.subtle, 'deriveBits').mockRejectedValue(new Error('KDF unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await app.fetch(new Request(`${base}/login`, {
      method: 'POST', headers: sameOrigin, body: JSON.stringify({ password: 'test-only-password-for-workers' }),
    }), env);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Sign-in is temporarily unavailable. Please try again later.' });
    expect(response.headers.get('set-cookie')).toBeNull();
    const after = await env.DB.prepare('SELECT count(*) AS count FROM login_attempts').first();
    expect(after).toEqual(before);
  });
});
