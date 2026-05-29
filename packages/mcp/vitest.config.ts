import { defineConfig } from 'vitest/config';

const RUN_DIAGNOSTICS = process.env.WIZ6_RUN_DIAGNOSTICS === '1';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    ...(RUN_DIAGNOSTICS
      ? { include: ['tests/**/*.diagnostic.test.ts'], exclude: ['**/node_modules/**'] }
      : { exclude: ['**/node_modules/**', '**/*.diagnostic.test.{ts,tsx}'] }),
  },
});
