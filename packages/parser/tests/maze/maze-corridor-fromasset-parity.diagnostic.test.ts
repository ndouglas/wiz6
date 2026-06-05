/**
 * maze-corridor-fromasset-parity.diagnostic.test.ts — Gap B from-asset background
 * (INFORMATIONAL diagnostic, NOT a gate — excluded from default CI; runnable via
 * `pnpm test:diagnostics`).
 *
 * Composes the maze-corridor background ENTIRELY FROM DISK ASSETS:
 *   mazedata.ega -> expandMazeData (Gap A, byte-exact static placement records +
 *   4-plane sub-images) + the captured per-view OR placement-index SELECTION
 *   (Gap B, captured byte-exact at ega.drv FUN_0a93 [bp+0xc], reproducible) ->
 *   the OR-blit walk (parser composeBackground) -> decode -> crop to viewport.
 *
 * ── WHY DIAGNOSTIC (not the 100% gate) ──
 * The maze background OR-blit has TWO branches (ega.drv FUN_0a93):
 *   OR branch    (arg10==0xffff): single-image forward OR-blit — SELECTION CRACKED
 *                                 (the 30 OR indices below, byte-exact + stable).
 *   masked branch (arg10!=0xffff): a horizontal-MIRROR blit (reverse read + the
 *                                 cs:[0x192] bit-reverse LUT) that draws the
 *                                 perspective ceiling/floor/side strips AND carves
 *                                 the receding-corridor VOID (REPLACE mode). It is
 *                                 IDENTIFIED at the asm level but its exact masked
 *                                 source-pixel alignment is NOT yet byte-exact.
 * So the OR-only from-asset compose reproduces ~58% of the viewport — the masked
 * branch (the void + the mirror) is the open gap. The byte-exact 100% GATE remains
 * the engine-composed page (maze-corridor-viewport-parity.test.ts), unchanged.
 * Full RE: docs/re/findings/maze-placement-selection.json.
 *
 * This diagnostic LOCKS the captured OR selection + the from-asset OR-blit path
 * (expander records byte-exact -> composeBackground) so a regression in either is
 * caught, and tracks the current from-asset reproduction level.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { composeBackground } from '../../src/maze/background.js';
import { PLANE_STRIDE, PAGE_ROW_BYTES, MAZE_VIEWPORT, type BackgroundPlacement } from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../..');

// The captured per-view OR placement-index selection for maze-corridor (zone0,
// facing0), in engine emit order. Byte-exact + reproducible across fresh boots —
// captured at ega.drv FUN_0a93 [bp+0xc] via tools/libretro/trace-maze.ts placements.
const OR_PLACEMENT_INDICES = [
  361, 349, 355, 346, 352, 358, 122, 150, 15, 19, 123, 151, 16, 20, 124, 152,
  136, 164, 140, 168, 125, 153, 133, 161, 137, 165, 141, 169, 145, 173,
];

// ── expandMazeData (Gap A, mirrored from tools/parity/expand-asset.ts) ──
// FUN_0631: load mazedata.ega verbatim + normalize the descriptor table in place.
function u16(b: Uint8Array, o: number): number { return b[o]! | (b[o + 1]! << 8); }
interface Desc { segDelta: number; srcOffLow: number; w: number; h: number }
interface Place { imgIdx: number; destX: number; destRow: number; bias: number; count: number }
function expandMazeData(file: Uint8Array): { buffer: Uint8Array; descs: Desc[]; placements: Place[] } {
  const numDesc = u16(file, 0), numPlace = u16(file, 2);
  const placeOff = numDesc * 5 + 4;
  const blobStart = numPlace * 5 + placeOff;
  const blobLo = blobStart & 0xf, blobHi = blobStart >> 4;
  const buffer = new Uint8Array(file);
  const descs: Desc[] = [];
  for (let k = 0; k < numDesc; k++) {
    const bx = 4 + k * 5;
    const al = (buffer[bx + 2]! + blobLo) & 0xff;
    const srcOffLow = al & 0xf;
    const segDelta = (u16(buffer, bx) + (al >> 4) + blobHi) & 0xffff;
    descs.push({ segDelta, srcOffLow, w: buffer[bx + 3]!, h: buffer[bx + 4]! });
  }
  const placements: Place[] = [];
  for (let k = 0; k < numPlace; k++) {
    const o = placeOff + k * 5;
    placements.push({ imgIdx: buffer[o]!, destX: buffer[o + 1]!, destRow: buffer[o + 2]!, bias: buffer[o + 3]!, count: buffer[o + 4]! });
  }
  return { buffer, descs, placements };
}

function placedImageFor(wb: ReturnType<typeof expandMazeData>, idx: number): BackgroundPlacement {
  const p = wb.placements[idx]!;
  const d = wb.descs[p.imgIdx]!;
  const planeStride = d.w * d.h;
  return {
    src: wb.buffer,
    si: d.segDelta * 16 + d.srcOffLow + p.bias,
    di: p.destX + p.bias + PAGE_ROW_BYTES * p.destRow,
    cx: p.count, w: d.w, h: d.h, planeStride,
  };
}

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

describe('maze-corridor from-asset background (DIAGNOSTIC — OR selection + expander)', () => {
  const wb = expandMazeData(loadMazeData());

  it('expander records are byte-exact for the captured OR selection (Gap A invariant)', () => {
    // Spot-check the cracked placement records against the known live values.
    const p122 = wb.placements[122]!;
    const d44 = wb.descs[p122.imgIdx]!;
    expect(p122).toEqual({ imgIdx: 44, destX: 11, destRow: 32, bias: 0, count: 18 });
    expect(d44).toEqual({ segDelta: 0x822, srcOffLow: 0xb, w: 18, h: 7 });
    const p15 = wb.placements[15]!;
    expect(wb.descs[p15.imgIdx]!).toEqual({ segDelta: 0x253, srcOffLow: 0xf, w: 4, h: 112 });
  });

  it('the captured OR selection composes a valid from-asset background (OR-blit path)', () => {
    const page = new Uint8Array(4 * PLANE_STRIDE);
    const images = OR_PLACEMENT_INDICES.map((i) => placedImageFor(wb, i));
    composeBackground(page, images);
    // Sanity: the OR compose writes the ceiling row (page byte 12, y32, plane3).
    expect(page[3 * PLANE_STRIDE + 32 * PAGE_ROW_BYTES + 12]).toBeGreaterThan(0);
  });

  it('reports the from-asset OR-only viewport reproduction (the masked branch is the gap)', () => {
    const page = new Uint8Array(4 * PLANE_STRIDE);
    composeBackground(page, OR_PLACEMENT_INDICES.map((i) => placedImageFor(wb, i)));
    const ours = decodeViewport(page);
    const eng = engineViewport();
    const N = MAZE_VIEWPORT.w * MAZE_VIEWPORT.h;
    let match = 0;
    for (let i = 0; i < N; i++) if (ours[i] === eng[i]) match++;
    const pct = (100 * match) / N;
    // Informational floor: the OR-only from-asset compose reproduces ~58% of the
    // viewport. The masked-mirror branch (perspective + void carve) is the open
    // gap to 100% — see docs/re/findings/maze-placement-selection.json.
    expect(pct).toBeGreaterThan(55);
  });
});
