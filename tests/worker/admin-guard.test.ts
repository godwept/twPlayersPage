import { exports } from 'cloudflare:workers';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const api = 'http://example.com/api';

describe('admin route guard', () => {
  it('rejects anonymous mutations before any storage change', async () => {
    const before = await env.DB.prepare('SELECT count(*) AS count FROM players').first<{ count: number }>();
    const requests = [
      exports.default.fetch(`${api}/admin/players`, { method: 'POST', headers: { Origin: 'http://example.com', 'Content-Type': 'application/json' }, body: JSON.stringify({ firstName: 'Unauth', lastName: 'User' }) }),
      exports.default.fetch(`${api}/admin/photos`, { method: 'POST', headers: { Origin: 'http://example.com', 'Content-Type': 'application/json' }, body: '{}' }),
      exports.default.fetch(`${api}/admin/site/banner`, { method: 'PUT', headers: { Origin: 'http://example.com', 'Content-Type': 'image/jpeg' }, body: new Uint8Array([0xff, 0xd8, 0xff]) }),
      exports.default.fetch(`${api}/admin/photos/${crypto.randomUUID()}`, { method: 'DELETE', headers: { Origin: 'http://example.com', 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }) }),
    ];
    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
    const after = await env.DB.prepare('SELECT count(*) AS count FROM players').first<{ count: number }>();
    expect(after?.count).toBe(before?.count);
    await expect(exports.default.fetch(`${api}/admin/session`)).resolves.toMatchObject({ status: 401 });
  });
});
