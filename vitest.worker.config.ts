import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import { hashAdminPassword } from './worker/auth/password.ts';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [cloudflareTest(async () => ({
    wrangler: { configPath: './wrangler.jsonc' },
    miniflare: {
      bindings: {
        TEST_MIGRATIONS: await readD1Migrations(path.join(root, 'migrations')),
        ADMIN_PASSWORD_HASH: await hashAdminPassword('test-only-password-for-workers'),
      },
    },
  }))],
  test: { include: ['tests/worker/**/*.test.ts'], setupFiles: ['tests/worker/setup.ts'] },
});
