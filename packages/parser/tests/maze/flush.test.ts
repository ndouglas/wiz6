import { describe, it, expect } from 'vitest';
import { generateCallList } from '../../src/maze/flush.js';
import type { MazeSpan } from '../../src/maze/compositor.js';

// ---------------------------------------------------------------------------
// Span fixtures — verbatim from tools/parity/render-maze-frame.ts
// ---------------------------------------------------------------------------

/** The reference y3 corridor span list (zone0, facing0, x7 y3) — read LIVE from
 *  DGROUP 0x50d0 right after the y2->y3 forward step that rebuilds it (count=4). */
const MAZE_FRAME_Y3_SPANS: MazeSpan[] = [
  { x0: 147, x1: 59, clipLo: 72, clipHi: 248, walltype: 2, seamIdx: 0xb, depthField: 1 },
  { x0: 24, x1: 27, clipLo: 24, clipHi: 27, walltype: 0xff, seamIdx: 0, depthField: 1 },
  { x0: 30, x1: 33, clipLo: 33, clipHi: 30, walltype: 0xff, seamIdx: 0, depthField: 1 },
  { x0: 144, x1: 60, clipLo: 72, clipHi: 248, walltype: 2, seamIdx: 0xe, depthField: 2 },
];

/** The reference y2 corridor span list (CLEAN_STATE, zone0 facing0 x7 y2), read
 *  LIVE from DGROUP 0x50d0 (count=7). */
const MAZE_FRAME_Y2_SPANS: MazeSpan[] = [
  { x0: 23, x1: 26, clipLo: 23, clipHi: 26, walltype: 0xff, seamIdx: 0, depthField: 0 },
  { x0: 29, x1: 32, clipLo: 32, clipHi: 29, walltype: 0xff, seamIdx: 0, depthField: 0 },
  { x0: 136, x1: 53, clipLo: 72, clipHi: 248, walltype: 2, seamIdx: 0xd, depthField: 1 },
  { x0: 153, x1: 64, clipLo: 72, clipHi: 248, walltype: 2, seamIdx: 0xc, depthField: 2 },
  { x0: 25, x1: 28, clipLo: 25, clipHi: 28, walltype: 0xff, seamIdx: 0, depthField: 2 },
  { x0: 31, x1: 34, clipLo: 34, clipHi: 31, walltype: 0xff, seamIdx: 0, depthField: 2 },
  { x0: 152, x1: 64, clipLo: 72, clipHi: 248, walltype: 2, seamIdx: 0xf, depthField: 3 },
];

// ---------------------------------------------------------------------------
// Tests — ported verbatim from tools/parity/maze-generator.test.ts
// ---------------------------------------------------------------------------

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
    const spans: MazeSpan[] = [
      { x0: 100, x1: 50, clipLo: 72, clipHi: 248, walltype: 0xff, seamIdx: 3, depthField: 0 },
      { x0: 110, x1: 55, clipLo: 72, clipHi: 248, walltype: 2, seamIdx: 0xb, depthField: 0 },
    ];
    const gen = generateCallList(spans);
    expect(gen).toHaveLength(1);
    expect(gen[0]!.piece).toBe(0xb);
  });
});
