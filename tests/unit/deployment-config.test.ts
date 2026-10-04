import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Cloudflare deployment configuration', () => {
  it('routes roster requests through the public Worker endpoint', () => {
    const config = JSON.parse(readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8'));
    // Same-zone Worker fetches return Cloudflare error 1042 without this flag,
    // even though mocked lookup tests and direct browser requests succeed.
    expect(config.compatibility_flags).toContain('global_fetch_strictly_public');
  });
});
