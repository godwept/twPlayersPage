import { exports } from 'cloudflare:workers';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const api = 'http://example.com/api';
const headers = { Origin: 'http://example.com', 'Content-Type': 'application/json' };

describe('player admin routes', () => {
  it('adds, edits and intentionally removes players with an explicit photo conflict', async () => {
    const login = await exports.default.fetch(`${api}/admin/login`, { method: 'POST', headers, body: JSON.stringify({ password: 'test-only-password-for-workers' }) });
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const authHeaders = { ...headers, Cookie: cookie };
    const first = await exports.default.fetch(`${api}/admin/players`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ firstName: 'Alex', lastName: 'Example', jerseyNumber: '12' }) });
    const second = await exports.default.fetch(`${api}/admin/players`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ firstName: 'Sam', lastName: 'Example', jerseyNumber: '12' }) });
    expect(first.status).toBe(201); expect(second.status).toBe(201);
    const firstId = (await first.json() as { id: string }).id;
    const edited = await exports.default.fetch(`${api}/admin/players/${firstId}`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ lastName: 'North' }) });
    expect(edited.status).toBe(200);
    const roster = await exports.default.fetch(`${api}/players`);
    expect((await roster.json() as Array<{ id: string; lastName: string }>).find((player) => player.id === firstId)?.lastName).toBe('North');

    const photoId = crypto.randomUUID(); const now = new Date().toISOString();
    const photo = await exports.default.fetch(`${api}/admin/photos`, { method: 'POST', headers: authHeaders, body: JSON.stringify({}) });
    expect(photo.status).toBe(400);
    const inserted = await env.DB.prepare('INSERT INTO photos (id, player_id, original_key, display_key, filename, sha256, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(photoId, firstId, 'test/original', 'test/display', 'a.jpg', 'a'.repeat(64), now).run();
    expect(inserted.success).toBe(true);
    const blocked = await exports.default.fetch(`${api}/admin/players/${firstId}`, { method: 'DELETE', headers: authHeaders, body: '{}' });
    expect(blocked.status).toBe(409);
  });
});
