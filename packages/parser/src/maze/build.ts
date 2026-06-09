/**
 * build.ts — maze BUILD phase: per-depth solid-side flags → span list.
 *
 * Ported verbatim from tools/parity/render-maze-frame.ts:
 *   refineSpanColumns  (span_append 0x3f8d seam-refinement law)
 *   cornerSolidSeamIdx (corner type-9 solid seamIdx law)
 *   deriveCorridorSpans (from-geometry span generator)
 *
 * IMPORT DIFF FROM PROTOTYPE:
 *   - SEAMIDX_CORNER_SOLID_BASE imported from @wiz6/data (not redefined here)
 *   - MazeSpan type imported from ./compositor.js (not redefined here)
 *   - .js extensions on all relative imports (TS ESM)
 *
 * See tools/parity/render-maze-frame.ts for full RE commentary, disasm anchors,
 * and the empirical evidence behind the sideBase values (confidence: medium).
 */

import { SEAMIDX_CORNER_SOLID_BASE } from '@wiz6/data';
import type { MazeBlock, MazeParty } from '@wiz6/data';
import type { MazeSpan } from './compositor.js';
import { forwardEdge, step } from './maze-geometry.js';

/** The seam-refinement law (span_append 0x3f8d): given the per-walltype seam
 *  tables (DGROUP 0x36e4 / 0x3717, stride 0x13a) and a span emitted with base
 *  x0/x1, compute the refined screen columns. The corridor solid-wall emitter
 *  pushes x0_base = x1_base = 0, so the refined x0/x1 ARE the seam-table values.
 *    x0 = x0_base + seam_x0[0x13a*walltype + 2*seamIdx]   (2x — shl @0x3fcd)
 *    x1 = x1_base + seam_x1[0x13a*walltype + 1*seamIdx]   (1x — no shl @0x3ffd)
 *  No refinement when walltype == 0xff. */
export function refineSpanColumns(
  x0Base: number,
  x1Base: number,
  walltype: number,
  seamIdx: number,
  seamX0: Uint8Array, // DGROUP 0x36e4 region (full-stride buffer; wt=2 slice at 0x13a*2)
  seamX1: Uint8Array, // DGROUP 0x3717 region
): { x0: number; x1: number } {
  if (walltype === 0xff) return { x0: x0Base, x1: x1Base };
  const o0 = 0x13a * walltype + 2 * seamIdx;
  const o1 = 0x13a * walltype + 1 * seamIdx;
  return { x0: (x0Base + (seamX0[o0] ?? 0)) & 0xffff, x1: (x1Base + (seamX1[o1] ?? 0)) & 0xffff };
}

/** seamIdx for a corner type-9 solid side-wall: depthField + the per-side base.
 *  (walltype is always 2 for the corridor solid path.) */
export function cornerSolidSeamIdx(depthField: number, side: 'left' | 'right'): number {
  return depthField + SEAMIDX_CORNER_SOLID_BASE[side];
}

/** Generate the corridor span list (incl. seamIdx + seam-refined x0/x1) PURELY
 *  from geometry: the per-depth solid-side flags + the seam tables. No live span
 *  read. `sides[d]` (d = 0..depthBound-1) lists which side(s) emit at that depth;
 *  depthField = d (0-BASED — the renderer's BUILD depth counter 0x5040 runs
 *  0..3 and depthField on each span = that counter directly; d=0 is the party's
 *  own cell). See docs/re/findings/maze-classify-projection.json
 *  (depth-loop-and-depthfield-0). Edge-marker (wt=0xff) spans are NOT generated
 *  here (they are Pass-A only and don't contribute FUN_1c94 wall pieces).
 *
 *  This is the from-geometry replacement for the hardcoded MAZE_FRAME_*_SPANS:
 *  given the classified solid corners per depth, it reproduces the live wt=2
 *  spans byte-for-byte (validated against the lookback frame, depthField 0..3). */
