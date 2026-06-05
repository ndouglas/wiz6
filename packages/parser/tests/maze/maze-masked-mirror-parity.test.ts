/**
 * maze-masked-mirror-parity.test.ts — GATE (`.test.ts`, default CI) for the
 * masked-MIRROR blit geometry (ega.drv FUN_0a93 SECOND branch, file 0xbc6).
 *
 * The masked branch draws a HORIZONTALLY-MIRRORED copy of one image into a dest
 * placement's geometry: per row/plane, read `cx` source bytes BACKWARD (asm `dec si`),
 * bit-reverse each via the CS:[0x192] LUT (the `cs: xlatb` at 0xc69), then OR-merge
 * (flag != 0) or REPLACE (flag 0). It composites the perspective ceiling/floor/side
 * strips and carves the receding-corridor void.
 *
 * ── WHAT IS GATED (byte-exact, tolerance 0) ──
 * `applyMaskedMirror` + `maskedMirrorFor` (built from mazedata.ega off the pinned
 * test image) reproduce the ENGINE'S OWN per-call masked write byte-exact. The
 * ground truth is captured LIVE from the patched trace core: call#0 of the
 * maze-corridor compose pass = masked OR-merge of placement 122 into placement 122
 * geometry (di0=0x50b, cx=18, rows=7, 4 planes). The capture region's "before" bytes
 * are committed alongside the "after" bytes, so the test seeds the page with "before"
 * and asserts the masked write yields "after" — the engine's actual masked pixels.
 *
 * This pins the masked-mirror DECODER (mirror direction + bit-reverse LUT + OR/REPLACE
 * + the per-row source/dest addressing) against engine ground truth, independent of
 * the (frame-dependent, transient) full-page compose. RE:
 * docs/re/findings/maze-masked-mirror.json.
 *
 * NOTE: the full from-asset VIEWPORT gate (compose the whole page from disk + assert
 * vs maze-corridor.idx.gz) is NOT landed here — the committed oracle is the gy=121
 * frame, which is unreachable as a stable frame on the patched trace core (a fresh
 * drive settles at gy=118), and the engine's transient compose page can't be captured
 * cleanly post-settle for the committed frame. The masked-mirror GEOMETRY itself is
 * proven byte-exact by this per-call gate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PLANE_STRIDE, PAGE_ROW_BYTES } from '@wiz6/data';
import { applyMaskedMirror, MAZE_BITREV } from '../../src/maze/background.js';
import { expandMazeData, maskedMirrorFor } from '../../src/maze/maze-data.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../..');

interface Call0Vector {
  di0: number;
  cx: number;
  rows: number;
  len: number;
  srcPlacement: number;
  dstPlacement: number;
  mode: 'or' | 'replace';
  before: Record<string, number[]>; // plane index -> bytes
  after: Record<string, number[]>;
}

function loadVector(): Call0Vector {
  return JSON.parse(
    readFileSync(resolve(here, '../../src/maze/__fixtures__/maze-masked-mirror-call0.json'), 'utf8'),
  ) as Call0Vector;
}

function loadMazeData(): Uint8Array {
  return new Uint8Array(readFileSync(resolve(ROOT, 'test-fixtures/original/mazedata.ega')));
}

describe('masked-mirror blit (ega.drv FUN_0a93 file-0xbc6) — geometry gate', () => {
  it('MAZE_BITREV is the exact 8-bit reverse table (= the engine CS:[0x192] LUT)', () => {
    for (let i = 0; i < 256; i++) {
      let v = 0;
      for (let b = 0; b < 8; b++) v |= ((i >> b) & 1) << (7 - b);
      expect(MAZE_BITREV[i]).toBe(v);
    }
  });

  it('maskedMirrorFor builds the asm-derived per-row geometry for call#0 (122→122)', () => {
    const wb = expandMazeData(loadMazeData());
    const m = maskedMirrorFor(wb, 122, 122, 'or');
    // placement 122 = img44 @ destX11 destRow32 bias0 count18; desc w18 h7 srcOffLow0xb segDelta0x822.
    expect(m.cx).toBe(18);
    expect(m.h).toBe(7);
    expect(m.w).toBe(18);
    expect(m.planeStride).toBe(18 * 7);
    expect(m.di).toBe(11 + 0 + 0x28 * 32); // = 0x50b
    expect(m.di).toBe(0x50b);
    // siBase = segDelta*16 + srcOffLow + (w-1) - bias = 0x822*16 + 0xb + 17 - 0
    expect(m.siBase).toBe(0x822 * 16 + 0xb + 17);
  });

  it('applyMaskedMirror reproduces the ENGINE call#0 masked write byte-exact (4 planes)', () => {
    const v = loadVector();
    expect(v.srcPlacement).toBe(122);
    expect(v.dstPlacement).toBe(122);
    expect(v.mode).toBe('or');

    const wb = expandMazeData(loadMazeData());
    const m = maskedMirrorFor(wb, v.srcPlacement, v.dstPlacement, v.mode);
    expect(m.di).toBe(v.di0);
    expect(m.cx).toBe(v.cx);
    expect(m.h).toBe(v.rows);

    // Seed the page with the engine's captured "before" bytes at the dest region,
    // for each plane, so the OR-merge has the same starting state the engine had.
    const page = new Uint8Array(4 * PLANE_STRIDE);
    for (let p = 0; p < 4; p++) {
      const before = v.before[String(p)]!;
      for (let i = 0; i < before.length; i++) page[p * PLANE_STRIDE + v.di0 + i] = before[i]!;
    }

    applyMaskedMirror(page, m);

    // Assert the dest region (rows × cx, per plane) equals the engine's "after".
    let checked = 0;
    for (let p = 0; p < 4; p++) {
      const after = v.after[String(p)]!;
      for (let row = 0; row < v.rows; row++) {
        const dRow = v.di0 + row * PAGE_ROW_BYTES;
        for (let b = 0; b < v.cx; b++) {
          const idx = row * PAGE_ROW_BYTES + b; // index into the captured region
          expect(page[p * PLANE_STRIDE + dRow + b]).toBe(after[idx]);
          checked++;
        }
      }
    }
    // 4 planes × 7 rows × 18 bytes = 504 bytes validated against engine ground truth.
    expect(checked).toBe(4 * v.rows * v.cx);
  });
});
