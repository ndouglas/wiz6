/**
 * maze-generator.test.ts — the maze BUILD-phase span law + the
 * (walltype,depth,seamIdx) -> FUN_1c94 call-list flush, derived from static
 * wmaze.ovr disasm (view_render_corridor_frame 0x4ad7: BUILD depth loop +
 * span_append 0x3f8d + FLUSH Pass B @0x52f8). See
 * docs/re/findings/maze-span-build.json.
 *
 * Gates:
 *  1. generateCallList(<live single-frame span list>) reproduces the TRUE
 *     single-frame FUN_1c94 call list (one call per wt!=0xff span). The y3
 *     frame -> [0xe@144/60, 0xb@147/59]; the y2 frame -> [0xf@152/64,
 *     0xc@153/64, 0xd@136/53]. (Validated live: the y3 list renders the wall
 *     region 100.00% byte-exact vs the engine composed page.)
 *  2. refineSpanColumns reproduces the live span x0/x1 from the seam tables.
 *
 * CORRECTION to the prior gate: the earlier 11-call expectation conflated two
 * frames (a held-ENTER forceRedraw drove y2->y3 + extra redraws). The correct
 * per-frame flush emits exactly one FUN_1c94 per wt!=0xff span.
 */
import { describe, it, expect } from 'vitest';
import {
  generateCallList,
  refineSpanColumns,
  cornerSolidSeamIdx,
  deriveCorridorSpans,
  MAZE_FRAME_Y3_SPANS,
  MAZE_FRAME_Y2_SPANS,
} from './render-maze-frame.js';

