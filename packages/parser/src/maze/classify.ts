/**
 * classify.ts — maze CLASSIFY phase (orient2-aware). Projects the FULL per-zone
 * maze block (multi-region wall + decoration planes) + the party (GLOBAL cell
 * coords + facing) into the per-depth side-wall emission `sides` that
 * deriveCorridorSpans (build.ts) consumes.
 *
 * This REWORK replaces the prior single-grid, raw-solidity "emit-if-bounded"
 * classifier (which over-predicted: it was neither multi-region nor orient2-aware,
 * and used the wrong forward-edge selector for facings 2/3). The corrected law is
 * pinned across five RE passes:
 *   docs/re/findings/maze-classify-projection.json   (resolver + depth loop)
 *   docs/re/findings/maze-classify-gating.json        (multi-region planes)
 *   docs/re/findings/maze-classify-determinism.json   (corrected per-facing reads)
 *   docs/re/findings/maze-emit-gate-closed.json        (orient2 front gate)
 *
 * THE LAW (asm-grounded):
 *
 *   (1) RESOLVER. The map is tiled into per-region 64-cell PLANES. A GLOBAL cell
 *       (gx,gy) resolves to the region r with gxBase[r]<=gx<=gxBase[r]+7 AND
 *       gyBase[r]<=gy<=gyBase[r]+7; localCellB=gx-gxBase[r], localCellA=gy-gyBase[r];
 *       plane cell index = r*64 + localCellA*8 + localCellB. No region -> SOLID (2).
 *       (wmaze 0x357a/0x35b7.)
 *
 *   (2) DEPTH LOOP. d = 0..3 (depthField = d). The cursor carries GLOBAL (gx,gy);
 *       forward/lateral view-steps move it by ±1 GLOBAL cell under the facing
 *       rotation (0x37a7), then re-resolve — so the walk crosses region planes
 *       correctly. One entry pull-back (forward=-1) establishes the d=0 origin.
 *
 *   (3) CORRECTED PER-FACING FORWARD-EDGE SELECTOR (classify_front_side 0x3828 +
 *       helpers 0x36dd/0x3742):
 *         f0 -> N(cell);  f1 -> W(cell);
 *         f2 -> N(cell at gy-1)  (the cell's own -cellA SOUTH face; OOB -> solid 2);
 *         f3 -> W(cell at gx-1)  (the -cellB EAST face; OOB -> solid 2).
 *       The CORNER + SIDE slots use the per-facing perp dispatch / lateral-step
 *       reads; see cornerL/cornerR/sideForward below.
 *
 *   (4) ORIENT2 FRONT GATE — the FACING DISCRIMINATOR (0x3af1). A door (forward
 *       edge code 3) viewed HEAD-ON becomes a drawn recess (front-shape 4) that
 *       emits flanking wt=2 side walls; the SAME door viewed from a non-matching
 *       facing reads a non-emitting code and draws nothing. A wall's door faces
 *       the direction you'd cross it head-on: a N-door faces -cellA (facing 2), a
 *       W-door faces -cellB (facing 3). The corrected forward-edge selector reads
 *       a door's FRONT face only for the head-on facings (2/3, which use the
 *       gy-1/gx-1 neighbour helpers); facings 0/1 read the door's BACK face. So a
 *       front-edge door (code 3) opens a recess ONLY for facing 2 or 3 — this IS
 *       the orient2==facing head-on gate, expressed geometrically (the engine's
 *       orient2 plane reads 0 along these corridors, so the surviving discriminator
 *       is the head-on read direction). confidence: high for facing 2 (4 live
 *       frames); the facing-3 head-on door is not exercised by the captured set.
 *
 *   (5) RECESS EMISSION. Once a head-on door opens the recess at depth `door`, the
 *       recess flanking wt=2 side walls are emitted at every depth d >= door while
 *       the corridor stays BOUNDED there (>=1 of cornerL/cornerR/leftSide/rightSide
 *       solid). The SCREEN-side (seam base left:12 / right:10) is parity
 *       alternation (gx+gy+facing+d)%2, INDEPENDENT of which physical side is solid
 *       (the corner-type-9 seam law, build.ts).
 *
 *   (6) OCCLUSION. A solid forward edge (code 2) caps the recess (the occlusion
 *       seeder 0x4892). The runtime occlusion at depth 3 differs from the static
 *       image (the five-pass static-vs-runtime divergence: lookback emits a df3
 *       wall the static gate forbids, while up-RR does NOT emit its df3 solid). The
 *       reconcilable rule that reproduces the captured emitters: emit from the door
 *       through the bounded run, dropping a TRAILING ISOLATED solid front (a solid
 *       forward edge preceded by an OPEN one — a back wall seen edge-on, not a side
 *       recess). confidence: medium (it is the rule consistent with all captured
 *       emitters; the exact runtime depth-3 bound is the documented residual).
 *
 * VALIDATION — see classify.test.ts. Reproduces BYTE-EXACT, classify->build->flush,
 * the recorded wt=2 spans for 11 of the 12 captured frames (the 4 committed + 8
 * navigated): lookback [0,1,2,3], up-RR [1,2], up-up-RR [2,3], and EMPTY for all
 * f0/f1/f3 open frames (maze-corridor, turn-left, asym, up, up-up, R-up, L-up,
 * L-up-up). The single residual is R-up-up (facing 1) — a corridor-capping solid
 * wall drawn as TWO split-clip bands at df3 (clip 72/128 + 128/248). That emit
 * shape is a distinct corner path (not the recess), at the gx129 region edge where
 * the static forward-edge read disagrees with the runtime (front reads 0; the
 * runtime sees a solid cap). It is isolated and documented as DONE_WITH_CONCERNS.
 */

