/**
 * view-config.ts — the per-(cell,facing) VIEW-CONFIG that determines the rendered
 * first-person view, plus its canonical string key.
 *
 * This is the SINGLE SOURCE OF TRUTH for the view-config key. Both the offline
 * enumeration (tools/parity/maze-view-cases.ts, Task C1) and the captured-span
 * lookup in the live renderer (render.ts, Task D1) compute the key here so the
 * lookup CANNOT silently miss on a keying drift. The C2 gate keyed the committed
 * tools/parity/fixtures/engine/maze-wall-spans.json with viewConfigKey(viewConfig(
 * block, representative)) — verified byte-identical for all 32 cases.
 *
 * The frustum primitives mirror classify.ts EXACTLY (both import the same asm-
 * grounded maze-geometry.ts helpers). Pure + isomorphic — no node:* imports.
 */

import type { MazeBlock, MazeParty } from '@wiz6/data';
import {
  isSolid,
  resolve as resolveCell,
  N,
  W,
  step,
  forwardEdge,
} from './maze-geometry.js';

/** Max depths the BUILD loop walks (wmaze DGROUP 0x521e = 4). Mirrors classify.ts. */
const DEPTH_BOUND = 4;

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
 *  the neighbour (classify_front_side side params 0xffff/1). Mirrors classify.ts. */
function sideForward(
  b: MazeBlock,
  gx: number,
  gy: number,
  facing: number,
  lateral: -1 | 1,
): number {
  const [sx, sy] = step(gx, gy, facing, lateral, 0);
  if (!resolveCell(b, sx, sy)) return 2;
  return forwardEdge(b, sx, sy, facing);
}

/** Per-depth frustum slot (the edge codes the classifier reads at depth d). */
export interface DepthSlot {
  depth: number;
  front: number; // forward edge of the depth cell (corrected per-facing selector)
  cornerL: number; // perpendicular corner-L edge
  cornerR: number; // perpendicular corner-R edge
  leftSide: number; // lateral-step neighbour forward edge (left)
  rightSide: number; // lateral-step neighbour forward edge (right)
  bounded: boolean; // >=1 of cL/cR/lS/rS solid (corridor bounded here)
  inRegion: boolean; // depth cell resolves to a region (else OOB → all solid)
}

/** The full local view-config that determines the rendered first-person view. */
export interface ViewConfig {
  slots: DepthSlot[]; // DEPTH_BOUND entries (d=0..3)
  headOnDoorDepth: number; // depth of the head-on door (front===3, facing 2/3), or -1
}

/** Compute the view-config for a (cell, facing) — the cells/edges in the frustum. */
export function viewConfig(block: MazeBlock, party: MazeParty): ViewConfig {
  const { gx, gy, facing } = party;
  const slots: DepthSlot[] = [];
  let [cgx, cgy] = step(gx, gy, facing, 0, -1); // entry pull-back (forward=-1)
  for (let d = 0; d < DEPTH_BOUND; d++) {
    [cgx, cgy] = step(cgx, cgy, facing, 0, 1); // advance forward 1
    const front = forwardEdge(block, cgx, cgy, facing);
    const cL = cornerL(block, cgx, cgy, facing);
    const cR = cornerR(block, cgx, cgy, facing);
    const lS = sideForward(block, cgx, cgy, facing, -1);
    const rS = sideForward(block, cgx, cgy, facing, 1);
    const bounded = isSolid(cL) || isSolid(cR) || isSolid(lS) || isSolid(rS);
    const inRegion = resolveCell(block, cgx, cgy) !== null;
    slots.push({
      depth: d,
      front,
      cornerL: cL,
      cornerR: cR,
      leftSide: lS,
      rightSide: rS,
      bounded,
      inRegion,
    });
  }
  // ORIENT2 head-on-door gate: a door (front===3) is a drawn recess only for the
  // head-on facings 2/3 (classify.ts headOnFacing). For 0/1 it reads the back face.
  const headOnFacing = facing === 2 || facing === 3;
  const headOnDoorDepth = headOnFacing ? slots.findIndex((s) => s.front === 3) : -1;
  return { slots, headOnDoorDepth };
}

/** Canonical string key for a view-config (for dedup + captured-span lookup).
 *  Captures every field that feeds the wall classifier + the recess gate. */
export function viewConfigKey(cfg: ViewConfig): string {
  const slotKey = cfg.slots
    .map(
      (s) =>
        `${s.front}:${s.cornerL}:${s.cornerR}:${s.leftSide}:${s.rightSide}:${s.bounded ? 1 : 0}:${s.inRegion ? 1 : 0}`,
    )
    .join('|');
  return `${slotKey}#door=${cfg.headOnDoorDepth}`;
}

/** Convenience: compute the view-config key directly from (block, party). */
export function viewConfigKeyFor(block: MazeBlock, party: MazeParty): string {
  return viewConfigKey(viewConfig(block, party));
}