export function deriveCorridorSpans(
  sides: ReadonlyArray<ReadonlyArray<'left' | 'right'>>,
  seamX0: Uint8Array,
  seamX1: Uint8Array,
): MazeSpan[] {
  const out: MazeSpan[] = [];
  for (let d = 0; d < sides.length; d++) {
    const depthField = d;
    for (const side of sides[d]!) {
      const seamIdx = cornerSolidSeamIdx(depthField, side);
      const { x0, x1 } = refineSpanColumns(0, 0, 2, seamIdx, seamX0, seamX1);
      out.push({ x0, x1, clipLo: 72, clipHi: 248, walltype: 2, seamIdx, depthField });
    }
  }
  return out;
}

const DOOR_CODE = 3;
const SOLID_CODE = 2;
/**
 * The FAR-DOOR CENTERPIECE — the #077 "deep-door-center detail" (the door leaf at
 * the corridor vanishing point). CRACKED 2026-06-09 (tools/libretro/trace-maze.ts
 * `deepdoor` + `deepdoorspans`, docs/re/findings/maze-deepdoor-drawpath.json):
 *
 *   - It is a single FUN_1c94 (entry-10 masked wall compositor) span — walltype 1
 *     (the tile-1 atlas), NOT a wt=2 corridor side-wall and NOT any of the 366
 *     static mazedata.ega OR/masked placements (exhaustively ruled out).
 *   - For the canonical gy121 corridor the engine's SETTLED span list (DGROUP
 *     0x50d0) is EXACTLY this one span: x0=158 x1=68 clip=72/248 wt=1 df=2.
 *   - The piece ANIMATES between seamIdx 5 and 6 (the long-mislabelled
 *     "dither-phase" flicker); the committed maze-corridor.idx.gz oracle is the
 *     seam=5 phase, so we emit seam 5 (byte-exact 19712/19712 — see
 *     maze-corridor-generated-parity.test.ts).
 *   - It only appears on a FULL arrival recompose; the in-place-turn DIRTY redraw
 *     reuses the cached piece (which is why the gy121 call-list captured via an
 *     in-place turn — and deriveCorridorSpans, which never emits wt=1 — both
 *     dropped it, leaving the documented 18px gap).
 *
 * Geometry gate: a door (forwardEdge==3) seen from a NON-head-on facing (0/1) down
 * an OPEN corridor renders as this far centerpiece. (Head-on facings 2/3 render a
 * door as a wt=2 RECESS instead — classifyVisibleWalls.) Only the depth-2 far door
 * is captured ground truth; other door depths await capture (TODO #077).
 */
export function deriveDoorCenterpieceSpans(
  block: MazeBlock,
  party: MazeParty,
): MazeSpan[] {
  const { gx, gy, facing } = party;
  // Head-on facings render a door as a wt=2 recess (classifyVisibleWalls), not a
  // far centerpiece. Only facings 0/1 read a door's far/back face.
  if (facing === 2 || facing === 3) return [];
  // Walk forward (same pull-back-then-advance as classifyVisibleWalls). Find the
  // first forward door reached down an OPEN corridor; a solid front occludes first.
  let [cgx, cgy] = step(gx, gy, facing, 0, -1);
  for (let d = 0; d < 4; d++) {
    [cgx, cgy] = step(cgx, cgy, facing, 0, 1);
    const front = forwardEdge(block, cgx, cgy, facing);
    if (front === DOOR_CODE) {
      // Ground-truth far-door centerpiece (depth 2 only — see docstring).
      if (d === 2) {
        // seamIdx 5 (phase 0 = the maze-corridor oracle frame); the door flickers
        // to seam 6 (phase 1) — the engine's global door-animation clock.
        return [
          { x0: 158, x1: 68, clipLo: 72, clipHi: 248, walltype: 1, seamIdx: 5, seamAlt: 6, depthField: 2 },
        ];
      }
      return []; // other door depths: not yet captured (TODO #077)
    }
    if (front === SOLID_CODE) return []; // a solid wall occludes before any door
  }
  return [];
}
