import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { addPlayer, listPlayers, PlayerConflictError, PlayerNotFoundError, removePlayer, updatePlayer } from '../../worker/repos/players';

describe('player repository', () => {
  let firstId: string;

  beforeEach(async () => {
    firstId = await addPlayer(env.DB, { firstName: 'Jamie', lastName: 'North', jerseyNumber: '7' });
  });

  it('creates distinct permanent IDs when jersey numbers repeat', async () => {
    const secondId = await addPlayer(env.DB, { firstName: 'Riley', lastName: 'South', jerseyNumber: '7' });
    expect(secondId).not.toBe(firstId);
    expect((await listPlayers(env.DB)).filter((player) => player.jersey_number === '7')).toHaveLength(2);
  });

  it('lists all players and updates only the requested ID', async () => {
    const otherId = await addPlayer(env.DB, { firstName: 'Morgan', lastName: 'East', jerseyNumber: '8' });
    await updatePlayer(env.DB, firstId, { lastName: 'West' });
    expect((await listPlayers(env.DB)).find((player) => player.id === firstId)?.last_name).toBe('West');
    expect((await listPlayers(env.DB)).find((player) => player.id === otherId)?.last_name).toBe('East');
    await expect(updatePlayer(env.DB, 'unknown', { lastName: 'Nobody' })).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it('blocks deletion while photos are attached, then removes an empty player', async () => {
    const photoId = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO photos (id, player_id, original_key, display_key, filename, sha256, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(photoId, firstId, `original/${photoId}`, `display/${photoId}`, 'source.jpg', 'c'.repeat(64), new Date().toISOString()).run();
    await expect(removePlayer(env.DB, firstId)).rejects.toBeInstanceOf(PlayerConflictError);
    await env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(photoId).run();
    await removePlayer(env.DB, firstId);
    await expect(removePlayer(env.DB, firstId)).rejects.toBeInstanceOf(PlayerNotFoundError);
  });
});
