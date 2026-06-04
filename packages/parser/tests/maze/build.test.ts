/**
 * build.test.ts — maze BUILD phase (slot-walltypes -> spans).
 *
 * Gates:
 *  1. refineSpanColumns reproduces the live span x0/x1 from the @wiz6/data
 *     seam tables (SEAM_X0_WT2 / SEAM_X1_WT2) — this is also the cross-check
 *     that Task 2's seam tables are byte-correct.
 *  2. cornerSolidSeamIdx = depthField + sideBase {left:12, right:10}.
 *
 * Cases ported verbatim from tools/parity/maze-generator.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { SEAM_X0_WT2, SEAM_X1_WT2 } from '@wiz6/data';
import { refineSpanColumns, cornerSolidSeamIdx, deriveCorridorSpans } from '../../src/maze/build.js';

// ---------------------------------------------------------------------------
// refineSpanColumns — seam-refinement law (span_append 0x3f8d)
// The solid-wall emitter pushes x0_base = x1_base = 0, so refined x0/x1 ARE
// the seam-table values. Validated byte-exact against all 6 wt=2 spans.
// SEAM_X0_WT2 / SEAM_X1_WT2 are the full-stride buffers from @wiz6/data
// (wt=2 slice placed at offset 0x13a*2 — identical to the seamBufFrom()
// helper in maze-generator.test.ts).
// ---------------------------------------------------------------------------
describe('maze span seam-refinement (span_append 0x3f8d, @wiz6/data seam tables)', () => {
  const CASES: Array<[number, number, number]> = [
    // [seamIdx, expected x0, expected x1]
    [0xa, 136, 52],  // y2 depth0
    [0xb, 147, 59],  // y3 depth1 (left)
    [0xc, 153, 64],  // y2 depth2
    [0xd, 136, 53],  // y2 depth1
    [0xe, 144, 60],  // y3 depth2 (right)
    [0xf, 152, 64],  // y2 depth3
  ];
  for (const [seamIdx, x0, x1] of CASES) {
    it(`seamIdx 0x${seamIdx.toString(16)} (wt2) -> x0=${x0} x1=${x1}`, () => {
      const r = refineSpanColumns(0, 0, 2, seamIdx, SEAM_X0_WT2, SEAM_X1_WT2);
      expect(r.x0).toBe(x0);
      expect(r.x1).toBe(x1);
    });
  }

  it('no refinement for walltype 0xff (edge markers)', () => {
    const r = refineSpanColumns(24, 27, 0xff, 0, SEAM_X0_WT2, SEAM_X1_WT2);
    expect(r).toEqual({ x0: 24, x1: 27 });
  });
});

// ---------------------------------------------------------------------------
// cornerSolidSeamIdx — corner type-9 solid seamIdx law
// seamIdx = depthField + sideBase {left:12, right:10}. Fitted to live wt=2
// spans from the two reachable corridor frames (FRAME A + FRAME B).
// ---------------------------------------------------------------------------
describe('maze seamIdx law (corner type-9 solid; closed-form, no live span read)', () => {
  it('cornerSolidSeamIdx = depthField + sideBase {left:12, right:10}', () => {
    expect(cornerSolidSeamIdx(1, 'left')).toBe(13);
    expect(cornerSolidSeamIdx(2, 'right')).toBe(12);
    expect(cornerSolidSeamIdx(3, 'left')).toBe(15);
    expect(cornerSolidSeamIdx(1, 'right')).toBe(11);
    expect(cornerSolidSeamIdx(2, 'left')).toBe(14);
  });

  it('deriveCorridorSpans(y2 sides) reproduces the LIVE y2 wt=2 spans byte-exact', () => {
    // y2 (clean): df1 left, df2 right, df3 left
    const gen = deriveCorridorSpans([['left'], ['right'], ['left']], SEAM_X0_WT2, SEAM_X1_WT2);
    expect(gen).toEqual([
      { x0: 136, x1: 53, clipLo: 72, clipHi: 248, walltype: 2, seamIdx: 13, depthField: 1 },
      { x0: 153, x1: 64, clipLo: 72, clipHi: 248, walltype: 2, seamIdx: 12, depthField: 2 },
      { x0: 152, x1: 64, clipLo: 72, clipHi: 248, walltype: 2, seamIdx: 15, depthField: 3 },
    ]);
  });

  it('deriveCorridorSpans(y3 sides) reproduces the LIVE y3 wt=2 spans byte-exact', () => {
    // y3 (one fwd step): df1 right, df2 left
    const gen = deriveCorridorSpans([['right'], ['left']], SEAM_X0_WT2, SEAM_X1_WT2);
    expect(gen).toEqual([
      { x0: 147, x1: 59, clipLo: 72, clipHi: 248, walltype: 2, seamIdx: 11, depthField: 1 },
      { x0: 144, x1: 60, clipLo: 72, clipHi: 248, walltype: 2, seamIdx: 14, depthField: 2 },
    ]);
  });
});
