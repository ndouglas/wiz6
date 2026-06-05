/**
 * background.ts — maze BACKGROUND compositor (floor / ceiling / side-panels /
 * portcullis-window OR-blit). Ported verbatim from the RE-validated decoder
 * tools/parity/decode-floor-ceiling.ts.
 *
 * This is ega.drv DISPATCH ENTRY 15 = FUN_0a93 (the proprietary "masked-image"
 * full-window asset compositor, the OR-blit). It is a SEPARATE compositor from
 * the wall writer (entry 10 = FUN_1c94, packages/parser/src/maze/compositor.ts):
 * the OR-blit lays the background into a pre-zeroed page with an OR-merge, then
 * the wall compositor REPLACES wall pixels on top (compositor.ts), and the page
 * decodes to the screen (page.ts decodePageIndex).
 *
 * VALIDATED 99.93% byte-exact (4458/4461 OR-written viewport bytes) reproducing
 * the engine's background page from the engine's per-image placement walk + the
 * per-group source work-buffers (the committed same-run pair is the deterministic
 * gate — tests/maze/background.test.ts). The 3-px residual is a documented live
 * capture-timing artifact on a transient work buffer, NOT a decoder-model error.
 * See docs/re/findings/maze-floor-ceiling-decoder.json.
 *
 * ── THE FORMAT (asm-confirmed, ega.drv file 0x0a93..0x0bc3) ──
 *
 * The background is composited from a list of PLACEMENT records, each placing one
 * 4-plane PLANAR sub-image into the off-screen compose page with an OR-merge.
 * There is NO mask byte and NO RLE in the pixel walk — the "mask" is the OR-merge
 * itself (the page is pre-zeroed, so OR-ing background bits in then letting the
 * masked wall writer REPLACE wall pixels on top yields the background showing only
 * where walls are transparent).
 *
 *   PLACEMENT table  (cs:[0x190], 5-byte records, indexed by [bp+0xc]):
 *     [0] imageIdx  -> indexes the image-descriptor table
 *     [1] destX     dest page byte-column base
 *     [2] destRow   dest page row base (*0x28)
 *     [3] bias      added to destX-source (src += bias) — sub-tile horiz crop start
 *     [4] count     INNER COPY WIDTH cx (bytes copied per row; <= image width w)
 *   IMAGE-descriptor table (cs:[0x18e], 5-byte records):
 *     [0] segDelta  added to the placement-walk ds -> the source SEGMENT
 *     [2] srcOff    source byte offset of plane 0
 *     [3] w         image width in BYTES per plane row  (== si ROW STRIDE)
 *     [4] h         image height in rows                (== OUTER row count)
 *   plane stride = w*h; the 4 planes are contiguous in the source seg:
 *     plane p at srcBase + p*(w*h).
 *
 *   THE WALK (per placement, OR branch [bp+0xe]!=0):
 *     ds       = cs:[0x149] + segDelta                 (source segment)
 *     w        = imgdesc.w        (si row stride)
 *     cx       = placement.count  (bytes copied per row)
 *     planeStride = w*h
 *     di       = destX + bias + 0x28*destRow           (dest page off, plane 0)
 *     si       = srcOff + bias                          (asm: ax = [bx+2] + [si+3])
 *     for row in 0..h-1:
 *       for p in 0..3:
 *         for b in 0..cx-1:  page[di + p*0x2000 + b] |= src[si + p*planeStride + b]
 *       si += w ; di += 0x28
 *
 * The floor/ceiling perspective + the geometry-dependent black void (corridor
 * opening) + the central portcullis window are ALL encoded as the SET of placement
 * records (per-row/per-column destX/destRow/cx triangular fills). The pixel data is
 * plain 4-plane planar. The window is the SAME format, NOT a separate sprite path.
 */

import { PLANE_STRIDE, PAGE_ROW_BYTES } from '@wiz6/data';
import type { BackgroundPlacement } from '@wiz6/data';

/**
 * OR-merge one 4-plane planar sub-image into the compose page. Faithful to the
 * ega.drv 0xa93 walk: cx bytes per row, w-byte source row stride, planeStride
 * plane jump, PAGE_ROW_BYTES dest row stride, PLANE_STRIDE dest plane stride.
 */
export function applyPlacedImage(page: Uint8Array, img: BackgroundPlacement): void {
  const { src, si, di, cx, w, h, planeStride } = img;
  for (let row = 0; row < h; row++) {
    const sRow = si + row * w;
    const dRow = di + row * PAGE_ROW_BYTES;
    for (let p = 0; p < 4; p++) {
      const s = sRow + p * planeStride;
      const d = dRow + p * PLANE_STRIDE;
      for (let b = 0; b < cx; b++) page[d + b]! |= src[s + b]!;
    }
  }
}

/**
 * Composite a full background page from an ordered list of placed images.
 *
 * @param page    Pre-zeroed 4-plane EGA compose page (>= 4 * PLANE_STRIDE bytes).
 *                Mutated in place — the OR-merge accumulates background bits.
 * @param images  The resolved placement records for THIS view (per-view selection
 *                of the engine's cs:[0x190]/cs:[0x18e] tables — see render.ts).
 */
export function composeBackground(page: Uint8Array, images: BackgroundPlacement[]): void {
  for (const img of images) applyPlacedImage(page, img);
}
