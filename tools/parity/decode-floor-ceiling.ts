/**
 * decode-floor-ceiling.ts — the cracked Wiz6 maze floor/ceiling/window background
 * decoder: ega.drv DISPATCH ENTRY 15 = FUN_0a93 (the proprietary "masked-image"
 * full-window asset compositor, called the OR-blit).
 *
 * VALIDATED 99.93% byte-exact (4458/4461 OR-written viewport bytes; 3 residual px
 * = per-group source-snapshot timing) reproducing the engine's background page
 * from the captured source work-buffers. The remaining mapping (on-disk compressed
 * asset -> work-buffer) is the already-cracked .pic RLE decoder (maze-texture-
 * decode.json) re-run per image group.
 *
 * ── THE FORMAT (asm-confirmed, ega.drv file 0x0a93..0x0bc3) ──
 *
 * The background is composited from a list of PLACEMENT records, each placing one
 * 4-plane PLANAR sub-image into the off-screen compose page with an OR-merge.
 * There is NO mask byte and NO RLE in the pixel walk — the "mask" is the OR-merge
 * itself (background composited UNDER the walls; the page is pre-zeroed, so OR-ing
 * background bits then letting the masked wall writer REPLACE wall pixels on top).
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
 *   plane stride = w*h  ([bp-2]); the 4 planes are contiguous in the source seg:
 *     plane p at srcBase + p*(w*h).
 *
 *   THE WALK (per placement, OR branch [bp+0xe]!=0):
 *     ds       = cs:[0x149] + segDelta                 (source segment)
 *     w        = imgdesc.w        ([bp-6], si row stride)
 *     cx       = placement.count  ([bp-4], bytes copied per row)
 *     planeStride = w*h           ([bp-2])
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
 * plain 4-plane planar. The window is the SAME format (small w=4..9 sub-images in
 * the x128..192 center), NOT a separate sprite path.
 */

export const PLANE_STRIDE = 0x2000;
export const PAGE_ROW_BYTES = 0x28;

/**
 * One placed planar sub-image (one PLACEMENT record + its IMAGE descriptor,
 * resolved). All values are exactly the asm's per-image quantities.
 */
export interface PlacedImage {
  /** source segment bytes (a decompressed work buffer; >= si + 4*planeStride) */
  src: Uint8Array;
  /** plane-0 source byte offset (= imgdesc.srcOff + placement.bias) */
  si: number;
  /** dest page byte offset, plane 0, row 0 (= destX + bias + 0x28*destRow) */
  di: number;
  /** bytes copied per row ([bp-4] = placement.count; <= w) */
  cx: number;
  /** image width in bytes (= imgdesc.w; the si row stride) */
  w: number;
  /** number of rows (= imgdesc.h) */
  h: number;
  /** plane stride (= w*h = [bp-2]) */
  planeStride: number;
}

/**
 * OR-merge one 4-plane planar sub-image into the compose page. Faithful to the
 * ega.drv 0xa93 walk: cx bytes per row, w-byte source row stride, planeStride
 * plane jump, 0x28 dest row stride, 0x2000 dest plane stride.
 */
export function applyPlacedImage(page: Uint8Array, img: PlacedImage): void {
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

/** Composite a full background page from an ordered list of placed images. */
export function composeBackground(page: Uint8Array, images: PlacedImage[]): void {
  for (const img of images) applyPlacedImage(page, img);
}
