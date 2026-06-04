/**
 * compose-maze-view.test.ts — viewport-only parity for the zone-0 corridor view.
 *
 * The maze viewport is reconstructed from the geometry-derived tile partition
 * (maze-corridor-tiles.json). Test (c) is the real gate: it crops the engine
 * fixture (maze-corridor.idx.gz) to the MAZE_VIEWPORT rect, maps each index via
 * COMPOSED_PALETTE, and asserts our composed RGBA matches it pixel-for-pixel
 * (100%). Tests (a)/(b) are cheap sanity checks (buffer size + non-blank).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAZE_VIEWPORT } from '@wiz6/data';
import { COMPOSED_PALETTE } from '../../../../tools/parity/decode-screen.js';
import { composeMazeViewport, type MazeTiles } from '../../src/pages/game/compose-maze-view.js';
import tilesJson from '../../src/data/maze-corridor-tiles.json' assert { type: 'json' };

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(HERE, '../../../../tools/parity/fixtures/engine/maze-corridor.idx.gz');
const SCREEN_W = 320;

const data = tilesJson as unknown as MazeTiles;

describe('composeMazeViewport', () => {
  it('(a) returns a viewport-sized RGBA buffer', () => {
    const buf = composeMazeViewport(data);
    expect(buf.length).toBe(MAZE_VIEWPORT.w * MAZE_VIEWPORT.h * 4);
  });

  it('(b) is non-blank across distinct regions', () => {
    const buf = composeMazeViewport(data);
    // Viewport-relative pixel picker.
    const at = (sx: number, sy: number) => {
      const vx = sx - MAZE_VIEWPORT.x;
      const vy = sy - MAZE_VIEWPORT.y;
      const o = (vy * MAZE_VIEWPORT.w + vx) * 4;
      return [buf[o], buf[o + 1], buf[o + 2], buf[o + 3]];
    };
    const isSet = (px: number[]) => px[3] === 0xff;
    // A near LEFT wall pixel, a near RIGHT wall pixel, a floor pixel, the gate
    // center — all should be opaque (alpha set) somewhere with non-uniform colour.
    const samples = [
      at(80, 70), // wallLeft0
      at(240, 70), // wallRight0
      at(160, 120), // floor
      at(160, 70), // gate center
    ];
    for (const s of samples) expect(isSet(s)).toBe(true);
    // Not every pixel is identical (the frame has real content).
    const first = at(80, 70).join(',');
    const someDiffer = samples.some((s) => s.join(',') !== first);
    expect(someDiffer).toBe(true);
  });

  it('(c) reconstructs the engine viewport pixel-for-pixel (100%)', () => {
    const idx = new Uint8Array(gunzipSync(readFileSync(FIX)));
    const buf = composeMazeViewport(data);

    let mismatches = 0;
    let firstMismatch: string | null = null;
    for (let vy = 0; vy < MAZE_VIEWPORT.h; vy++) {
      for (let vx = 0; vx < MAZE_VIEWPORT.w; vx++) {
        const sx = MAZE_VIEWPORT.x + vx;
        const sy = MAZE_VIEWPORT.y + vy;
        const expected = COMPOSED_PALETTE[idx[sy * SCREEN_W + sx]!]!;
        const o = (vy * MAZE_VIEWPORT.w + vx) * 4;
        if (buf[o] !== expected[0] || buf[o + 1] !== expected[1] || buf[o + 2] !== expected[2]) {
          mismatches++;
          if (firstMismatch === null) {
            firstMismatch = `screen(${sx},${sy}) got [${buf[o]},${buf[o + 1]},${buf[o + 2]}] want [${expected[0]},${expected[1]},${expected[2]}]`;
          }
        }
      }
    }
    const total = MAZE_VIEWPORT.w * MAZE_VIEWPORT.h;
    const matchPct = ((total - mismatches) / total) * 100;
    expect(mismatches, `${mismatches}/${total} px differ (${matchPct.toFixed(2)}% match); first: ${firstMismatch}`).toBe(0);
  });
});
