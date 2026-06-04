/**
 * render.test.ts — gate for renderMazeViewport: the full pipeline from
 * (cellWalls, party, assets) -> 176×112 palette-index buffer.
 *
 * Uses the y3 corridor fixture (same geometry as classify.test.ts) to exercise
 * the full classify->build->flush->compositor->decode->crop pipeline. Validation
 * at this level: correct output shape + non-zero pixels (stone wall indices present).
 */
import { describe, it, expect } from 'vitest';
import { renderMazeViewport } from '../../src/maze/render.js';
import { loadMazeAssets } from '../../src/maze/assets.js';
import type { MazeCellWalls, Party } from '@wiz6/data';

const cellIdx = (x: number, y: number, z = 0): number => z * 64 + y * 8 + x;

// y3 corridor cell-walls (same literal as classify.test.ts):
//   depth 1 — cell (7,4): forward (N) open, left (W) solid; right = OOB boundary solid
//   depth 2 — cell (7,5): forward (N) SOLID (blocks corridor), left (W) solid
const Y3_CORRIDOR: MazeCellWalls = {
  cells: {
    [cellIdx(7, 4)]: { north: 0, west: 2, pit: false },
    [cellIdx(7, 5)]: { north: 2, west: 2, pit: false },
  },
};

const PARTY: Party = { x: 7, y: 3, z: 0, facing: 0 };

describe('renderMazeViewport', () => {
  it('returns 176×112 indices with stone walls present', () => {
    const assets = loadMazeAssets();
    const idx = renderMazeViewport(Y3_CORRIDOR, PARTY, assets);
    expect(idx.length).toBe(176 * 112);
    expect(idx.some((v) => v !== 0)).toBe(true);
  });
});
