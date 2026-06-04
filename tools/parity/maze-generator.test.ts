/**
 * maze-generator.test.ts — the (walltype,depth,seamIdx) -> FUN_1c94 call-list
 * GENERATOR law, derived from static wmaze.ovr disasm (renderer flush Pass B
 * @0x52f8; see docs/re/findings/maze-stage1-compositor.json
 * `generator-calllist-flush-law`).
 *
 * Gate: generateCallList(MAZE_FRAME_Y3_SPANS) must reproduce the LIVE 11-call
 * FUN_1c94 list (piece byte + screen x0 + dest-row) for the reference y3
 * corridor frame, in exact emission order. The live list was captured via the
 * patched tracing core (`tools/libretro/trace-maze.ts geom`) and reproduces the
 * engine wall composite at 98.12% viewport. This locks the flush law so a TS
 * port generates the compositor call-list from the span list instead of
 * replaying a captured stream.
 */
import { describe, it, expect } from 'vitest';
import { generateCallList, MAZE_FRAME_Y3_SPANS } from './render-maze-frame.js';

// The live FUN_1c94 call list (geom phase), [piece, x0, arg10/dest-row], in the
// engine's flush emission order (depth 4..0; within a depth, span idx desc).
const LIVE_CALLS: Array<[number, number, number]> = [
  [0xf, 152, 64], [0xc, 153, 64], [0xd, 136, 53],
  [0xe, 144, 60], [0xb, 147, 59],
  [0xe, 144, 60], [0xb, 147, 59],
  [0xe, 144, 60], [0xb, 147, 59],
  [0xe, 144, 60], [0xb, 147, 59],
];

describe('maze FUN_1c94 call-list generator (flush law)', () => {
  it('reproduces the live 11-call reference corridor list byte-exactly', () => {
    const gen = generateCallList(MAZE_FRAME_Y3_SPANS);
    expect(gen.map((c) => [c.piece, c.x0, c.arg10])).toEqual(LIVE_CALLS);
  });

  it('uses the span seamIdx as the piece byte (the bridge invariant)', () => {
    // Every emitted call's piece must equal a span's seamIdx for a wt!=0xff span.
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
