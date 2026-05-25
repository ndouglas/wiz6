import type { Font4bpp, Palette } from '@wiz6/data';

/**
 * Render a tile sequence using a 4bpp 8×8 EGA-planar font (wfont1..4)
 * into an existing RGBA destination buffer.
 *
 * IMPORTANT: wfont files are TILE SPRITESHEETS, not glyph fonts with a
 * separable color attribute. Every pixel in each 8×8 tile is FULLY
 * DEFINED — there is no transparency, no separate "fg" or "bg" color
 * attribute. Each tile slot is a complete picture.
 *
 * Each tile is 32 bytes — 8 bytes per row × 4 EGA planes (G, B, R, I),
 * MSB-first within each plane byte. Same encoding as a `.pic` cell.
 *
 * The 4-bit file pixel value IS the framebuffer color attribute the
 * engine writes to VRAM. Under the active AC palette + DAC chain, that
 * attribute resolves to a final RGB triple. Pass a `palette` whose
 * `colors[i]` is the AC->DAC result for color attribute i (i.e.
 * `WIZ6_MAIN`); we look up `palette.colors[fileIdx]` directly. File
 * value 0 → palette[0] (typically black), NOT transparent. All 64
 * pixels of the tile are written.
 *
 * Cursor advances 8 pixels per tile — no kerning or proportional
 * spacing, matching the engine's fixed-cell text layout.
 *
 * `fileColorOverride` is a per-tile escape hatch for the rare cases
 * where the port needs to remap a specific file-color to a different
 * palette index. Most callers should pass `{}` and let the tile's
 * baked-in colors render as-is.
 */
export function renderTextRun4bpp(
  destRgba: Uint8ClampedArray,
  destW: number,
  destH: number,
  dstX: number,
  dstY: number,
  text: string,
  font: Font4bpp,
  palette: Palette,
  /** Optional per-file-color override map. Keys are file-pixel values
   *  (0..15); values are palette indices to use INSTEAD of the
   *  default EGA permutation result. Used to remap wfont3's baked-in
   *  letter color (file 1) to e.g. light gray instead of white. */
  fileColorOverride: Readonly<Partial<Record<number, number>>> = {},
): void {
  let cursorX = dstX;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const glyph = font.glyphs[code];
    if (!glyph) {
      cursorX += 8;
      continue;
    }
    for (let row = 0; row < 8; row++) {
      const py = dstY + row;
      if (py < 0 || py >= destH) continue;
      const pG = glyph[row] ?? 0;
      const pB = glyph[8 + row] ?? 0;
      const pR = glyph[16 + row] ?? 0;
      const pI = glyph[24 + row] ?? 0;
      for (let col = 0; col < 8; col++) {
        const bit = 7 - col;
        const fileIdx =
          ((pG >> bit) & 1) |
          (((pB >> bit) & 1) << 1) |
          (((pR >> bit) & 1) << 2) |
          (((pI >> bit) & 1) << 3);
        const px = cursorX + col;
        if (px < 0 || px >= destW) continue;
        const overrideIdx = fileColorOverride[fileIdx];
        const paletteIdx = overrideIdx !== undefined ? overrideIdx : fileIdx;
        const color = palette.colors[paletteIdx];
        if (!color) continue;
        const idx = (py * destW + px) * 4;
        destRgba[idx] = color[0]!;
        destRgba[idx + 1] = color[1]!;
        destRgba[idx + 2] = color[2]!;
        destRgba[idx + 3] = 0xff;
      }
    }
    cursorX += 8;
  }
}
