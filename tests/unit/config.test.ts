import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const gitignore = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8');

describe('repository checks', () => {
  it('defines the expected verification scripts and excludes local secrets', () => {
    for (const script of ['verify', 'test:unit', 'test:ui', 'test:worker', 'typecheck', 'build']) expect(packageJson.scripts[script]).toBeTruthy();
    expect(gitignore).toMatch(/^\.dev\.vars$/m);
  });
});
