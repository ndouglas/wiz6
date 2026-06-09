/**
 * flush.ts — maze FLUSH pass (spans -> FUN_1c94 call-list), ported verbatim
 * from tools/parity/render-maze-frame.ts (generateCallList).
 *
 * The wmaze 3D renderer's FLUSH phase (Pass B @0x52f8): given the span list
 * built by the BUILD phase, it produces the ordered FUN_1c94 compositor
 * call-list. The outer depth loop counts SIZE..0; for each depth it scans ALL
 * spans in reverse order and emits one call per span whose depthField matches
 * and whose walltype != 0xff (wt==0xff spans are Pass A / edge-emit only).
 *
 * See tools/parity/render-maze-frame.ts for full RE commentary and the disasm
 * anchors (wmaze.ovr view_render_corridor_frame 0x4ad7 / flush Pass B 0x52f8).
 * See docs/re/findings/maze-span-build.json for validation evidence.
 */

import type { MazeSpan, CompositorCall } from './compositor.js';

export type { MazeSpan, CompositorCall };

/** The maze flush (renderer Pass B @0x52f8): turn a span list into the ordered
 *  FUN_1c94 compositor call-list. Mirrors the asm exactly:
 *    for depth = SIZE..0:  for i = count-1..0:
 *      if span[i].depthField == depth && span[i].walltype != 0xff:
 *        emit(piece=seamIdx, x0, arg10=x1, tile=walltype)
 *  SIZE defaults to 4 (DGROUP 0x521e in the corridor).
 *
 *  `phase` selects the door-piece ANIMATION frame: 0 = the span's `seamIdx`,
 *  1 = its `seamAlt` (when present). The engine flickers door/recess pieces
 *  between two adjacent atlas pieces on a global clock; a span with no seamAlt
 *  is static. Parity fixtures render at phase 0 (their captured frame); the
 *  viewer animates the phase. */
export function generateCallList(spans: MazeSpan[], size = 4, phase: 0 | 1 = 0): CompositorCall[] {
  const out: CompositorCall[] = [];
  for (let depth = size; depth >= 0; depth--) {
    for (let i = spans.length - 1; i >= 0; i--) {
      const s = spans[i]!;
      if (s.depthField === depth && s.walltype !== 0xff) {
        const piece = phase === 1 && s.seamAlt !== undefined ? s.seamAlt : s.seamIdx;
        out.push({
          piece,
          x0: s.x0,
          arg10: s.x1,
          tile: s.walltype,
          clipLo: s.clipLo,
          clipHi: s.clipHi,
        });
      }
    }
  }
  return out;
}
