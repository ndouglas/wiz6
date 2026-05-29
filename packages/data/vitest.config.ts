import { defineConfig } from 'vitest/config';

const RUN_DIAGNOSTICS = process.env.WIZ6_RUN_DIAGNOSTICS === '1';

export default defineConfig({
  test: {
    include: RUN_DIAGNOSTICS
      ? ['tests/**/*.diagnostic.test.ts']
      : ['tests/**/*.test.ts'],
    exclude: RUN_DIAGNOSTICS
      ? ['**/node_modules/**']
      : ['**/node_modules/**', '**/*.diagnostic.test.{ts,tsx}'],
  },
});
