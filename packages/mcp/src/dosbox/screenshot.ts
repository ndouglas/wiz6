/**
 * Screenshot layer — focuses DOSBox, sends Ctrl+F5 (DOSBox's built-in capture
 * key), polls the captures directory for the newest .png, returns bytes.
 *
 * Spec: docs/superpowers/specs/2026-05-30-dosbox-mcp-dynamic-driving-design.md
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { withFocusedDosbox } from './window.js';
import { sendKey } from './input.js';
import type { HelperClient } from './helper-client.js';

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
    await sendKey(client, 'Ctrl+F5');
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
