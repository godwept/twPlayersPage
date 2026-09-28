import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('continuous integration workflow', () => {
  it('checks dependencies, tests, typechecking and build without deploying', () => {
    const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('npm run verify');
    expect(workflow).not.toMatch(/wrangler deploy|deploy-production/i);
  });
});
