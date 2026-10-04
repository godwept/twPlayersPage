import { exports } from 'cloudflare:workers';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('public roster and gallery', () => {
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
