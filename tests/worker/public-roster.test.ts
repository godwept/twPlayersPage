import { exports } from 'cloudflare:workers';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { listHockeyTechPlayerPhotos } from '../../worker/repos/photos';

describe('public roster and gallery', () => {
  it('resolves HockeyTech links to only their active gallery with stable paging and bounds', async () => {
    const linked = crypto.randomUUID(); const empty = crypto.randomUUID(); const unlinked = crypto.randomUUID();
    for (const [id, hockeyId] of [[linked, '88001'], [empty, '88002'], [unlinked, null]]) {
      await env.DB.prepare('INSERT INTO players (id, first_name, last_name, hockeytech_player_id, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(id, 'Gallery', 'Test', hockeyId, '2026-10-04T12:00:00.000Z').run();
    }
    for (let i = 0; i < 63; i++) {
      await env.DB.prepare('INSERT INTO photos (id, player_id, original_key, display_key, filename, sha256, uploaded_at, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(`ht-gallery-${String(i).padStart(3, '0')}`, i === 62 ? unlinked : linked, `private/original-${i}`, `private/display-${i}`, `${i}.jpg`, 'a'.repeat(64),
          i === 0 ? '2026-10-03T12:00:00.000Z' : '2026-10-04T12:00:00.000Z', i === 61 ? 'deleting' : 'active').run();
    }
    const first = await listHockeyTechPlayerPhotos(env.DB, '88001', 1);
    expect(first).toMatchObject({ playerId: linked, photoCount: 61, items: [{ id: 'ht-gallery-060' }] });
    expect(first?.nextCursor).toEqual(expect.any(String));
    const second = await listHockeyTechPlayerPhotos(env.DB, '88001', 60, first!.nextCursor!);
    expect(second?.items).toHaveLength(60);
    expect(second?.items.at(-1)?.id).toBe('ht-gallery-000');
    expect(second?.nextCursor).toBeNull();
    expect((await listHockeyTechPlayerPhotos(env.DB, '88001', 100))?.items).toHaveLength(60);
    expect((await listHockeyTechPlayerPhotos(env.DB, '88001', 0))?.items).toHaveLength(1);
    expect((await listHockeyTechPlayerPhotos(env.DB, '88001', NaN))?.items).toHaveLength(30);
    expect(await listHockeyTechPlayerPhotos(env.DB, '88002', 30)).toEqual({ playerId: empty, photoCount: 0, items: [], nextCursor: null });
    expect(await listHockeyTechPlayerPhotos(env.DB, '88003', 30)).toBeNull();
    await expect(listHockeyTechPlayerPhotos(env.DB, '88001', 30, 'invalid')).rejects.toThrow('Invalid gallery cursor');
    await expect(listHockeyTechPlayerPhotos(env.DB, '88003', 30, 'invalid')).rejects.toThrow('Invalid gallery cursor');
    expect(JSON.stringify(first)).not.toMatch(/originalDownloadUrl|original_key|display_key|private\//);
  });

  it('publishes safe roster data and returns only active photos for the selected player', async () => {
    const playerId = crypto.randomUUID();
    const otherPlayerId = crypto.randomUUID();
    const photoId = crypto.randomUUID();
    const secondPhotoId = crypto.randomUUID();
    const deletingPhotoId = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO players (id, first_name, last_name, jersey_number, created_at) VALUES (?, ?, ?, ?, ?)').bind(playerId, 'Avery', 'Example', '8', now),
      env.DB.prepare('INSERT INTO players (id, first_name, last_name, jersey_number, created_at) VALUES (?, ?, ?, ?, ?)').bind(otherPlayerId, 'Jordan', 'Example', '9', now),
      env.DB.prepare('INSERT INTO photos (id, player_id, original_key, display_key, filename, sha256, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(photoId, playerId, 'secret/original', 'secret/display', '8 - Example1.jpg', 'd'.repeat(64), now),
      env.DB.prepare('INSERT INTO photos (id, player_id, original_key, display_key, filename, sha256, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(secondPhotoId, playerId, 'secret/original-2', 'secret/display-2', '8 - Example2.jpg', 'e'.repeat(64), now),
      env.DB.prepare("INSERT INTO photos (id, player_id, original_key, display_key, filename, sha256, uploaded_at, state) VALUES (?, ?, ?, ?, ?, ?, ?, 'deleting')").bind(deletingPhotoId, playerId, 'secret/original-3', 'secret/display-3', '8 - Example3.jpg', 'f'.repeat(64), now),
    ]);
    const rosterResponse = await exports.default.fetch('http://example.com/api/players');
    const roster = await rosterResponse.json() as Array<Record<string, unknown>>;
    expect(roster.find((player) => player.id === playerId)).toMatchObject({ firstName: 'Avery', lastName: 'Example', jerseyNumber: '8', photoCount: 2 });
    expect(roster.find((player) => player.id === otherPlayerId)).toMatchObject({ photoCount: 0, featuredImageUrl: null });
    expect([photoId, secondPhotoId]).toContain(String(roster.find((player) => player.id === playerId)?.featuredPhotoId));
    expect(JSON.stringify(roster)).not.toContain('secret/');

    const galleryResponse = await exports.default.fetch(`http://example.com/api/players/${playerId}/photos`);
    expect(galleryResponse.status).toBe(200);
    const gallery = await galleryResponse.json() as { items: Array<Record<string, unknown>> };
    expect(gallery.items).toHaveLength(2);
    expect(gallery.items).toContainEqual(expect.objectContaining({ id: photoId, filename: '8 - Example1.jpg', displayUrl: `/api/photos/${photoId}/display` }));
    expect(JSON.stringify(gallery)).not.toContain('secret/');
    const otherGallery = await exports.default.fetch(`http://example.com/api/players/${otherPlayerId}/photos`);
    expect((await otherGallery.json() as { items: unknown[] }).items).toHaveLength(0);
  });
});
