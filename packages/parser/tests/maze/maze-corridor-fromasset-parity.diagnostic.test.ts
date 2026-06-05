/**
 * maze-corridor-fromasset-parity.diagnostic.test.ts — from-asset background
 * (INFORMATIONAL diagnostic, NOT a gate — excluded from default CI; runnable via
 * `pnpm test:diagnostics`).
 *
 * Composes the maze-corridor background ENTIRELY FROM DISK ASSETS:
 *   mazedata.ega -> expandMazeData (Gap A, byte-exact static placement records +
 *   4-plane sub-images) + the captured per-view interleaved BLIT CALL list (Gap B,
 *   captured byte-exact at ega.drv FUN_0a93 via the patched trace core) -> the OR-blit
 *   walk (composeBackground) + the masked-MIRROR walk (applyMaskedMirror) ->
 *   decode -> crop to viewport.
 *
 * ── WHY DIAGNOSTIC (not the 100% gate) ──
 * The masked-mirror blit GEOMETRY is CRACKED byte-exact (gated by
 * maze-masked-mirror-parity.test.ts against the engine's per-call write). BUT the
 * full from-asset VIEWPORT compose can't be gated at 100% here:
 *   - The committed oracle (maze-corridor.idx.gz) is the gy=121 frame; the patched
 *     trace core (the only way to capture the live interleaved call list) settles a
 *     fresh drive at gy=118 — a DIFFERENT cell/perspective → a different placement
 *     selection. The captured call list below is the gy=118 frame's.
 *   - The engine's transient compose page (overwritten by partial redraws) can't be
 *     captured cleanly for a whole-page oracle.
 * So this diagnostic LOCKS the from-asset path (expander records byte-exact ->
 * composeBackground + applyMaskedMirror) against regressions and tracks the
 * reproduction level. The masked GEOMETRY itself is the byte-exact gate; this is the
 * end-to-end composition the gy=121 oracle would gate once the frame-mismatch is
 * resolved. Full RE: docs/re/findings/maze-masked-mirror.json +
 * maze-placement-selection.json.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { composeBackground, applyMaskedMirror } from '../../src/maze/background.js';
import { expandMazeData, orPlacementFor, maskedMirrorFor } from '../../src/maze/maze-data.js';
import { PLANE_STRIDE, PAGE_ROW_BYTES, MAZE_VIEWPORT } from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../..');

// The captured per-view INTERLEAVED blit call list for maze-corridor (gy=118,
// facing0), in engine emit order — captured single-drive at ega.drv FUN_0a93 0xaa1/
// 0xaad/0xbca via tools/libretro/trace-maze.ts (interleave). `b`: 'M' masked, 'OR'
// forward. For masked calls, a0c = SOURCE placement, a10 = DEST placement. REPLACE
// (flag 0 = void carve) dst placements are listed in REPLACE_DST; the rest OR-merge.
type Call = { b: 'M' | 'OR'; a0c: number; a10: number };
const CALLS: Call[] = [
  { b: 'M', a0c: 122, a10: 122 }, { b: 'M', a0c: 150, a10: 150 },
  { b: 'M', a0c: 19, a10: 15 }, { b: 'M', a0c: 15, a10: 19 },
  { b: 'M', a0c: 123, a10: 123 }, { b: 'M', a0c: 151, a10: 151 },
  { b: 'M', a0c: 20, a10: 16 }, { b: 'M', a0c: 16, a10: 20 },
  { b: 'M', a0c: 124, a10: 124 }, { b: 'M', a0c: 152, a10: 152 },
  { b: 'M', a0c: 21, a10: 17 }, { b: 'M', a0c: 17, a10: 21 },
  { b: 'M', a0c: 125, a10: 125 }, { b: 'M', a0c: 153, a10: 153 },
  { b: 'M', a0c: 141, a10: 137 }, { b: 'M', a0c: 169, a10: 165 },
  { b: 'M', a0c: 137, a10: 141 }, { b: 'M', a0c: 165, a10: 169 },
  { b: 'M', a0c: 34, a10: 31 }, { b: 'M', a0c: 31, a10: 34 },
  { b: 'M', a0c: 25, a10: 25 }, { b: 'M', a0c: 28, a10: 28 },
  { b: 'M', a0c: 32, a10: 29 }, { b: 'M', a0c: 29, a10: 32 },
  { b: 'M', a0c: 23, a10: 23 }, { b: 'M', a0c: 26, a10: 26 },
  ...[361, 349, 355, 346, 352, 358, 122, 150, 15, 19, 123, 151, 16, 20, 124, 152,
    136, 164, 140, 168, 125, 153, 133, 161, 137, 165, 141, 169, 145, 173].map(
    (i): Call => ({ b: 'OR', a0c: i, a10: 0xffff }),
  ),
  { b: 'M', a0c: 33, a10: 30 }, { b: 'M', a0c: 30, a10: 33 },
  { b: 'M', a0c: 24, a10: 24 }, { b: 'M', a0c: 27, a10: 27 },
];
// Masked REPLACE (flag 0) dst placements — the void-carve calls (rest are OR-merge).
const REPLACE_DST = new Set([34, 25, 28, 29, 32, 23, 26, 11, 27, 30, 33, 24]);

function loadMazeData(): Uint8Array {
  return new Uint8Array(readFileSync(resolve(ROOT, 'test-fixtures/original/mazedata.ega')));
}

function engineViewport(): Uint8Array {
  const raw = gunzipSync(readFileSync(resolve(ROOT, 'tools/parity/fixtures/engine/maze-corridor.idx.gz')));
  const full = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const { x, y, w, h } = MAZE_VIEWPORT;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out[r * w + c] = full[(y + r) * 320 + x + c]!;
  return out;
}

function decodeViewport(page: Uint8Array): Uint8Array {
  const { x, y, w, h } = MAZE_VIEWPORT;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const px = x + c, py = y + r;
    const off = py * PAGE_ROW_BYTES + (px >> 3);
    const bit = 7 - (px & 7);
    let v = 0;
    for (let p = 0; p < 4; p++) v |= ((page[off + p * PLANE_STRIDE]! >> bit) & 1) << p;
    out[r * w + c] = v;
  }
  return out;
}

describe('maze-corridor from-asset background (DIAGNOSTIC — OR + masked-mirror)', () => {
  const wb = expandMazeData(loadMazeData());

  it('expander records are byte-exact for the captured selection (Gap A invariant)', () => {
    expect(wb.placements[122]!).toEqual({ imgIdx: 44, destX: 11, destRow: 32, bias: 0, count: 18 });
    expect(wb.descs[wb.placements[122]!.imgIdx]!).toEqual({ segDelta: 0x822, srcOffLow: 0xb, w: 18, h: 7 });
    expect(wb.descs[wb.placements[15]!.imgIdx]!).toEqual({ segDelta: 0x253, srcOffLow: 0xf, w: 4, h: 112 });
  });

  it('the captured call list composes a valid from-asset background (OR + masked)', () => {
    const page = new Uint8Array(4 * PLANE_STRIDE);
    for (const c of CALLS) {
      if (c.b === 'OR') composeBackground(page, [orPlacementFor(wb, c.a0c)]);
      else {
        const mode = REPLACE_DST.has(c.a10) ? 'replace' : 'or';
        applyMaskedMirror(page, maskedMirrorFor(wb, c.a0c, c.a10, mode));
      }
    }
    // Sanity: the compose writes the ceiling row (page byte 12, y32, plane3).
    expect(page[3 * PLANE_STRIDE + 32 * PAGE_ROW_BYTES + 12]).toBeGreaterThan(0);
  });

  it('reports the from-asset reproduction (frame-mismatch: captured gy=118 vs oracle gy=121)', () => {
    const page = new Uint8Array(4 * PLANE_STRIDE);
    for (const c of CALLS) {
      if (c.b === 'OR') composeBackground(page, [orPlacementFor(wb, c.a0c)]);
      else {
        const mode = REPLACE_DST.has(c.a10) ? 'replace' : 'or';
        applyMaskedMirror(page, maskedMirrorFor(wb, c.a0c, c.a10, mode));
      }
    }
    const ours = decodeViewport(page);
    const eng = engineViewport();
    const N = MAZE_VIEWPORT.w * MAZE_VIEWPORT.h;
    let match = 0;
    for (let i = 0; i < N; i++) if (ours[i] === eng[i]) match++;
    const pct = (100 * match) / N;
    // Informational: the captured call list is the gy=118 frame; the oracle is gy=121.
    // The masked GEOMETRY is byte-exact (maze-masked-mirror-parity.test.ts); this
    // reproduction is bounded by the frame-mismatch, not the decoder. Floor is loose.
    expect(pct).toBeGreaterThan(40);
  });
});
