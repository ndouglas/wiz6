/**
 * classify.ts — maze CLASSIFY phase (cell-walls + party -> per-depth side-wall
 * emission). THE one genuinely-new stage of the from-geometry maze renderer: it
 * projects the maze geometry (per-cell N/W wall fields) + the party
 * (cellA, cellB, z, facing) into the `sides` structure that deriveCorridorSpans
 * (build.ts) consumes.
 *
 * RE basis: docs/re/findings/maze-classify-projection.json (the validated
 * 0x3c11/0x3828 projection law) — REPLACES the prior corridor-only model.
 *
 * THE CORRECTED LAW (vs the prior maze-span-build.json model):
 *
 *   (1) COORDINATES. cell = z*64 + cellA*8 + cellB, where cellA is the ×8 axis
 *       (engine DGROUP 0x4f9e) and cellB is the ×1 axis (0x4fa0). The prior model
 *       transposed these. The Party fields the port consumes are bound so that
 *       party.x = cellA (×8) and party.y = cellB (×1) — matching the committed
 *       maze-frames.json (party cellA=5, cellB=7 stored as {x:5, y:7}). The cell
 *       grid is keyed z{z}_y{cellA}_x{cellB} (geometry uses y=cellA, x=cellB —
 *       the OPPOSITE labeling from the Party fields; do not conflate them).
 *
 *   (2) FORWARD STEP per facing, as (dCellA, dCellB):
 *         f0=(+1,0)  f1=(0,+1)  f2=(-1,0)  f3=(0,-1).
 *       (Live-verified by stepping: f0=+cellA, f1=+cellB, f2=-cellA, f3=-cellB.)
 *
 *   (3) DEPTH LOOP IS 0-BASED. d = 0..3, depthField = d. d=0 is the PARTY'S OWN
 *       cell (its immediate forward edge). This is required to reproduce the
 *       lookback frame's depthField-0 wt=2 span (the prior d=1..4 loop could not).
 *
 *   (4) EDGE READ. The forward edge you'd cross stepping out of a cell:
 *         f0/f2 -> N[cell] (the +0x60 grid);  f1/f3 -> W[cell] (the +0x120 grid).
 *       2-bit field MSB-first; out-of-grid neighbour reads solid (=2).
 *       Solid (blocking) = field >= 1 (2 = stone, 1/3 = door/special edges).
 *
 *   (5) SIDE = LATERAL NEIGHBOUR'S FORWARD WALL (not the side edge of viewCell).
 *       rightDelta = forward rotated CW: f0=(0,+1) f1=(-1,0) f2=(0,-1) f3=(+1,0);
 *       leftDelta = -rightDelta.
 *         leftSideSolid  = edge_read(viewCell + leftDelta,  facing) solid
 *         rightSideSolid = edge_read(viewCell + rightDelta, facing) solid
 *       i.e. "is there a wall down the corridor one cell to my left / right".
 *
 *   (6) EMIT-IF-BOUNDED + PARITY-ALTERNATION (the key behavioural fix). A
 *       side-wall span is emitted at depth d iff the corridor is BOUNDED there
 *       (leftSideSolid OR rightSideSolid). The emitted SCREEN-side (seam base
 *       left:12 / right:10) is chosen by PARITY ALTERNATION, INDEPENDENT of which
 *       physical side is solid (proven by lookback: a one-sided corridor still
 *       emits all 4 depths alternating R,L,R,L):
 *         parity = (cellA + cellB + facing) % 2
 *         screenSide = ((d + parity) % 2 === 0) ? 'right' : 'left'
 *       (The engine's true parity is (gx+gy+facing)%2; for cell coords the cell
 *       parity tracks it — flagged medium-confidence in the finding.)
 *       seamIdx = depthField + sideBase  (corner-type-9 law, in build.ts).
 *       A solid FORWARD edge at depth d occludes deeper cells (corridor blocked),
 *       so the loop stops emitting past the first solid front.
 *
 * VALIDATION STATUS — see classify.test.ts. The law reproduces the lookback frame
 * (the only captured frame with wt=2 spans) byte-exact, and the synthetic
 * one-sided-corridor unit test. KNOWN DIVERGENCE: for the three captured
 * empty-span frames (maze-corridor, turn-left, asym) this cell-arithmetic law
 * OVER-EMITS, because the engine's side classifier steps LATERALLY IN FINE GLOBAL
 * COORDINATES then re-resolves the cell (0x37a7 -> 0x35b7), gated by a per-depth
 * front gate (0x508a) whose exact seeding the finding flags as UNRESOLVED. The
 * fine-coordinate region tables (gx_base/+0x1e0, gy_base/+0x1ec) needed to
 * replicate that step are not in maze-frames.json. The recorded slot5220 codes
 * confirm the engine reads those frames' sides differently than pure N/W cell
 * arithmetic predicts (e.g. maze-corridor slot sides = [0,0] / open, where the
 * cell grid shows a boundary). This is documented as DONE_WITH_CONCERNS rather
 * than fitting an unjustifiable left-specific gate that reproduces the empties by
 * coincidence of this 4-frame sample.
 */

import { SEAMIDX_CORNER_SOLID_BASE } from '@wiz6/data';
import type { MazeCellWalls, Party } from '@wiz6/data';

/** Max depths the BUILD loop walks (wmaze DGROUP 0x521e = 4). */
const DEPTH_BOUND = 4;

/** Cells per axis within a level (cell = z*64 + cellA*8 + cellB). */
const GRID = 8;

