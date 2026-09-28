import { exports } from 'cloudflare:workers';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const source = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 0xff, 0xd9]);
const crc32 = 1912419538;

function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  return haystack.some((_, index) => needle.every((value, offset) => haystack[index + offset] === value));
}

describe('Download All', () => {
  it('streams a store-mode ZIP of only that player’s original objects', async () => {
    const playerId = crypto.randomUUID();
    const otherPlayerId = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO players (id, first_name, last_name, jersey_number, created_at) VALUES (?, ?, ?, ?, ?)').bind(playerId, 'Avery', 'Zip', '5', now),
      env.DB.prepare('INSERT INTO players (id, first_name, last_name, jersey_number, created_at) VALUES (?, ?, ?, ?, ?)').bind(otherPlayerId, 'Other', 'Player', '6', now),
    ]);
    const firstKey = `photos/${crypto.randomUUID()}/original.jpg`;
    const secondKey = `photos/${crypto.randomUUID()}/original.jpg`;
    const otherKey = `photos/${crypto.randomUUID()}/original.jpg`;
    await Promise.all([env.PHOTOS.put(firstKey, source), env.PHOTOS.put(secondKey, source), env.PHOTOS.put(otherKey, new Uint8Array([11, 12, 13]))]);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO photos (id, player_id, original_key, display_key, filename, sha256, crc32, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), playerId, firstKey, 'display/a', 'same.jpg', 'e'.repeat(64), crc32, now),
      env.DB.prepare('INSERT INTO photos (id, player_id, original_key, display_key, filename, sha256, crc32, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), playerId, secondKey, 'display/b', 'same.jpg', 'e'.repeat(64), crc32, new Date(Date.now() + 1).toISOString()),
      env.DB.prepare('INSERT INTO photos (id, player_id, original_key, display_key, filename, sha256, crc32, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), otherPlayerId, otherKey, 'display/c', 'other.jpg', 'f'.repeat(64), 0, now),
    ]);

    const response = await exports.default.fetch(`http://example.com/api/players/${playerId}/download.zip`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    const bytes = new Uint8Array(await response.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(bytes.length - 14, true)).toBe(2);
    expect(containsBytes(bytes, source)).toBe(true);
    const archiveText = new TextDecoder().decode(bytes);
    expect(archiveText).toContain('same.jpg');
    expect(archiveText).not.toContain('other.jpg');
    expect(archiveText).toContain(' (');
  });

  it('returns an error before a ZIP response when a source object is missing', async () => {
    const playerId = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare('INSERT INTO players (id, first_name, last_name, jersey_number, created_at) VALUES (?, ?, ?, ?, ?)').bind(playerId, 'Missing', 'Source', '5', now).run();
    await env.DB.prepare('INSERT INTO photos (id, player_id, original_key, display_key, filename, sha256, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), playerId, 'missing/original', 'missing/display', 'missing.jpg', 'a'.repeat(64), now).run();
    const response = await exports.default.fetch(`http://example.com/api/players/${playerId}/download.zip`);
    expect(response.status).toBe(502);
    expect(response.headers.get('content-type')).toContain('application/json');
  });
});
