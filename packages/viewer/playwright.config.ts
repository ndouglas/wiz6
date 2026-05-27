import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for @wiz6/viewer e2e tests.
 *
 * Uses port 5199 to avoid colliding with the default dev-server ports
 * (5173-5175) which may be occupied by interactive dev sessions.
 *
 * The webServer runs `pnpm vite --port E2E_PORT` directly (not `pnpm dev`)
 * to bypass the `predev` hook and force a specific port. The predev hook
 * (pnpm -w run extract) is slow (~60s) and is NOT needed here because the
 * extracted/ assets are already present after a prior `pnpm dev` or
 * `pnpm -w run extract` run. In CI, run `pnpm -w run extract` before
 * invoking Playwright if a fresh extract is needed.
 *
 * webServer timeout is still generous (120s) to allow Vite to compile
 * React + workspace packages on a cold build.
 */
const E2E_PORT = 5199;
const BASE_URL = `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    headless: true,
    baseURL: BASE_URL,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Run vite directly (not via `pnpm dev`) to force the port without
    // triggering the predev extract. Assets must already be present.
    command: `pnpm vite --port ${E2E_PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // 120s: allows Vite cold build of React + workspace packages
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