// Live seam tables for walltype 2 (DGROUP 0x36e4 / 0x3717 slices, read at base
// 0xffa0; offset = 0x13a*2). Only the first 0x20 bytes are populated/used here.
const SEAM_X0_WT2 = Uint8Array.from([
  0x00, 0x00, 0x87, 0x87, 0x91, 0x91, 0x9a, 0x9a, 0x48, 0x48, 0x69, 0x69, 0x82, 0x82, 0xd5, 0xd5,
  0xbf, 0xbf, 0xb2, 0xb2, 0x88, 0x88, 0x93, 0x93, 0x99, 0x99, 0x88, 0x88, 0x90, 0x90, 0x98, 0x98,
]);
const SEAM_X1_WT2 = Uint8Array.from([
  0x00, 0x39, 0x3e, 0x42, 0x39, 0x3a, 0x3f, 0x39, 0x3a, 0x3f, 0x34, 0x3b, 0x40, 0x35, 0x3c, 0x40,
  0x34, 0x34, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);
// refineSpanColumns indexes 0x13a*wt + k; build a sparse buffer with the wt=2
// slice placed at offset 0x13a*2 so the index math matches.
const seamBufFrom = (slice: Uint8Array) => {
  const b = new Uint8Array(0x13a * 3 + 0x40);
  b.set(slice, 0x13a * 2);
  return b;
};
const SEAM_X0 = seamBufFrom(SEAM_X0_WT2);
const SEAM_X1 = seamBufFrom(SEAM_X1_WT2);

describe('maze FUN_1c94 call-list generator (flush Pass B, single-frame)', () => {
  it('y3 frame -> [0xe@144/60, 0xb@147/59] (one call per wt!=0xff span)', () => {
    const gen = generateCallList(MAZE_FRAME_Y3_SPANS);
    expect(gen.map((c) => [c.piece, c.x0, c.arg10])).toEqual([
      [0xe, 144, 60],
      [0xb, 147, 59],
    ]);
  });

  it('y2 frame -> [0xf@152/64, 0xc@153/64, 0xd@136/53]', () => {
    const gen = generateCallList(MAZE_FRAME_Y2_SPANS);
    expect(gen.map((c) => [c.piece, c.x0, c.arg10])).toEqual([
      [0xf, 152, 64],
      [0xc, 153, 64],
      [0xd, 136, 53],
    ]);
  });

  it('emits exactly one call per wt!=0xff span (no over-count)', () => {
    const wallSpans = MAZE_FRAME_Y3_SPANS.filter((s) => s.walltype !== 0xff);
    expect(generateCallList(MAZE_FRAME_Y3_SPANS)).toHaveLength(wallSpans.length);
  });

  it('uses the span seamIdx as the piece byte (the bridge invariant)', () => {
    const gen = generateCallList(MAZE_FRAME_Y3_SPANS);
    const validSeams = new Set(
      MAZE_FRAME_Y3_SPANS.filter((s) => s.walltype !== 0xff).map((s) => s.seamIdx),
    );
    for (const c of gen) expect(validSeams.has(c.piece)).toBe(true);
  });

  it('skips walltype==0xff spans (those are edge-emit / Pass A only)', () => {
    const spans = [
      { x0: 100, x1: 50, clipLo: 72, clipHi: 248, walltype: 0xff, seamIdx: 3, depthField: 0 },
      { x0: 110, x1: 55, clipLo: 72, clipHi: 248, walltype: 2, seamIdx: 0xb, depthField: 0 },
    ];
    const gen = generateCallList(spans);
    expect(gen).toHaveLength(1);
    expect(gen[0]!.piece).toBe(0xb);
  });
});

describe('maze span seam-refinement (span_append 0x3f8d)', () => {
  // The solid-wall emitter pushes x0_base = x1_base = 0, so refined x0/x1 ARE
  // the seam-table values. Validated byte-exact against all 6 wt=2 spans.
  const CASES: Array<[number, number, number]> = [
    // [seamIdx, expected x0, expected x1]
    [0xa, 136, 52], // y2 depth0
    [0xb, 147, 59], // y3 depth1 (left)
    [0xc, 153, 64], // y2 depth2
    [0xd, 136, 53], // y2 depth1
    [0xe, 144, 60], // y3 depth2 (right)
    [0xf, 152, 64], // y2 depth3
  ];
  for (const [seamIdx, x0, x1] of CASES) {
    it(`seamIdx 0x${seamIdx.toString(16)} (wt2) -> x0=${x0} x1=${x1}`, () => {
      const r = refineSpanColumns(0, 0, 2, seamIdx, SEAM_X0, SEAM_X1);
      expect(r.x0).toBe(x0);
      expect(r.x1).toBe(x1);
    });
  }

  it('no refinement for walltype 0xff (edge markers)', () => {
    const r = refineSpanColumns(24, 27, 0xff, 0, SEAM_X0, SEAM_X1);
    expect(r).toEqual({ x0: 24, x1: 27 });
  });
});

describe('maze seamIdx law (corner type-9 solid; closed-form, no live span read)', () => {
  // seamIdx = depthField + sideBase, sideBase = {left:12, right:10}. Fitted to
  // the two reachable corridor frames' LIVE wt=2 spans (read at DGROUP 0x50d0):
  //   FRAME A (gy=118, parity=1): seam 13@df1(left), 12@df2(right), 15@df3(left)
  //   FRAME B (gy=119, parity=0): seam 11@df1(right), 14@df2(left)
  // See docs/re/findings/maze-span-build.json `corner-type9-seamidx-law`.
  it('cornerSolidSeamIdx = depthField + sideBase {left:12, right:10}', () => {
    expect(cornerSolidSeamIdx(1, 'left')).toBe(13);
    expect(cornerSolidSeamIdx(2, 'right')).toBe(12);
    expect(cornerSolidSeamIdx(3, 'left')).toBe(15);
    expect(cornerSolidSeamIdx(1, 'right')).toBe(11);
    expect(cornerSolidSeamIdx(2, 'left')).toBe(14);
  });

  it('deriveCorridorSpans(y2 sides) reproduces the LIVE y2 wt=2 spans byte-exact', () => {
    // y2 (clean): df1 left, df2 right, df3 left
    const gen = deriveCorridorSpans([['left'], ['right'], ['left']], SEAM_X0, SEAM_X1);
    expect(gen).toEqual([
      { x0: 136, x1: 53, clipLo: 72, clipHi: 248, walltype: 2, seamIdx: 13, depthField: 1 },
      { x0: 153, x1: 64, clipLo: 72, clipHi: 248, walltype: 2, seamIdx: 12, depthField: 2 },
      { x0: 152, x1: 64, clipLo: 72, clipHi: 248, walltype: 2, seamIdx: 15, depthField: 3 },
    ]);
    // ... and the same wt=2 records the hardcoded MAZE_FRAME_Y2_SPANS carries.
    const liveWt2 = MAZE_FRAME_Y2_SPANS.filter((s) => s.walltype === 2);
    expect(gen).toEqual(liveWt2);
  });

  it('deriveCorridorSpans(y3 sides) reproduces the LIVE y3 wt=2 spans byte-exact', () => {
    // y3 (one fwd step): df1 right, df2 left
    const gen = deriveCorridorSpans([['right'], ['left']], SEAM_X0, SEAM_X1);
    expect(gen).toEqual([
      { x0: 147, x1: 59, clipLo: 72, clipHi: 248, walltype: 2, seamIdx: 11, depthField: 1 },
      { x0: 144, x1: 60, clipLo: 72, clipHi: 248, walltype: 2, seamIdx: 14, depthField: 2 },
    ]);
    const liveWt2 = MAZE_FRAME_Y3_SPANS.filter((s) => s.walltype === 2);
    expect(gen).toEqual(liveWt2);
  });

  it('generated call list (from geometry) matches the live single-frame flush', () => {
    // The full from-geometry path: derive spans -> flush -> call list.
    const y3 = generateCallList(deriveCorridorSpans([['right'], ['left']], SEAM_X0, SEAM_X1));
    expect(y3.map((c) => [c.piece, c.x0, c.arg10])).toEqual([
      [0xe, 144, 60],
      [0xb, 147, 59],
    ]);
    const y2 = generateCallList(deriveCorridorSpans([['left'], ['right'], ['left']], SEAM_X0, SEAM_X1));
    expect(y2.map((c) => [c.piece, c.x0, c.arg10])).toEqual([
      [0xf, 152, 64],
      [0xc, 153, 64],
      [0xd, 136, 53],
    ]);
  });
});
