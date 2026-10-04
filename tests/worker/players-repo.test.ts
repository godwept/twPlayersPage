import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { addPlayer, findPlayer, InvalidPlayerError, listPlayers, PlayerConflictError, PlayerNotFoundError, removePlayer, updatePlayer } from '../../worker/repos/players';

describe('player repository', () => {
  let firstId: string;

  beforeEach(async () => {
    firstId = await addPlayer(env.DB, { firstName: 'Jamie', lastName: 'North', jerseyNumber: '7' });
  });

  it('normalizes, persists and clears optional HockeyTech IDs without changing player ownership', async () => {
    for (const [input, stored] of [[' 12345 ', '12345'], ['12345678901234567890', '12345678901234567890'], [null, null], ['   ', null]] as const) {
      await updatePlayer(env.DB, firstId, { hockeyTechPlayerId: input });
      expect((await findPlayer(env.DB, firstId))?.hockeytech_player_id).toBe(stored);
      expect((await listPlayers(env.DB)).find((p) => p.id === firstId)?.hockeytech_player_id).toBe(stored);
    }
  });

  it.each(['abc', '12.3', '-12', '123456789012345678901', 123, {}])('rejects invalid HockeyTech ID %j', async (value) => {
    await expect(updatePlayer(env.DB, firstId, { hockeyTechPlayerId: value as string })).rejects.toBeInstanceOf(InvalidPlayerError);
  });

  it('reports duplicate HockeyTech links as a player conflict and allows reuse after clearing', async () => {
    const other = await addPlayer(env.DB, { firstName: 'Other', lastName: 'Player' });
    await updatePlayer(env.DB, firstId, { hockeyTechPlayerId: '12345' });
    await expect(updatePlayer(env.DB, other, { hockeyTechPlayerId: '12345' })).rejects.toThrow('HockeyTech player ID is already linked to another player');
    await expect(updatePlayer(env.DB, other, { hockeyTechPlayerId: '12345' })).rejects.toBeInstanceOf(PlayerConflictError);
    await updatePlayer(env.DB, firstId, { hockeyTechPlayerId: null });
    await updatePlayer(env.DB, other, { hockeyTechPlayerId: '12345' });
  });

  it('creates distinct permanent IDs when jersey numbers repeat', async () => {
    const secondId = await addPlayer(env.DB, { firstName: 'Riley', lastName: 'South', jerseyNumber: '7' });
    expect(secondId).not.toBe(firstId);
    expect((await listPlayers(env.DB)).filter((player) => [firstId, secondId].includes(player.id)).map((p) => p.jersey_number)).toEqual(['7', '7']);
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
