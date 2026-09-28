import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('initial migration', () => {
  it('creates an empty application schema without fictional player records', async () => {
    const players = await env.DB.prepare('SELECT count(*) AS count FROM players').first<{ count: number }>();
    expect(players?.count).toBe(0);
    const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all<{ name: string }>();
    expect(tables.results.map(({ name }) => name)).toEqual(expect.arrayContaining(['players', 'photos', 'sessions', 'login_attempts', 'site_settings']));
  });
});
