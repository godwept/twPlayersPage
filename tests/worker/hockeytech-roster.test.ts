import { exports } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

const url = 'http://example.com/api/admin/hockeytech/roster';
const hockeyTechBase = 'https://lscluster.hockeytech.com/feed/index.php?client_code=mhl&league_id=1&site_id=2&key=4a948e7faf5ee58d&fmt=json';
const seasonsUrl = `${hockeyTechBase}&feed=modulekit&view=seasons`;
const currentSeason = { SiteKit: { Parameters: { season_id: '46' }, Seasons: [
  { season_id: '41', season_name: '2025-26 MHL Regular Season' },
  { season_id: '46', season_name: '2026-27 MHL Regular Season' },
] } };
async function authHeaders() {
  const login = await exports.default.fetch('http://example.com/api/admin/login', {
    method: 'POST', headers: { Origin: 'http://example.com', 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'test-only-password-for-workers' }),
  });
  return { Cookie: login.headers.get('set-cookie')!.split(';')[0] };
}
afterEach(() => vi.unstubAllGlobals());

describe('authenticated HockeyTech roster lookup', () => {
  it('requires authentication before contacting the upstream', async () => {
    const upstream = vi.fn(); vi.stubGlobal('fetch', upstream);
    expect((await exports.default.fetch(url)).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('normalizes player rows across sections, dropping staff and invalid IDs', async () => {
    const payload = { roster: [{ sections: [
      { data: [{ row: { player_id: '12345', name: 'Player Name', tp_jersey_number: '14', position: 'D', birthdate: 'private' } }] },
      { data: [{ row: { player_id: 23456, name: 'Goalie Name', tp_jersey_number: 1, position: 'G' } },
        { row: { name: 'Coach', role: 'Coach' } }, { row: { player_id: 'bad', name: 'Invalid' } }] },
    ] }] };
    const upstream = vi.fn().mockImplementationOnce(async () => Response.json(currentSeason)).mockImplementationOnce(async () => Response.json(payload));
    vi.stubGlobal('fetch', upstream);
    const response = await exports.default.fetch(url, { headers: await authHeaders() });
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenNthCalledWith(1, seasonsUrl, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(upstream).toHaveBeenNthCalledWith(2, `${hockeyTechBase}&feed=statviewfeed&view=roster&team_id=9&season_id=46`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(await response.json()).toEqual({ players: [
      { id: '12345', name: 'Player Name', jerseyNumber: '14', position: 'D', imageUrl: 'https://assets.leaguestat.com/mhl/240x240/12345.jpg' },
      { id: '23456', name: 'Goalie Name', jerseyNumber: '1', position: 'G', imageUrl: 'https://assets.leaguestat.com/mhl/240x240/23456.jpg' },
    ] });
  });

  it.each(['46', '47'])('uses HockeyTech’s designated current season %s rather than the PWA’s pinned season', async (seasonId) => {
    const currentPlayer = { player_id: '2695', name: 'Carson Griffin', tp_jersey_number: '14', position: 'C' };
    const upstream = vi.fn(async (input: string) => {
      if (input === seasonsUrl) return Response.json({ SiteKit: { Parameters: { season_id: seasonId }, Seasons: currentSeason.SiteKit.Seasons } });
      const row = input.endsWith(`season_id=${seasonId}`) ? currentPlayer : { player_id: '2442', name: 'Mitchell Wagner', tp_jersey_number: '14', position: 'RW' };
      return Response.json({ roster: [{ sections: [{ data: [{ row }] }] }] });
    });
    vi.stubGlobal('fetch', upstream);
    const response = await exports.default.fetch(url, { headers: await authHeaders() });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ players: [{ id: '2695', name: 'Carson Griffin', jerseyNumber: '14', position: 'C', imageUrl: 'https://assets.leaguestat.com/mhl/240x240/2695.jpg' }] });
    expect(upstream).not.toHaveBeenCalledWith('https://tw-api.mathew-stewart.workers.dev/api/roster', expect.anything());
  });

  it.each(['parentheses', 'callback'])('parses HockeyTech %s JSONP without executing it', async (wrapper) => {
    const json = JSON.stringify({ roster: [{ sections: [{ data: [{ row: { player_id: '3769', name: 'Cam Griffin', tp_jersey_number: '19', position: 'LW' } }] }] }] });
    const upstream = vi.fn().mockImplementationOnce(async () => Response.json(currentSeason))
      .mockImplementationOnce(async () => new Response(wrapper === 'parentheses' ? `(${json})` : `angular.callbacks._0(${json});`));
    vi.stubGlobal('fetch', upstream);
    const response = await exports.default.fetch(url, { headers: await authHeaders() });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ players: [{ id: '3769', name: 'Cam Griffin' }] });
  });

  it.each([{}, { roster: [] }, { roster: [{ sections: {} }] }, { roster: [{ sections: [{ data: null }] }] },
    { roster: [{ sections: [{ data: [{ row: { player_id: '12345' } }] }] }] }])('returns 502 for malformed roster %j', async (payload) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(async () => Response.json(currentSeason)).mockImplementationOnce(async () => Response.json(payload)));
    const response = await exports.default.fetch(url, { headers: await authHeaders() });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Current roster lookup is unavailable. Enter a HockeyTech player ID manually or try again later.' });
  });

  it.each([{}, null, { SiteKit: { Parameters: {} } }, { SiteKit: { Parameters: { season_id: 'invalid' } } },
    { SiteKit: { Parameters: { season_id: '123456789012345678901' } } }])('returns 502 for malformed season discovery %j', async (payload) => {
    const upstream = vi.fn(async () => Response.json(payload));
    vi.stubGlobal('fetch', upstream);
    expect((await exports.default.fetch(url, { headers: await authHeaders() })).status).toBe(502);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it.each(['http', 'network', 'json'])('returns 502 for upstream %s failures', async (failure) => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (failure === 'network') throw new Error('upstream unreachable');
      return new Response('not JSON', { status: failure === 'http' ? 503 : 200 });
    }));
    expect((await exports.default.fetch(url, { headers: await authHeaders() })).status).toBe(502);
  });

  it.each(['http', 'network', 'json'])('returns 502 for roster-fetch %s failures after season discovery', async (failure) => {
    const upstream = vi.fn().mockImplementationOnce(async () => Response.json(currentSeason)).mockImplementationOnce(async () => {
      if (failure === 'network') throw new Error('upstream unreachable');
      return new Response('not JSON', { status: failure === 'http' ? 503 : 200 });
    });
    vi.stubGlobal('fetch', upstream);
    expect((await exports.default.fetch(url, { headers: await authHeaders() })).status).toBe(502);
  });
});
