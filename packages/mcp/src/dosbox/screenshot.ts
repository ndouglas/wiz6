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

// Single bare key (no F12 host-key chord): our custom mapper
// (tools/dosbox/mapper-wiz6.map) rebinds hand_scrshot to F9. Synthetic
// held-modifier chords are unreliable on macOS; a plain keypress is not.
// DOSBox-X must be frontmost to receive it.
const SCREENSHOT_KEY = 'F9';

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
      if (path !== null) {
        // The file's mtime advances at *creation*, before DOSBox-X has
        // flushed the PNG bytes. Reading on first sight yields a 0-byte (or
        // truncated) image. Wait until the size is non-zero AND unchanged
        // across one poll interval, then read the fully-written file.
        const size1 = statSync(path).size;
        if (size1 > 0) {
          await new Promise((r) => setTimeout(r, pollIntervalMs));
          if (statSync(path).size === size1) return readFileSync(path);
        }
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    throw new Error(
      `DOSBox-X did not write a screenshot — verify [dosbox] captures= in tools/dosbox/wiz6.conf and that the path is writable.`,
    );
  });
}
