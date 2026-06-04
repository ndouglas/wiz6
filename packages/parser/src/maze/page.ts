/**
 * page.ts — decode a Wiz6 maze off-screen compose page into per-pixel palette
 * indices (or RGBA).
 *
 * Ported verbatim from tools/parity/render-maze-page.ts (RE-validated).
 *
 * PAGE LAYOUT (CONFIRMED): 4 EGA planes, plane p at pageBase + p*PLANE_STRIDE,
 * row stride PAGE_ROW_BYTES (40 bytes/row = 320px).
 *
 *   pixel(x,y) index = Σ_p ( (page[y*40 + x/8 + p*0x2000] >> (7-(x%8))) & 1 ) << p
 *
 * See tools/parity/render-maze-page.ts for full RE commentary.
 */
import { PLANE_STRIDE, PAGE_ROW_BYTES } from '@wiz6/data';

// Default EGA 16-color palette (index -> RGB). Ported verbatim from prototype.
// The live game remaps several entries via EGA palette registers; pass a custom
// palette to decodePageRgba for a faithful render.
const EGA: Array<[number, number, number]> = [
  [0, 0, 0],       [0, 0, 170],     [0, 170, 0],     [0, 170, 170],
  [170, 0, 0],     [170, 0, 170],   [170, 85, 0],    [170, 170, 170],
  [85, 85, 85],    [85, 85, 255],   [85, 255, 85],   [85, 255, 255],
  [255, 85, 85],   [255, 85, 255],  [255, 255, 85],  [255, 255, 255],
];

/**
 * Decode the palette index for a single pixel at (x, y).
 *
 * Verbatim port of render-maze-page.ts `decodePageIndex(page, x, y)`.
 */
function decodePixelIndex(page: Uint8Array, x: number, y: number): number {
  const off = y * PAGE_ROW_BYTES + (x >> 3);
  const bit = 7 - (x & 7);
  let idx = 0;
  for (let p = 0; p < 4; p++) {
    idx |= ((page[off + p * PLANE_STRIDE]! >> bit) & 1) << p;
  }
  return idx;
}

/**
 * Decode all w×h pixels from a 4-plane EGA compose page into a flat
 * Uint8Array of palette indices (0..15), row-major.
 *
 * @param page   Raw page buffer (must be >= 4 * PLANE_STRIDE bytes)
 * @param w      Width in pixels (typically 320)
 * @param h      Height in pixels (typically 200)
 * @returns      Uint8Array of length w*h, one index per pixel
 */
export function decodePageIndex(page: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[y * w + x] = decodePixelIndex(page, x, y);
    }
  }
  return out;
}

/**
 * Decode a 4-plane EGA compose page into a flat RGBA Uint8Array (w×h×4).
 *
 * Ported verbatim from render-maze-page.ts `decodePageRgba(page, palette)`.
 * Bakes in 320×200 — call with explicit w/h via the index path if you need
 * a different resolution.
 *
 * @param page     Raw page buffer (>= 4 * PLANE_STRIDE bytes)
 * @param w        Width in pixels (typically 320)
 * @param h        Height in pixels (typically 200)
 * @param palette  16-entry RGB palette; defaults to EGA defaults
 * @returns        RGBA Uint8Array of length w*h*4
 */
export function decodePageRgba(
  page: Uint8Array,
  w: number,
  h: number,
  palette: Array<[number, number, number]> = EGA,
): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = palette[decodePixelIndex(page, x, y)]!;
      const o = (y * w + x) * 4;
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
    }
  }
  return out;
}
