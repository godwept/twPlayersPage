import { exports } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

const url = 'http://example.com/api/admin/hockeytech/roster';
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
    const upstream = vi.fn(async () => Response.json({ roster: [{ sections: [
      { data: [{ row: { player_id: '12345', name: 'Player Name', tp_jersey_number: '14', position: 'D', birthdate: 'private' } }] },
      { data: [{ row: { player_id: 23456, name: 'Goalie Name', tp_jersey_number: 1, position: 'G' } },
        { row: { name: 'Coach', role: 'Coach' } }, { row: { player_id: 'bad', name: 'Invalid' } }] },
    ] }] }));
    vi.stubGlobal('fetch', upstream);
    const response = await exports.default.fetch(url, { headers: await authHeaders() });
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledWith('https://tw-api.mathew-stewart.workers.dev/api/roster', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(await response.json()).toEqual({ players: [
      { id: '12345', name: 'Player Name', jerseyNumber: '14', position: 'D', imageUrl: 'https://assets.leaguestat.com/mhl/240x240/12345.jpg' },
      { id: '23456', name: 'Goalie Name', jerseyNumber: '1', position: 'G', imageUrl: 'https://assets.leaguestat.com/mhl/240x240/23456.jpg' },
    ] });
  });

  it.each([{}, { roster: [] }, { roster: [{ sections: {} }] }, { roster: [{ sections: [{ data: null }] }] },
    { roster: [{ sections: [{ data: [{ row: { player_id: '12345' } }] }] }] }])('returns 502 for malformed roster %j', async (payload) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(payload)));
    const response = await exports.default.fetch(url, { headers: await authHeaders() });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Current roster lookup is unavailable. Enter a HockeyTech player ID manually or try again later.' });
  });

  it.each(['http', 'network', 'json'])('returns 502 for upstream %s failures', async (failure) => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (failure === 'network') throw new Error('upstream unreachable');
      return new Response('not JSON', { status: failure === 'http' ? 503 : 200 });
    }));
    expect((await exports.default.fetch(url, { headers: await authHeaders() })).status).toBe(502);
  });
});
