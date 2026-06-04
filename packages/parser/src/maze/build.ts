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
import type { MazeSpan } from './compositor.js';

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
 *  read. `sides[d]` (d = 0..depthBound-1) lists which sides are solid at that
 *  depth (depthField = d+1). Edge-marker (wt=0xff) spans are NOT generated here
 *  (they are Pass-A only and don't contribute FUN_1c94 wall pieces).
 *
 *  This is the from-geometry replacement for the hardcoded MAZE_FRAME_*_SPANS:
 *  given the classified solid corners per depth, it reproduces the live wt=2
 *  spans byte-for-byte (validated against FRAME A + FRAME B). */
export function deriveCorridorSpans(
  sides: ReadonlyArray<ReadonlyArray<'left' | 'right'>>,
  seamX0: Uint8Array,
  seamX1: Uint8Array,
): MazeSpan[] {
  const out: MazeSpan[] = [];
  for (let d = 0; d < sides.length; d++) {
    const depthField = d + 1;
    for (const side of sides[d]!) {
      const seamIdx = cornerSolidSeamIdx(depthField, side);
      const { x0, x1 } = refineSpanColumns(0, 0, 2, seamIdx, seamX0, seamX1);
      out.push({ x0, x1, clipLo: 72, clipHi: 248, walltype: 2, seamIdx, depthField });
    }
  }
  return out;
}