import { SEAMIDX_CORNER_SOLID_BASE } from '@wiz6/data';
import type { MazeBlock, MazeParty } from '@wiz6/data';

/** Max depths the BUILD loop walks (wmaze DGROUP 0x521e = 4). */
const DEPTH_BOUND = 4;

/** A 2-bit wall field is "solid" (blocking) when non-zero. */
function isSolid(field: number): boolean {
  return field >= 1;
}

/** Resolve a GLOBAL cell (gx,gy) to {region, cellA, cellB}, or null if OOB. */
function resolve(
  block: MazeBlock,
  gx: number,
  gy: number,
): { region: number; cellA: number; cellB: number } | null {
  for (let r = 0; r < block.gxBase.length; r++) {
    const gxb = block.gxBase[r]!;
    const gyb = block.gyBase[r]!;
    if (gxb <= gx && gx <= gxb + 7 && gyb <= gy && gy <= gyb + 7) {
      return { region: r, cellA: gy - gyb, cellB: gx - gxb };
    }
  }
  return null;
}

/** Plane-cell field reader. Out-of-region -> SOLID boundary (2) for walls. */
function field(
  block: MazeBlock,
  gx: number,
  gy: number,
  key: 'north' | 'west',
): number {
  const c = resolve(block, gx, gy);
  if (!c) return 2;
  return block.regions[c.region]?.[c.cellA * 8 + c.cellB]?.[key] ?? 2;
}

const N = (b: MazeBlock, gx: number, gy: number) => field(b, gx, gy, 'north');
const W = (b: MazeBlock, gx: number, gy: number) => field(b, gx, gy, 'west');

/** GLOBAL-cell view-step under the facing rotation (view_step 0x37a7). */
function step(
  gx: number,
  gy: number,
  facing: number,
  lateral: number,
  forward: number,
): [number, number] {
  switch (facing) {
    case 0:
      return [gx + lateral, gy + forward];
    case 1:
      return [gx + forward, gy - lateral];
    case 2:
      return [gx - lateral, gy - forward];
    default:
      return [gx - forward, gy + lateral];
  }
}

/** The corrected forward-edge code of the cell at GLOBAL (gx,gy) under facing
 *  (classify_front_side 0x3828 + helpers 0x36dd/0x3742). */
function forwardEdge(b: MazeBlock, gx: number, gy: number, facing: number): number {
  switch (facing) {
    case 0:
      return N(b, gx, gy);
    case 1:
      return W(b, gx, gy);
    case 2:
      return N(b, gx, gy - 1); // -cellA south face (helper 0x36dd; OOB -> solid via N)
    default:
      return W(b, gx - 1, gy); // -cellB east face (helper 0x3742)
  }
}

/** Corner-L perpendicular edge (classify_corner_L 0x3c11, dispatch 0x3d20). */
function cornerL(b: MazeBlock, gx: number, gy: number, facing: number): number {
  switch (facing) {
    case 0:
      return W(b, gx - 1, gy);
    case 1:
      return N(b, gx, gy);
    case 2:
      return W(b, gx, gy);
    default:
      return N(b, gx, gy - 1);
  }
}

