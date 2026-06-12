/**
 * glyph-core — shared palette-index glyph renderers.
 *
 * Both functions write into a caller-owned Uint8Array whose dimensions are
 * given explicitly as `width` / `height`. Output is palette INDEX (not RGBA),
 * matching the engine's VRAM write convention. Pixels outside the buffer
 * bounds are silently clipped.
 *
 * These are the canonical implementations shared by all strip/menu composers.
 * Glyph tables are passed in as plain number[][] so callers choose which font
 * to use (wfont0 for 1bpp, wfont3 for 4bpp).
 */

const CELL = 8;

/**
 * Draw a wfont3 (4bpp EGA-planar) glyph into `buf` at pixel (px, py).
 *
 * Each glyph is 32 bytes: 8 rows × 4 planes (G, B, R, I). The 4-bit file
 * pixel value IS the palette index the engine writes to VRAM, so we write it
 * directly — no override or remapping.
 */
export function drawGlyph4bpp(
  buf: Uint8Array,
  width: number,
  height: number,
  px: number,
  py: number,
  code: number,
  glyphs: number[][],
): void {
  const glyph = glyphs[code];
  if (!glyph) return;
  for (let row = 0; row < CELL; row++) {
    const y = py + row;
    if (y < 0 || y >= height) continue;
    const pG = glyph[row] ?? 0;
    const pB = glyph[8 + row] ?? 0;
    const pR = glyph[16 + row] ?? 0;
    const pI = glyph[24 + row] ?? 0;
    for (let col = 0; col < CELL; col++) {
      const x = px + col;
      if (x < 0 || x >= width) continue;
      const bit = 7 - col;
      const fileIdx =
        ((pG >> bit) & 1) |
        (((pB >> bit) & 1) << 1) |
        (((pR >> bit) & 1) << 2) |
        (((pI >> bit) & 1) << 3);
      buf[y * width + x] = fileIdx;
    }
  }
}

/**
 * Draw a wfont0 (1bpp) glyph mask into `buf` at pixel (px, py).
 *
 *  - colored (inverse=false): write `stroke` at mask=1 pixels; leave mask=0
 *    pixels untouched (transparent — the underlying fill shows through).
 *  - inverse (inverse=true): write `bg` at every pixel of the 8×8 cell, then
 *    `stroke` at the mask=1 pixels (solid bar with lettering).
 */
export function drawGlyph1bpp(
  buf: Uint8Array,
  width: number,
  height: number,
  px: number,
  py: number,
  code: number,
  stroke: number,
  bg: number,
  inverse: boolean,
  glyphs: number[][],
): void {
  const glyph = glyphs[code];
  if (!glyph) return;
  for (let row = 0; row < CELL; row++) {
    const y = py + row;
    if (y < 0 || y >= height) continue;
    const maskByte = glyph[row] ?? 0;
    for (let col = 0; col < CELL; col++) {
      const x = px + col;
      if (x < 0 || x >= width) continue;
      const on = (maskByte >> (7 - col)) & 1;
      if (inverse) {
        buf[y * width + x] = on ? stroke : bg;
      } else if (on) {
        buf[y * width + x] = stroke;
      }
    }
  }
}
