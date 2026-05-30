/**
 * Spike-target integration smoke. Gated on WIZ6_MCP_INTEGRATION=1.
 *
 * Exercises the full closed loop:
 *  1. Launch DOSBox-X (via the existing lifecycle tool — adapt to whatever
 *     export shape lifecycle.ts has).
 *  2. Wait for title page.
 *  3. Send keys to reach ADD PARTY MEMBER → NEW CHARACTER → name input.
 *  4. Type NATHAN.
 *  5. Screenshot.
 *  6. Save state to slot 5.
 *
 * Requires:
 *   - macOS with Accessibility permission for the test runner.
 *   - DOSBox-X installed at the path in wiz6.conf.
 *   - A captures directory configured.
 *
 * Spec: docs/superpowers/specs/2026-05-30-dosbox-mcp-dynamic-driving-design.md
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HelperClient } from '../../src/dosbox/helper-client.js';
import { sendMacro } from '../../src/dosbox/input.js';
import { captureScreenshot } from '../../src/dosbox/screenshot.js';
import { saveStateToSlot } from '../../src/dosbox/state.js';
import { resolveCapturesDir } from '../../src/dosbox/captures-dir.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const WIZ6_CONF = join(REPO_ROOT, 'tools', 'dosbox', 'wiz6.conf');
const SAVE_DIR = join(REPO_ROOT, 'tools', 'dosbox', 'save');

const INTEGRATION = process.env.WIZ6_MCP_INTEGRATION === '1';

describe.skipIf(!INTEGRATION)('spike target — closed-loop integration', () => {
  it('launch → name input → screenshot → save → inspect', async () => {
    const client = new HelperClient();
    try {
      // 1. Launch.
      // NOTE: adapt this to the actual export shape of src/tools/lifecycle.ts.
      // If the lifecycle tools are only registered as MCP tools (no plain
      // function exports), spawn DOSBox-X directly here. Adapt as needed.
      // For now this test ASSUMES DOSBox-X is already running externally —
      // tune during first integration run.

      // 2. Wait for title page.
      await new Promise((r) => setTimeout(r, 4000));
      // 3+4. Send keys (exact sequence to be tuned during first run).
      await sendMacro(client, 'enter enter');
      await new Promise((r) => setTimeout(r, 500));
      await sendMacro(client, 'enter');
      await new Promise((r) => setTimeout(r, 500));
      await sendMacro(client, 'enter');
      await new Promise((r) => setTimeout(r, 500));
      await sendMacro(client, 'enter');
      await new Promise((r) => setTimeout(r, 500));
      await sendMacro(client, '"NATHAN" enter', { interKeyDelayMs: 50 });

      // 5. Screenshot.
      const png = await captureScreenshot(client, resolveCapturesDir(WIZ6_CONF));
      expect(png.length).toBeGreaterThan(100);
      expect(png.slice(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

      // 6. Save state to slot 5.
      await saveStateToSlot(client, 5, SAVE_DIR);
      expect(existsSync(join(SAVE_DIR, '5.sav'))).toBe(true);
    } finally {
      await client.shutdown();
    }
  }, 30_000);
});
