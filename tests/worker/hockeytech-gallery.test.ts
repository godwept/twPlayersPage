import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

const api = 'https://photos.example/api/integrations/hockeytech';
const linked = crypto.randomUUID(); const empty = crypto.randomUUID(); const other = crypto.randomUUID();
const newest = 'integration-newest'; const older = 'integration-older';
const now = '2026-10-04T12:00:00.000Z';
type Gallery = { hockeyTechPlayerId: string; linked: boolean; photoCount: number; playerPageUrl: string | null;
  items: Array<{ id: string; filename: string; uploadedAt: string; displayUrl: string }>; nextCursor: string | null };

beforeAll(async () => {
  for (const [id, hockeyId] of [[linked, '77001'], [empty, '77002'], [other, null]]) {
    await env.DB.prepare('INSERT INTO players (id, first_name, last_name, hockeytech_player_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, 'Integration', 'Test', hockeyId, now).run();
  }
  for (const [id, owner, timestamp, state] of [[newest, linked, now, 'active'], [older, linked, '2026-10-03T12:00:00.000Z', 'active'],
    ['integration-deleting', linked, now, 'deleting'], ['integration-other', other, now, 'active']]) {
    await env.DB.prepare('INSERT INTO photos (id, player_id, original_key, display_key, filename, sha256, uploaded_at, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, owner, `secret/original/${id}`, `secret/display/${id}`, `${id}.jpg`, 'b'.repeat(64), timestamp, state).run();
  }
});

function expectSafe(value: unknown) {
  expect(JSON.stringify(value)).not.toMatch(/originalDownloadUrl|original_key|display_key|sha256|checksum|secret\/|crop|created_at/);
}

describe('public HockeyTech gallery contract', () => {
  it('returns the exact linked-player contract with absolute optimized URLs', async () => {
    const response = await exports.default.fetch(`${api}/players/77001/photos`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ hockeyTechPlayerId: '77001', linked: true, photoCount: 2, playerPageUrl: `https://photos.example/player/${linked}`,
      items: [newest, older].map((id, index) => ({ id, filename: `${id}.jpg`, uploadedAt: index ? '2026-10-03T12:00:00.000Z' : now,
        displayUrl: `https://photos.example/api/photos/${id}/display` })), nextCursor: null });
    expectSafe(body);
  });

  it.each([['77002', true, `https://photos.example/player/${empty}`], ['77003', false, null]])('distinguishes empty linked and unlinked ID %s', async (id, isLinked, pageUrl) => {
    const response = await exports.default.fetch(`${api}/players/${id}/photos`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hockeyTechPlayerId: id, linked: isLinked, photoCount: 0, playerPageUrl: pageUrl, items: [], nextCursor: null });
  });

  it.each(['abc', '-1', '12.3', '%20123%20', '123456789012345678901'])('rejects invalid ID %s', async (id) => {
    expect((await exports.default.fetch(`${api}/players/${id}/photos`)).status).toBe(400);
  });

  it('pages only active photos owned by the linked player', async () => {
    const first = await (await exports.default.fetch(`${api}/players/77001/photos?limit=1`)).json() as Gallery;
    expect(first.items.map((p) => p.id)).toEqual([newest]);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await (await exports.default.fetch(`${api}/players/77001/photos?limit=1&cursor=${encodeURIComponent(first.nextCursor!)}`)).json() as Gallery;
    expect(second.items.map((p) => p.id)).toEqual([older]);
    expect(second.photoCount).toBe(2);
    expect(second.nextCursor).toBeNull();
    expectSafe(first); expectSafe(second);
  });

  it.each(['77001', '77002', '77003'])('rejects malformed cursors even for empty/unlinked ID %s', async (id) => {
    expect((await exports.default.fetch(`${api}/players/${id}/photos?cursor=invalid`)).status).toBe(400);
  });
});

describe('public HockeyTech photo index', () => {
  it('includes only linked players with active photos and prefers a valid featured image', async () => {
    await env.DB.prepare('UPDATE players SET featured_photo_id = ? WHERE id = ?').bind(older, linked).run();
    const response = await exports.default.fetch(`${api}/photo-index`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ players: [{ hockeyTechPlayerId: '77001', photoCount: 2, displayUrl: `https://photos.example/api/photos/${older}/display` }] });
    expectSafe(body);
  });

  it.each([null, 'integration-deleting', 'integration-other'])('falls back to newest active photo for invalid featured image %s', async (featured) => {
    await env.DB.prepare('UPDATE players SET featured_photo_id = ? WHERE id = ?').bind(featured, linked).run();
    const body = await (await exports.default.fetch(`${api}/photo-index`)).json();
    expect(body).toEqual({ players: [{ hockeyTechPlayerId: '77001', photoCount: 2, displayUrl: `https://photos.example/api/photos/${newest}/display` }] });
    expectSafe(body);
  });

  it('falls back after a selected photo is deleted', async () => {
    await env.DB.prepare('INSERT INTO photos (id, player_id, original_key, display_key, filename, sha256, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind('removed-featured', linked, 'secret/removed-original', 'secret/removed-display', 'removed.jpg', 'd'.repeat(64), now).run();
    await env.DB.prepare('UPDATE players SET featured_photo_id = ? WHERE id = ?').bind('removed-featured', linked).run();
    await env.DB.prepare('DELETE FROM photos WHERE id = ?').bind('removed-featured').run();
    expect(await (await exports.default.fetch(`${api}/photo-index`)).json()).toEqual({ players: [
      { hockeyTechPlayerId: '77001', photoCount: 2, displayUrl: `https://photos.example/api/photos/${newest}/display` },
    ] });
  });

  it('excludes linked players with only deleting photos and returns empty when links are cleared', async () => {
    await env.DB.prepare('INSERT INTO photos (id, player_id, original_key, display_key, filename, sha256, uploaded_at, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind('empty-deleting', empty, 'secret/empty-original', 'secret/empty-display', 'empty.jpg', 'c'.repeat(64), now, 'deleting').run();
    await env.DB.prepare('UPDATE players SET hockeytech_player_id = NULL WHERE id = ?').bind(linked).run();
    expect(await (await exports.default.fetch(`${api}/photo-index`)).json()).toEqual({ players: [] });
  });
});
