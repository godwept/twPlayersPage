import { exports } from 'cloudflare:workers';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('roster CSV import endpoint', () => {
  it('imports valid rows atomically while preserving reused jersey numbers', async () => {
    const origin = 'http://example.com';
    const login = await exports.default.fetch(`${origin}/api/admin/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-only-password-for-workers' }) });
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const headers = { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' };
    const response = await exports.default.fetch(`${origin}/api/admin/players/import`, { method: 'POST', headers, body: JSON.stringify({ players: [
      { firstName: 'Avery', lastName: 'One', jerseyNumber: '4' }, { firstName: 'Riley', lastName: 'Two', jerseyNumber: '4' },
    ] }) });
    expect(response.status).toBe(201);
    const result = await response.json() as { ids: string[]; count: number };
    expect(result.count).toBe(2);
    expect(new Set(result.ids).size).toBe(2);

    const before = await env.DB.prepare('SELECT count(*) AS count FROM players').first<{ count: number }>();
    const rejected = await exports.default.fetch(`${origin}/api/admin/players/import`, { method: 'POST', headers, body: JSON.stringify({ players: [
      { firstName: 'Would', lastName: 'Add', jerseyNumber: '5' }, { firstName: '', lastName: 'Invalid', jerseyNumber: null },
    ] }) });
    expect(rejected.status).toBe(400);
    const after = await env.DB.prepare('SELECT count(*) AS count FROM players').first<{ count: number }>();
    expect(after?.count).toBe(before?.count);
  });
});
