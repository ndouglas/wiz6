import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const RUN_DIAGNOSTICS = process.env.WIZ6_RUN_DIAGNOSTICS === '1';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: RUN_DIAGNOSTICS
      ? ['tests/**/*.diagnostic.test.{ts,tsx}']
      : ['tests/**/*.test.{ts,tsx}'],
    exclude: RUN_DIAGNOSTICS
      ? ['**/node_modules/**']
      : ['**/node_modules/**', '**/*.diagnostic.test.{ts,tsx}'],
  },
});
