/**
 * movement.test.ts — gate for turn/tryStepForward (discrete dungeon movement).
 *
 * Geometry is reused from classify.ts via maze-geometry.ts exports (no duplication).
 * The test constructs a minimal single-region MazeBlock to exercise:
 *   - forwardEdge(facing=0) → N(gx, gy): blocked when north=2, open when north=0
 *   - FORWARD_STEP semantics: facing-0 forward delta is (dgx=0, dgy=+1)
 *
 * Engine reference: maze_can_step_in_facing wmaze 0x3244 — reads the forward edge
 * of the party cell and returns blocked (no-op) iff the edge is non-zero (solid).
 */
import { describe, it, expect } from 'vitest';
import { turn, tryStepForward } from '../../src/maze/movement.js';
import type { MazeBlock, MazeParty } from '@wiz6/data';

/**
 * Build a minimal 1-region MazeBlock (8×8 = 64 cells, all open by default).
 * Region covers gx 0..7, gy 0..7.
 * `patches` maps cell index (cellA*8 + cellB) to a partial cell override.
 */
function makeBlock(
  patches: Record<number, Partial<{ north: number; west: number }>>,
): MazeBlock {
  const cells = Array.from({ length: 64 }, (_, i) => ({
    north: patches[i]?.north ?? 0,
    west: patches[i]?.west ?? 0,
    special4: 0,
    orient2: 0,
    pit: 0,
  }));
  return {
    gxBase: [0],
    gyBase: [0],
    regions: [cells],
  };
}

// For facing 0: forwardEdge = N(gx, gy). Forward step delta = (0, +1).
// Region covers gx 0..7, gy 0..7. Use cells well inside the region.
//
// Blocked cell: (gx=3, gy=3) with north=2 (solid north wall).
//   cellIdx = cellA*8 + cellB = 3*8+3 = 27
// Open cell: (gx=3, gy=5) with north=0 (default). Step lands at (3, 6).

const BLOCKED_GX = 3;
const BLOCKED_GY = 3;
const BLOCKED_CELL_IDX = BLOCKED_GY * 8 + BLOCKED_GX; // 27

const OPEN_GX = 3;
const OPEN_GY = 5;
// After step facing 0: dy=+1, so lands at (3, 6)

const TEST_BLOCK: MazeBlock = makeBlock({ [BLOCKED_CELL_IDX]: { north: 2 } });

describe('turn', () => {
  it('left wraps facing mod 4: 0 → 3', () => {
    expect(turn({ gx: 0, gy: 0, z: 0, facing: 0 }, 'left').facing).toBe(3);
  });
  it('left: 1 → 0', () => {
    expect(turn({ gx: 0, gy: 0, z: 0, facing: 1 }, 'left').facing).toBe(0);
  });
  it('left: 2 → 1', () => {
    expect(turn({ gx: 0, gy: 0, z: 0, facing: 2 }, 'left').facing).toBe(1);
  });
  it('left: 3 → 2', () => {
    expect(turn({ gx: 0, gy: 0, z: 0, facing: 3 }, 'left').facing).toBe(2);
  });
  it('right wraps facing mod 4: 3 → 0', () => {
    expect(turn({ gx: 0, gy: 0, z: 0, facing: 3 }, 'right').facing).toBe(0);
  });
  it('right: 0 → 1', () => {
    expect(turn({ gx: 0, gy: 0, z: 0, facing: 0 }, 'right').facing).toBe(1);
  });
  it('right: 1 → 2', () => {
    expect(turn({ gx: 0, gy: 0, z: 0, facing: 1 }, 'right').facing).toBe(2);
  });
  it('right: 2 → 3', () => {
    expect(turn({ gx: 0, gy: 0, z: 0, facing: 2 }, 'right').facing).toBe(3);
  });
  it('turn preserves gx, gy, z', () => {
    const party: MazeParty = { gx: 5, gy: 7, z: 2, facing: 1 };
    const result = turn(party, 'right');
    expect(result.gx).toBe(5);
    expect(result.gy).toBe(7);
    expect(result.z).toBe(2);
  });
});

describe('tryStepForward', () => {
  it('blocked by solid north wall (facing 0): returns party unchanged', () => {
    const party: MazeParty = { gx: BLOCKED_GX, gy: BLOCKED_GY, z: 0, facing: 0 };
    const result = tryStepForward(party, TEST_BLOCK);
    expect(result).toEqual(party);
  });

  it('open cell (facing 0): advances gy by +1', () => {
    const party: MazeParty = { gx: OPEN_GX, gy: OPEN_GY, z: 0, facing: 0 };
    const result = tryStepForward(party, TEST_BLOCK);
    expect(result.gx).toBe(OPEN_GX);
    expect(result.gy).toBe(OPEN_GY + 1);
    expect(result.z).toBe(0);
    expect(result.facing).toBe(0);
  });

  it('step preserves facing and z', () => {
    const party: MazeParty = { gx: OPEN_GX, gy: OPEN_GY, z: 3, facing: 0 };
    const result = tryStepForward(party, TEST_BLOCK);
    expect(result.facing).toBe(0);
    expect(result.z).toBe(3);
  });

  it('blocked: returned object is the same reference (or value-equal — no mutation)', () => {
    const party: MazeParty = { gx: BLOCKED_GX, gy: BLOCKED_GY, z: 0, facing: 0 };
    const result = tryStepForward(party, TEST_BLOCK);
    // Must not have mutated coords
    expect(result.gx).toBe(BLOCKED_GX);
    expect(result.gy).toBe(BLOCKED_GY);
  });

  // Facing 1: forward delta = (+1, 0) via the step() law (gx+forward, gy-lateral) with lateral=0
  // forwardEdge(facing=1) = W(gx, gy). Open when west=0, blocked when west=2.
  // Cell (gx=4, gy=4): west=0 (open). Step lands at (gx+1=5, gy=4).
  it('facing 1, open west wall: advances gx by +1', () => {
    // All west walls are 0 by default in TEST_BLOCK
    const party: MazeParty = { gx: 4, gy: 4, z: 0, facing: 1 };
    const result = tryStepForward(party, TEST_BLOCK);
    expect(result.gx).toBe(5);
    expect(result.gy).toBe(4);
    expect(result.facing).toBe(1);
  });

  it('facing 1, blocked west wall: no-op', () => {
    // Block (gx=4, gy=4) west=2: cellIdx = 4*8+4 = 36
    const blockWithWest = makeBlock({ 36: { west: 2 } });
    const party: MazeParty = { gx: 4, gy: 4, z: 0, facing: 1 };
    const result = tryStepForward(party, blockWithWest);
    expect(result).toEqual(party);
  });

  // No back-step: down is not a valid input direction. This module only exposes
  // turn + tryStepForward; the caller (viewer key handler) never calls tryStepForward
  // for the DOWN key.
});
