/**
 * Screenshot layer — focuses DOSBox, sends DOSBox-X's "Take screenshot"
 * host-key chord, polls the captures directory for the newest .png, returns
 * bytes.
 *
 * Default chord on macOS DOSBox-X 2026.05.02 is **F12+P** (verified via the
 * Capture menu in the running app: "Take screenshot [F12+P]"). F12 is the
 * configured host key on non-Windows platforms; see PERMISSIONS.md and
 * input.ts for the host-key chord protocol.
 *
 * Spec: docs/superpowers/specs/2026-05-30-dosbox-mcp-dynamic-driving-design.md
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { withFocusedDosbox } from './window.js';
import { sendKey } from './input.js';
import type { HelperClient } from './helper-client.js';

// Lowercase 'p' deliberately — DOSBox-X's SDL mapper matches the keysym
// (SDLK_p) regardless of the menu label's visual case. Adding Shift would
// produce a different keysym and the chord would miss.
const SCREENSHOT_KEY = 'F12+p';

export function findNewestPngSince(dir: string, sinceMs: number): string | null {
  let bestPath: string | null = null;
  let bestMtime = 0;
  for (const name of readdirSync(dir)) {
    if (!name.toLowerCase().endsWith('.png')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    const mtimeMs = st.mtimeMs;
    if (mtimeMs > sinceMs && mtimeMs > bestMtime) {
      bestMtime = mtimeMs;
      bestPath = full;
    }
  }
  return bestPath;
}

export interface ScreenshotOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export async function captureScreenshot(
  client: HelperClient,
  capturesDir: string,
  opts: ScreenshotOptions = {},
): Promise<Buffer> {
  const pollIntervalMs = opts.pollIntervalMs ?? 50;
  const timeoutMs = opts.timeoutMs ?? 2000;
  const since = Date.now();
  return withFocusedDosbox(client, async () => {
    await sendKey(client, SCREENSHOT_KEY);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const path = findNewestPngSince(capturesDir, since);
      if (path !== null) return readFileSync(path);
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    throw new Error(
      `DOSBox-X did not write a screenshot — verify [render] captures= in tools/dosbox/wiz6.conf and that the path is writable.`,
    );
  });
}
