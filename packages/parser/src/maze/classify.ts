/**
 * classify.ts — maze CLASSIFY phase (cell-walls + party -> per-depth solid-side
 * flags). THE one genuinely-new stage of the from-geometry maze renderer: it
 * projects the maze geometry (per-cell N/W wall fields) + the party
 * (x,y,z,facing) into the `sides` structure that deriveCorridorSpans (build.ts,
 * Task 7) consumes.
 *
 * RE basis: docs/re/findings/maze-span-build.json
 *   - build-depth-loop-and-slot-emitters: the BUILD depth loop (wmaze 0x4c60)
 *     walks depth 0..3, advances the view cursor via view_step_forward_by_facing
 *     (0x37a7, a 4-facing rotation), computes cell = z*64 + y*8 + x (0x38ba), and
 *     reads each cell's 2-bit N/W wall fields ([0x4faa]+0x60 N / +0x120 W); the
 *     slot classifier returns 0 (open) or 2 (solid).
 *   - corner-type9-seamidx-law: seamIdx = depthField + sideBase {left:12,right:10}
 *     (SEAMIDX_CORNER_SOLID_BASE in @wiz6/data). VALIDATED byte-exact.
 *
 * WHAT IS VALIDATED (high confidence) vs WHAT IS A FLAGGED PROJECTION:
 *
 *   VALIDATED — the per-depth SIDE-EMISSION law for a both-sides-solid corridor.
 *   Read live (patched-core span list @0x50d0) for the two reachable corridor
 *   frames, both straight (both side walls solid for all open depths):
 *       y2 (party 7,2,0,facing0, parity 1): df1=left(seam13), df2=right(12),
 *                                            df3=left(15)
 *       y3 (party 7,3,0,facing0, parity 0): df1=right(seam11), df2=left(14)
 *   The engine emits EXACTLY ONE side per depth, alternating, with the start side
 *   set by parity:  side = ((depthField + parity) % 2 === 0) ? 'left' : 'right'
 *   parity = (x + y + facing) % 2  (the frame parity, wmaze 0x4c45
 *   (gx+gy+facing)%2 — the cell-coord parity tracks it for these frames).
 *   This reproduces BOTH frames' (depth->side) byte-exact, hence the y3/y2 seams.
 *
 *   LOW CONFIDENCE — the raw-grid -> facing-relative SIDE-SOLIDITY + DEPTH-BOUND
 *   projection (the 0x3c11 corner-classifier / view_step lateral resolution). The
 *   finding lists this as UNMAPPED ("MAP the slot classifier 0x3c11 ... so a port
 *   produces the gates from raw geometry"): the side slots step laterally in FINE
 *   global coords then resolve back to a cell, and the only two reachable frames
 *   are degenerate (straight corridors, both sides solid) so they cannot
 *   disambiguate the left/right edge projection. We therefore define classify on
 *   a FACING-RELATIVE wall model (see CellEdges below): the caller supplies each
 *   cell's wall fields, and we read the forward edge (depth bound) + the
 *   left/right edges (per-depth side solidity) under a 4-facing rotation. This is
 *   correct for straight corridors (validated) but the exact raw N/W ->
 *   facing-relative-edge mapping for TURN / SIDE-OPENING frames is unconfirmed —
 *   marked `// confidence: low` at the read sites. A turn-frame fixture (Task 10)
 *   is needed to pin it.
 */

import { SEAMIDX_CORNER_SOLID_BASE } from '@wiz6/data';
import type { MazeCellWalls, Party } from '@wiz6/data';

/** Max depths the BUILD loop walks (wmaze DGROUP 0x521e = 4). */
const DEPTH_BOUND = 4;

/** A 2-bit wall field is "solid" when non-zero (0 = open passage; 2 = solid
 *  stone; 1/3 = door/special edges, treated as blocking for the corridor view). */
function isSolid(field: number): boolean {
  return field >= 1;
}

/** Forward unit step per facing (engine view_step_forward_by_facing 0x37a7
 *  rotation). facing 0 walks +y (the validated reference corridor). The other
 *  three are the 90-degree rotations of that.
 *  confidence: low — facings 1/2/3 unvalidated (corridor only exercises facing 0). */
const FORWARD_STEP: Record<number, readonly [number, number]> = {
  0: [0, 1], // +y
  1: [1, 0], // +x
  2: [0, -1], // -y
  3: [-1, 0], // -x
};

interface CellEdges {
  forward: number; // wall on the edge AHEAD (blocks forward view)
  left: number; // wall on the party's LEFT side
  right: number; // wall on the party's RIGHT side
}

