import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('gallery schema', () => {
  it('allows unlinked players and enforces unique non-null HockeyTech IDs', async () => {
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    for (const id of ids) {
      await env.DB.prepare('INSERT INTO players (id, first_name, last_name, created_at, hockeytech_player_id) VALUES (?, ?, ?, ?, ?)')
        .bind(id, 'Test', 'Link', new Date().toISOString(), null).run();
    }
    await env.DB.prepare('UPDATE players SET hockeytech_player_id = ? WHERE id = ?').bind('12345', ids[0]).run();
    await expect(env.DB.prepare('UPDATE players SET hockeytech_player_id = ? WHERE id = ?').bind('12345', ids[1]).run()).rejects.toThrow(/UNIQUE/);
  });

  it('keeps jersey numbers separate from permanent player IDs', async () => {
    const now = new Date().toISOString();
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO players (id, first_name, last_name, jersey_number, created_at) VALUES (?, ?, ?, ?, ?)').bind(first, 'Alex', 'Example', '12', now),
      env.DB.prepare('INSERT INTO players (id, first_name, last_name, jersey_number, created_at) VALUES (?, ?, ?, ?, ?)').bind(second, 'Sam', 'Example', '12', now),
    ]);
    const rows = await env.DB.prepare('SELECT id FROM players WHERE jersey_number = ?').bind('12').all<{ id: string }>();
    expect(rows.results.map((row) => row.id)).toEqual(expect.arrayContaining([first, second]));
  });

  it('enforces a valid photo owner and keeps only metadata in D1', async () => {
    const playerId = crypto.randomUUID();
    const photoId = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO players (id, first_name, last_name, jersey_number, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(playerId, 'Taylor', 'Test', '4', new Date().toISOString()).run();
    await expect(env.DB.prepare('INSERT INTO photos (id, player_id, original_key, display_key, filename, sha256, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(photoId, playerId, `original/${photoId}`, `display/${photoId}`, 'photo.jpg', 'a'.repeat(64), new Date().toISOString()).run()).resolves.toMatchObject({ success: true });
    await expect(env.DB.prepare('INSERT INTO photos (id, player_id, original_key, display_key, filename, sha256, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), 'missing-player', 'o', 'd', 'bad.jpg', 'b'.repeat(64), new Date().toISOString()).run()).rejects.toThrow();
    const tableInfo = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{ name: string }>();
    expect(tableInfo.results.map((row) => row.name)).toEqual(expect.arrayContaining(['sessions', 'login_attempts', 'site_settings']));
  });
});