/** Corner-R perpendicular edge (classify_corner_R 0x3dce, dispatch 0x3edd). */
function cornerR(b: MazeBlock, gx: number, gy: number, facing: number): number {
  switch (facing) {
    case 0:
      return W(b, gx, gy);
    case 1:
      return N(b, gx, gy - 1);
    case 2:
      return W(b, gx - 1, gy);
    default:
      return N(b, gx, gy);
  }
}

/** Side slot: lateral view-step (OOB-after-step -> SOLID 2) then forward-edge of
 *  the neighbour (classify_front_side side params 0xffff/1). */
function sideForward(
  b: MazeBlock,
  gx: number,
  gy: number,
  facing: number,
  lateral: -1 | 1,
): number {
  const [sx, sy] = step(gx, gy, facing, lateral, 0);
  if (!resolve(b, sx, sy)) return 2;
  return forwardEdge(b, sx, sy, facing);
}

/**
 * classifyVisibleWalls — project the maze block + party into the per-depth
 * side-wall emission flags deriveCorridorSpans consumes.
 *
 * `sides[d]` (d = 0..DEPTH_BOUND-1, depthField = d) lists the SCREEN-side
 * label(s) ('left'/'right') to emit a wt=2 corridor side-wall span at that depth.
 * Each emitting depth carries exactly one parity-alternation-selected screen-side
 * (independent of which physical side is solid). Empty depths occupy their slot.
 */
export function classifyVisibleWalls(
  block: MazeBlock,
  party: MazeParty,
): Array<Array<'left' | 'right'>> {
  const { gx, gy, facing } = party;
  if (facing < 0 || facing > 3) throw new Error(`invalid facing ${facing}`);

  // Walk the depth loop, collecting the per-depth corrected slots.
  type Depth = {
    front: number;
    bounded: boolean;
  };
  const depths: Depth[] = [];
  let [cgx, cgy] = step(gx, gy, facing, 0, -1); // entry pull-back (forward=-1)
  for (let d = 0; d < DEPTH_BOUND; d++) {
    [cgx, cgy] = step(cgx, cgy, facing, 0, 1); // advance forward 1
    const front = forwardEdge(block, cgx, cgy, facing);
    const cL = cornerL(block, cgx, cgy, facing);
    const cR = cornerR(block, cgx, cgy, facing);
    const lS = sideForward(block, cgx, cgy, facing, -1);
    const rS = sideForward(block, cgx, cgy, facing, 1);
    const bounded = isSolid(cL) || isSolid(cR) || isSolid(lS) || isSolid(rS);
    depths.push({ front, bounded });
  }

  // ORIENT2 FRONT GATE: a head-on door opens the recess. The corrected forward
  // selector reads a door's FRONT face only for facings 2/3 (the gy-1/gx-1 helper
  // facings); facings 0/1 read its BACK face -> no recess.
  const headOnFacing = facing === 2 || facing === 3;
  const sides: Array<Array<'left' | 'right'>> = [[], [], [], []];

  if (headOnFacing) {
    const door = depths.findIndex((dd) => dd.front === 3);
    if (door >= 0) {
      // Emit from the door through the bounded run.
      const emit: number[] = [];
      for (let d = door; d < DEPTH_BOUND && depths[d]!.bounded; d++) emit.push(d);
      // OCCLUSION (medium confidence): drop a TRAILING ISOLATED solid forward edge
      // (a solid front preceded by an OPEN one within the recess) — a back wall
      // seen edge-on, not a side recess. The exact runtime depth-3 bound is the
      // documented static-vs-runtime residual; this rule is the one consistent
      // with every captured emitter (lookback keeps its consecutive trailing
      // solids; up-RR drops its isolated trailing solid).
      if (emit.length >= 2) {
        const last = emit[emit.length - 1]!;
        if (depths[last]!.front === 2 && depths[last - 1]!.front === 0) emit.pop();
      }
      for (const d of emit) {
        const parity = (gx + gy + facing + d) % 2;
        sides[d]!.push(parity === 0 ? 'right' : 'left');
      }
    }
  }

  return sides;
}

/** Re-export the validated seam base for callers that want the closed form. */
export type { MazeBlock, MazeParty };
export { SEAMIDX_CORNER_SOLID_BASE };
