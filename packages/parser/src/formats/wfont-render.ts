import type { Font, Palette } from '@wiz6/data';

/**
 * Render an ASCII string using a 1bpp 8×8 font (wfont0-style) into an
 * existing RGBA destination buffer.
 *
 * Each glyph is 8 bytes — one byte per row, MSB-first within the byte
 * (bit 7 = leftmost pixel). A set bit emits a foreground pixel; a clear
 * bit either emits the background color or is left transparent.
 *
 * The engine's `ui_window_puts` (wroot 0x251D) renders text via this
 * mechanism, taking a window handle and an attribute byte. The attribute
 * selects an EGA palette index for the foreground; we expose that as
 * `fgIndex` here. Pass `bgIndex` to fill cleared bits with a color, or
 * leave it `null` for transparent backgrounds (the engine treats text
 * as overlaid on the existing window content — clear bits are
 * transparent unless explicitly filled).
 *
 * Destination is clipped to (destW, destH) — off-canvas pixels are
 * silently dropped. The cursor advances 8 pixels per character; there
 * is no kerning or proportional spacing in wfont0.
 */
export function renderTextRun(
  destRgba: Uint8ClampedArray,
  destW: number,
  destH: number,
  dstX: number,
  dstY: number,
  text: string,
  font: Font,
  fgIndex: number,
  palette: Palette,
  bgIndex: number | null = null,
): void {
  const fg = palette.colors[fgIndex] ?? palette.colors[15] ?? [0xff, 0xff, 0xff];
  const bg = bgIndex !== null ? palette.colors[bgIndex] : null;
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
      const byte = glyph[row] ?? 0;
      for (let col = 0; col < 8; col++) {
        const px = cursorX + col;
        if (px < 0 || px >= destW) continue;
        const bit = (byte >> (7 - col)) & 1;
        const color = bit ? fg : bg;
        if (!color) continue; // transparent background
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

/**
 * Measure the rendered width of a string with a fixed-width font.
 * Returns the pixel count cursor would advance after rendering `text`.
 */
export function measureTextRun(text: string, _font: Font): number {
  return text.length * 8;
}
