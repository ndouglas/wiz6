/**
 * classify.test.ts — gate for classifyVisibleWalls (cell-walls + party ->
 * per-depth solid-side flags), the from-geometry CLASSIFY phase.
 *
 * The round-trip gate: classify -> deriveCorridorSpans (build) -> generateCallList
 * (flush) MUST reproduce the validated y3 corridor call-list. The expected
 * call-list ['11/147/59','14/144/60'] is the LIVE engine span list for the y3
 * reference frame (party x7 y3 z0 facing0), read at DGROUP 0x50d0 with the patched
 * trace core (docs/re/findings/maze-span-build.json corner-type9-seamidx-law +
 * flush-one-call-per-span-corrected). Do NOT change these values.
 *
 * Y3_CORRIDOR is the facing-relative cell-wall model for that frame: a 2-deep
 * straight corridor (both sides solid) blocked at depth 2. Under classify's
 * facing-0 projection (forward=N[cell], left=W[cell], right=W[east neighbour];
 * out-of-grid = solid boundary) these two cells reproduce the engine's emission:
 *   depth 1 (cell 7,4): forward open, left+right solid  -> parity(0) selects RIGHT
 *   depth 2 (cell 7,5): forward solid (blocks), left+right solid -> selects LEFT
 * giving sides [['right'],['left']] -> seams 11 (df1+right base 10) / 14 (df2+left
 * base 12) -> the y3 call-list.
 */
import { describe, it, expect } from 'vitest';
import { classifyVisibleWalls } from '../../src/maze/classify.js';
import { deriveCorridorSpans } from '../../src/maze/build.js';
import { generateCallList } from '../../src/maze/flush.js';
import { SEAM_X0_WT2, SEAM_X1_WT2 } from '@wiz6/data';
import type { MazeCellWalls, Party } from '@wiz6/data';

const cellIdx = (x: number, y: number, z = 0): number => z * 64 + y * 8 + x;

const Y3_CORRIDOR: MazeCellWalls = {
  cells: {
    // depth 1 — cell (7,4): forward (N) open, left (W) solid; right = OOB boundary (solid)
    [cellIdx(7, 4)]: { north: 0, west: 2, pit: false },
    // depth 2 — cell (7,5): forward (N) SOLID (blocks the corridor), left (W) solid
    [cellIdx(7, 5)]: { north: 2, west: 2, pit: false },
  },
};

const PARTY: Party = { x: 7, y: 3, z: 0, facing: 0 };

describe('classifyVisibleWalls', () => {
  it('produces solid-side flags that yield the y3 call-list', () => {
    const sides = classifyVisibleWalls(Y3_CORRIDOR, PARTY);
    const spans = deriveCorridorSpans(sides, SEAM_X0_WT2, SEAM_X1_WT2);
    const calls = generateCallList(spans);
    const sig = calls.map((c) => [c.piece, c.x0, c.arg10].join('/')).sort();
    expect(sig).toEqual(['11/147/59', '14/144/60'].sort());
  });

  it('selects ONE side per depth via parity-alternation (validated emission law)', () => {
    // parity = (7+3+0)%2 = 0 -> depth1 right, depth2 left.
    const sides = classifyVisibleWalls(Y3_CORRIDOR, PARTY);
    expect(sides).toEqual([['right'], ['left']]);
  });

  it('stops walking once the forward edge is solid (corridor blocked)', () => {
    // cell (7,5) has a solid forward (N) edge -> depth 2 is the last visible depth.
    const sides = classifyVisibleWalls(Y3_CORRIDOR, PARTY);
    expect(sides.length).toBe(2);
  });

  it('emits nothing for a selected side that is open', () => {
    // A corridor cell with the parity-selected side open emits no span at that depth.
    // parity 0 -> depth1 selects RIGHT; make right open, forward open.
    const oneOpenSide: MazeCellWalls = {
      cells: {
        // cell (7,4): forward open, left solid, right (east neighbour W[8]) is OOB=solid,
        // so to make the SELECTED right side open we move the party off the boundary.
        [cellIdx(3, 4)]: { north: 0, west: 2, pit: false }, // left solid
        [cellIdx(4, 4)]: { north: 0, west: 0, pit: false }, // east neighbour W open -> right open
        [cellIdx(3, 5)]: { north: 2, west: 2, pit: false }, // depth2 blocks
      },
    };
    const party: Party = { x: 3, y: 3, z: 0, facing: 0 };
    // parity = (3+3+0)%2 = 0 -> depth1 selects right; right is open -> empty depth.
    const sides = classifyVisibleWalls(oneOpenSide, party);
    expect(sides[0]).toEqual([]);
  });
});