/** Read a cell's facing-relative edges from the raw N/W wall fields.
 *
 *  Engine storage: each cell stores N (its +y / north edge) and W (its -x / west
 *  edge). The +y edge of (x,y) = N[cell]; the -x edge = W[cell]. The complementary
 *  edges come from neighbours: +x edge of (x,y) = W of (x+1,y); -y edge = N of (x,y-1).
 *
 *  facing 0 (+y):  forward = N[x,y]      left = W[x,y]       right = W[x+1,y]
 *  facing 1 (+x):  forward = W[x+1,y]    left = N[x,y]       right = N[x,y-1]
 *  facing 2 (-y):  forward = N[x,y-1]    left = W[x+1,y]     right = W[x,y]
 *  facing 3 (-x):  forward = W[x,y]      left = N[x,y-1]     right = N[x,y]
 *
 *  confidence: low — the rotation is the natural N/W edge algebra, but the engine
 *  reads side walls via a lateral FINE-coord step + cell resolve (0x3c11, finding-
 *  unmapped); only facing 0 / straight corridors are validated. An out-of-grid
 *  neighbour reads as solid (boundary = wall). */
function cellEdges(walls: MazeCellWalls, x: number, y: number, z: number, facing: number): CellEdges {
  const N = (cx: number, cy: number): number => northField(walls, cx, cy, z);
  const W = (cx: number, cy: number): number => westField(walls, cx, cy, z);
  switch (facing) {
    case 0:
      return { forward: N(x, y), left: W(x, y), right: W(x + 1, y) };
    case 1:
      return { forward: W(x + 1, y), left: N(x, y), right: N(x, y - 1) };
    case 2:
      return { forward: N(x, y - 1), left: W(x + 1, y), right: W(x, y) };
    case 3:
      return { forward: W(x, y), left: N(x, y - 1), right: N(x, y) };
    default:
      throw new Error(`invalid facing ${facing}`);
  }
}

const GRID = 8; // cells per axis within a level (cell = z*64 + y*8 + x)

function cellIndex(x: number, y: number, z: number): number {
  return z * 64 + y * GRID + x;
}

/** N (north / +y edge) field of a cell. Out-of-grid = solid boundary wall. */
function northField(walls: MazeCellWalls, x: number, y: number, z: number): number {
  if (x < 0 || x >= GRID || y < 0 || y >= GRID) return 2;
  return walls.cells[cellIndex(x, y, z)]?.north ?? 0;
}

/** W (west / -x edge) field of a cell. Out-of-grid = solid boundary wall. */
function westField(walls: MazeCellWalls, x: number, y: number, z: number): number {
  if (x < 0 || x >= GRID || y < 0 || y >= GRID) return 2;
  return walls.cells[cellIndex(x, y, z)]?.west ?? 0;
}

/**
 * classifyVisibleWalls — project the maze geometry + party into the per-depth
 * solid-side flags that deriveCorridorSpans consumes.
 *
 * Returns `sides`, a per-depth array: `sides[d]` (d = 0..D-1, depthField = d+1)
 * lists which sides ('left'/'right') emit a solid side-wall span at that depth.
 *
 * Algorithm (faithful to the BUILD depth loop + the validated emission law):
 *   1. parity = (x + y + facing) % 2.
 *   2. Walk forward from the party, one cell per depth, up to DEPTH_BOUND (4):
 *        at depth d (depthField = d+1) the view cell is d steps ahead.
 *        Stop walking once the forward edge of the previous cell is solid (the
 *        corridor is blocked — no further side walls are visible past it).
 *   3. For each walked depth, the parity-alternation selects ONE side; emit it
 *        iff that side's wall is solid (a straight corridor always emits it).
 */
export function classifyVisibleWalls(
  walls: MazeCellWalls,
  party: Party,
): Array<Array<'left' | 'right'>> {
  const { x, y, z, facing } = party;
  const step = FORWARD_STEP[facing];
  if (!step) throw new Error(`invalid facing ${facing}`);
  const [dx, dy] = step;

  const parity = (x + y + facing) % 2; // confidence: low (cell-coord proxy for the fine (gx+gy+facing)%2)

  const sides: Array<Array<'left' | 'right'>> = [];

  for (let d = 1; d <= DEPTH_BOUND; d++) {
    const cx = x + dx * d;
    const cy = y + dy * d;
    // Out of grid -> no visible cell at this depth.
    if (cx < 0 || cx >= GRID || cy < 0 || cy >= GRID) break;

    const edges = cellEdges(walls, cx, cy, z, facing);

    // Parity-alternation: the engine emits one side per depth, alternating,
    // start side set by parity. depthField = d. (VALIDATED, see file header.)
    const selected: 'left' | 'right' = (d + parity) % 2 === 0 ? 'left' : 'right';
    const selectedSolid = selected === 'left' ? isSolid(edges.left) : isSolid(edges.right);

    const depthSides: Array<'left' | 'right'> = [];
    if (selectedSolid) depthSides.push(selected);
    sides.push(depthSides);

    // Forward edge solid -> corridor blocked; nothing visible past this cell.
    if (isSolid(edges.forward)) break;
  }

  return sides;
}

/** Re-export the validated seam base for callers that want the closed form. */
export { SEAMIDX_CORNER_SOLID_BASE };
