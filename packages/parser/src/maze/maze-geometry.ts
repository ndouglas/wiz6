/**
 * maze-geometry.ts — shared low-level geometry helpers extracted from
 * classify.ts so that movement.ts can reuse them without duplication.
 *
 * These are the primitives underpinning the byte-exact CLASSIFY pass
 * (wmaze 0x3244 / 0x357a / 0x35b7 / 0x3828 / 0x36dd / 0x3742 / 0x37a7).
 * Do NOT modify the logic — it is asm-grounded and pinned by classify.test.ts.
 */

import type { MazeBlock } from '@wiz6/data';

/** A 2-bit wall field is "solid" (blocking) when non-zero. */
export function isSolid(field: number): boolean {
  return field >= 1;
}

/** Resolve a GLOBAL cell (gx,gy) to {region, cellA, cellB}, or null if OOB.
 *  (wmaze resolver 0x357a/0x35b7) */
export function resolve(
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
export function field(
  block: MazeBlock,
  gx: number,
  gy: number,
  key: 'north' | 'west',
): number {
  const c = resolve(block, gx, gy);
  if (!c) return 2;
  return block.regions[c.region]?.[c.cellA * 8 + c.cellB]?.[key] ?? 2;
}

export const N = (b: MazeBlock, gx: number, gy: number) => field(b, gx, gy, 'north');
export const W = (b: MazeBlock, gx: number, gy: number) => field(b, gx, gy, 'west');

/** The 4-bit `special4` DECORATION code (+0x1f8) of the cell at GLOBAL (gx,gy).
 *  Out-of-region -> 0 (no decoration). */
export function special4(b: MazeBlock, gx: number, gy: number): number {
  const c = resolve(b, gx, gy);
  if (!c) return 0;
  return b.regions[c.region]?.[c.cellA * 8 + c.cellB]?.special4 ?? 0;
}

/** The 2-bit `orient2` DECORATION ORIENTATION (+0x378) of the cell at GLOBAL
 *  (gx,gy). Out-of-region -> -1 (gate never matches). */
export function orient2(b: MazeBlock, gx: number, gy: number): number {
  const c = resolve(b, gx, gy);
  if (!c) return -1;
  return b.regions[c.region]?.[c.cellA * 8 + c.cellB]?.orient2 ?? -1;
}

/** GLOBAL-cell view-step under the facing rotation (view_step 0x37a7).
 *  Returns [newGx, newGy] after applying (lateral, forward) in the facing frame. */
export function step(
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

/** The corrected forward-edge code of the cell at GLOBAL (gx,gy) under facing.
 *  (classify_front_side 0x3828 + helpers 0x36dd/0x3742)
 *
 *    f0 -> N(cell);  f1 -> W(cell);
 *    f2 -> N(cell at gy-1)   (-cellA south face; OOB -> solid 2)
 *    f3 -> W(cell at gx-1)   (-cellB east face; OOB -> solid 2)
 */
export function forwardEdge(b: MazeBlock, gx: number, gy: number, facing: number): number {
  switch (facing) {
    case 0:
      return N(b, gx, gy);
    case 1:
      return W(b, gx, gy);
    case 2:
      return N(b, gx, gy - 1);
    default:
      return W(b, gx - 1, gy);
  }
}

/** Corner-L perpendicular edge of the cell at GLOBAL (gx,gy) under facing
 *  (classify_corner_L 0x3c11, dispatch 0x3d20). */
export function cornerL(b: MazeBlock, gx: number, gy: number, facing: number): number {
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

/** Corner-R perpendicular edge of the cell at GLOBAL (gx,gy) under facing
 *  (classify_corner_R 0x3dce, dispatch 0x3edd). */
export function cornerR(b: MazeBlock, gx: number, gy: number, facing: number): number {
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