/** A 2-bit wall field is "solid" (blocking) when non-zero (0 = open passage;
 *  2 = solid stone; 1/3 = door/special edges, treated as blocking for the view). */
function isSolid(field: number): boolean {
  return field >= 1;
}

/** Forward unit step per facing, as (dCellA, dCellB). Live-verified:
 *  f0=+cellA, f1=+cellB, f2=-cellA, f3=-cellB (view_step_forward_by_facing 0x37a7). */
const FORWARD_STEP: Record<number, readonly [number, number]> = {
  0: [1, 0],
  1: [0, 1],
  2: [-1, 0],
  3: [0, -1],
};

/** Right-neighbour delta per facing = forward rotated CW, as (dCellA, dCellB).
 *  left = negate. (classify_projection_law.lateral_step_right) */
const RIGHT_STEP: Record<number, readonly [number, number]> = {
  0: [0, 1],
  1: [-1, 0],
  2: [0, -1],
  3: [1, 0],
};

function cellIndex(cellA: number, cellB: number, z: number): number {
  return z * 64 + cellA * GRID + cellB;
}

/** N (north / +cellA edge) field of a cell. Out-of-grid = solid boundary wall. */
function northField(walls: MazeCellWalls, cellA: number, cellB: number, z: number): number {
  if (cellA < 0 || cellA >= GRID || cellB < 0 || cellB >= GRID) return 2;
  return walls.cells[cellIndex(cellA, cellB, z)]?.north ?? 0;
}

/** W (west / +cellB edge) field of a cell. Out-of-grid = solid boundary wall. */
function westField(walls: MazeCellWalls, cellA: number, cellB: number, z: number): number {
  if (cellA < 0 || cellA >= GRID || cellB < 0 || cellB >= GRID) return 2;
  return walls.cells[cellIndex(cellA, cellB, z)]?.west ?? 0;
}

/** The FORWARD edge field of a cell under a facing — the wall you'd cross
 *  stepping forward out of (cellA,cellB,z). f0/f2 read N (+0x60); f1/f3 read W
 *  (+0x120). Out-of-grid cell -> solid boundary (2). */
function forwardEdge(
  walls: MazeCellWalls,
  cellA: number,
  cellB: number,
  z: number,
  facing: number,
): number {
  return facing === 0 || facing === 2
    ? northField(walls, cellA, cellB, z)
    : westField(walls, cellA, cellB, z);
}

/**
 * classifyVisibleWalls — project the maze geometry + party into the per-depth
 * side-wall emission flags that deriveCorridorSpans consumes.
 *
 * Returns `sides`: `sides[d]` (d = 0..DEPTH_BOUND-1, depthField = d) lists the
 * SCREEN-side label(s) ('left'/'right') to emit a wt=2 corridor side-wall span at
 * that depth. Per the corrected law each emitting depth carries exactly one
 * parity-alternation-selected screen-side (independent of which physical side is
 * solid); depths where the corridor is unbounded carry an empty array; the loop
 * stops once a solid forward edge occludes deeper cells.
 *
 * NOTE on the `sides` shape: build.ts's deriveCorridorSpans indexes `sides[d]`
 * with depthField = d (0-based) — the depthField is the array index, so empty
 * leading/trailing entries are preserved (a depth that emits nothing still
 * occupies its slot).
 */
export function classifyVisibleWalls(
  walls: MazeCellWalls,
  party: Party,
): Array<Array<'left' | 'right'>> {
  const cellA = party.x; // ×8 axis (engine 0x4f9e)
  const cellB = party.y; // ×1 axis (engine 0x4fa0)
  const { z, facing } = party;

  const fwd = FORWARD_STEP[facing];
  const rt = RIGHT_STEP[facing];
  if (!fwd || !rt) throw new Error(`invalid facing ${facing}`);
  const [fA, fB] = fwd;
  const [rA, rB] = rt;

  // Frame parity (wmaze 0x4c45 (gx+gy+facing)%2 — cell-coord proxy).
  const parity = (cellA + cellB + facing) % 2;

  const sides: Array<Array<'left' | 'right'>> = [];

  for (let d = 0; d < DEPTH_BOUND; d++) {
    const vA = cellA + fA * d;
    const vB = cellB + fB * d;

    const leftSideSolid = isSolid(forwardEdge(walls, vA - rA, vB - rB, z, facing));
    const rightSideSolid = isSolid(forwardEdge(walls, vA + rA, vB + rB, z, facing));

    const depthSides: Array<'left' | 'right'> = [];
    if (leftSideSolid || rightSideSolid) {
      // Screen-side by parity alternation — NOT by which physical side is solid.
      const screenSide: 'left' | 'right' = (d + parity) % 2 === 0 ? 'right' : 'left';
      depthSides.push(screenSide);
    }
    sides.push(depthSides);

    // NOTE: NO forward-edge occlusion break here. The lookback frame proves the
    // receding corridor side-walls render at ALL 4 depths even though its forward
    // edge is a door (N[4,7]=3) at depth 1 and solid (=2) at depth 3 — a hard
    // "stop at first solid front" break would drop depths 2/3 and fail lookback.
    // The findings' depth_bound_occlusion note is about the FRONT-wall/corner
    // emit gate (0x508a), not the wt=2 corridor side-walls handled here; the loop
    // always runs the fixed bound of 4 depths.
  }

  return sides;
}

/** Re-export the validated seam base for callers that want the closed form. */
export { SEAMIDX_CORNER_SOLID_BASE };
