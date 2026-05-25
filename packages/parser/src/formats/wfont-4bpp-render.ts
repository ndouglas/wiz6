import type { Font4bpp, Palette } from '@wiz6/data';
import { EGA_FILE_INDEX_PERMUTATION } from './ega-permutation.js';

/**
 * Render an ASCII string using a 4bpp 8×8 EGA-planar font (wfont1..4)
 * into an existing RGBA destination buffer.
 *
 * Each glyph is 32 bytes — 8 bytes per row × 4 EGA planes (G, B, R, I),
 * MSB-first within each plane byte. This is the same encoding as a
 * single `.pic` cell, so the per-pixel color decode mirrors
 * `compositePicDescriptor`.
 *
 * File pixel value 0 (no plane bits set) is treated as transparent —
 * the destination is left untouched. All other file values get
 * permuted via `EGA_FILE_INDEX_PERMUTATION` (the same convention
 * `.pic` and `.ega` use) and rendered through the supplied palette.
 *
 * Cursor advances 8 pixels per character — no kerning or proportional
 * spacing, matching the engine's fixed-width text layout.
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
        if (fileIdx === 0 && !(0 in fileColorOverride)) continue; // transparent
        const px = cursorX + col;
        if (px < 0 || px >= destW) continue;
        const overrideIdx = fileColorOverride[fileIdx];
        const egaIdx = overrideIdx !== undefined ? overrideIdx : EGA_FILE_INDEX_PERMUTATION[fileIdx]!;
        const color = palette.colors[egaIdx];
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
