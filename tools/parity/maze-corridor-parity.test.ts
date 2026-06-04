/**
 * maze-corridor-parity.test.ts — full-frame (320×200) pixel-parity for the
 * zone-0 first-person corridor frame.
 *
 * The maze screen = the 3D dungeon VIEWPORT (MAZE_VIEWPORT rect) composed from
 * geometry-derived texture tiles (compose-maze-view.ts, already 100% vs the
 * viewport crop) BLITTED into the surrounding UI CHROME (red "Wizardry" banner,
 * 3 party portrait/status panels, bottom OPTIONS/TURN panel). The chrome is a
 * specific in-dungeon frame that the castle-frame compositor can't reproduce
 * (it needs live party/window state), so it is extracted as a static full-frame
 * background tile by extract-maze-tiles.ts and the viewport is painted on top.
 *
 * composeMazeFrame() = static chrome (identity outside the viewport) + viewport
 * (identity inside it) → the whole 320×200 frame is identical to the engine
 * fixture. Gate is a strict 100% match (tolerance 0).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indicesToRgba, SCREEN_WIDTH, SCREEN_HEIGHT } from './decode-screen.js';
import { compareRgba, writeDiffPng } from './diff-image.js';
import { composeMazeFrame } from '../../packages/viewer/src/pages/game/compose-maze-frame.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

function mainRoot(): string {
  try {
    const g = readFileSync(join(REPO_ROOT, '.git'), 'utf-8');
    const m = /gitdir:\s*(.+)/.exec(g);
    if (m) return resolve(m[1]!.trim().replace(/\/worktrees\/[^/]+$/, ''), '..');
  } catch {
    /* not a worktree */
  }
  return REPO_ROOT;
}
const ROOT = mainRoot();
const FIXTURES_ENGINE = join(ROOT, 'tools', 'parity', 'fixtures', 'engine');

function engineRgba(name: string): Uint8Array {
  const raw = gunzipSync(readFileSync(join(FIXTURES_ENGINE, `${name}.idx.gz`)));
  return indicesToRgba(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
}

describe('maze corridor full-frame pixel-parity vs committed fixture', () => {
  it('composeMazeFrame() returns a 320×200 RGBA buffer', () => {
    const frame = composeMazeFrame();
    expect(frame.length).toBe(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
  });

  it('maze-corridor: RGB match = 100% (tolerance 0)', () => {
    const ours = composeMazeFrame();
    const eng = engineRgba('maze-corridor');
    const result = compareRgba(ours, eng, { tolerance: 0 });

    try {
      writeDiffPng(ours, eng, join('/tmp', 'parity-diff-maze-corridor.png'), {
        tolerance: 0,
      });
    } catch {
      /* diagnostics non-fatal */
    }

    expect(
      result.matchPct,
      `maze-corridor: ${result.matchPct.toFixed(2)}% (${result.diffCount} px) — see /tmp/parity-diff-maze-corridor.png`,
    ).toBe(100);
  });
});
