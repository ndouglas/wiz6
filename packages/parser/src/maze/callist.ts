/**
 * callist.ts — maze BACKGROUND blit call list + the from-asset compose.
 *
 * The maze background page is composited by ega.drv FUN_0a93 (the OR-blit /
 * masked-mirror compositor) from an ordered list of CALLS, each placing one
 * sub-image of `mazedata.ega` into the off-screen page. Each call is either:
 *   - `OR`     — a forward OR-blit of placement `src`'s own image (FUN_0a93 0xaa9)
 *   - `masked` — a horizontal-mirror blit of placement `src`'s image into
 *                placement `dst`'s geometry, OR-merged or REPLACE-carved per
 *                `mode` (FUN_0a93 0xbc6). See background.ts / maze-data.ts.
 *
 * The per-view SELECTION of which calls to emit is produced by the wmaze view
 * loop (view_render_corridor_frame 0x4ad7 + depth loop 0x4c60), interleaved with
 * the wall-span emit. RE status: the call list is currently CAPTURED per frame
 * (live, at ega.drv FUN_0a93, reproducible byte-identical) rather than GENERATED
 * from (zone,facing,geometry). The generation law (the depth→placement-bank
 * arithmetic over the 366 static placement records) is partially reversed but not
 * yet byte-exact — the slot helpers (0x3828/0x3c11/0x3dce/0x4892) defeat the
 * decompiler. See docs/re/findings/maze-callist-generation.json.
 *
 * The committed gy=121 list (maze-corridor.idx.gz oracle frame) composes to
 * 99.909% of the oracle viewport (19694/19712); the 18px residual is the
 * deep-door-center detail, which is NOT representable by adding any static
 * mazedata.ega placement (exhaustively verified) — it comes from a draw path
 * beyond the OR/masked background blit. Tracked in TODO.
 */

import { PLANE_STRIDE } from '@wiz6/data';
import {
  composeBackground,
  applyMaskedMirror,
} from './background.js';
import {
  expandMazeData,
  orPlacementFor,
  maskedMirrorFor,
  type MazeWorkBuffer,
} from './maze-data.js';

/** One background blit call. */
export type BackgroundCall =
  | { kind: 'OR'; src: number }
  | { kind: 'masked'; src: number; dst: number; mode: 'or' | 'replace' };

/** A per-view background blit call list (engine emit order). */
export type CallList = BackgroundCall[];

/**
 * Compose a from-asset background page from a call list + the expanded
 * `mazedata.ega` work buffer. The page is OR/masked-composited in call order
 * (background.ts faithful to ega.drv FUN_0a93). Returns a fresh 4-plane EGA page.
 */
export function composeCallList(wb: MazeWorkBuffer, calls: CallList): Uint8Array {
  const page = new Uint8Array(4 * PLANE_STRIDE);
  for (const c of calls) {
    if (c.kind === 'OR') {
      composeBackground(page, [orPlacementFor(wb, c.src)]);
    } else {
      applyMaskedMirror(page, maskedMirrorFor(wb, c.src, c.dst, c.mode));
    }
  }
  return page;
}

/** Convenience: expand `mazedata.ega` then compose the call list into a page. */
export function composeBackgroundFromAsset(
  mazedataEga: Uint8Array,
  calls: CallList,
): Uint8Array {
  return composeCallList(expandMazeData(mazedataEga), calls);
}
