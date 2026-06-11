/**
 * composeOptionsStrip — the in-dungeon "PARTY OPTIONS" bottom-strip overlay.
 *
 * Renders the 160×40 (= 20×5 cells, 8px each) bottom-left strip the engine
 * paints over the maze frame when the player presses RETURN for the command
 * menu (game_state stays 5; only this strip changes). Output is a palette-INDEX
 * buffer of size OPTIONS_STRIP.w × OPTIONS_STRIP.h — BYTE-EXACT against the
 * engine fixtures (tools/parity/fixtures/engine/options-menu-*.idx.gz), gated by
 * options-strip-parity.test.ts.
 *
 * Layout (verified against the fixtures, palette indices):
 *  - Strip background = gray (palette 8).
 *  - Right-edge column (x=159) = black (palette 0) on every row — the maze
 *    panel's vertical divider that the strip preserves.
 *  - Header window (top cell row, y-local 0..7): the row's top/bottom pixel rows
 *    (y-local 0 and 7) are full-width black (the window border); "PARTY OPTIONS"
 *    text drawn at cell (col3, row0) as COLORED TEXT — wfont0 (1bpp) mask, stroke
 *    = palette 9, transparent bg (gray shows through).
 *  - Command grid (3 cols × 3 rows): each label drawn at its OPTIONS_CELL_AT
 *    origin. Normal commands = wfont3 (4bpp), fg=1 (white) baked on gray-8 bg.
 *    The cursor cell = INVERSE highlight — wfont0 mask filling the label's cells
 *    with palette 5 (yellow) bg and palette 0 (black) strokes.
 *
 * NOTE on OPTIONS_HILITE.coloredText: corrected to `false` (inverse) in @wiz6/data
 * alongside this composer — the fixtures show the cursor cell rendered INVERSE
 * (black strokes on a yellow bar), NOT colored text (yellow letters on black).
 *
 * Spec: docs/superpowers/specs/2026-06-10-options-menu-shell-design.md
 */

import {
  OPTIONS_STRIP,
  OPTIONS_LABELS,
  OPTIONS_COMMANDS,
  OPTIONS_HEADER,
  OPTIONS_HEADER_AT,
  OPTIONS_CELL_AT,
  OPTIONS_HEADER_PALETTE,
  OPTIONS_HILITE,
} from '@wiz6/data';
import wfont0Json from '../../data/wfont0.json' with { type: 'json' };
import wfont3Json from '../../data/wfont3.json' with { type: 'json' };

const STRIP_W = OPTIONS_STRIP.w;
const STRIP_H = OPTIONS_STRIP.h;
const CELL = 8;

/** Palette indices used by the strip. */
const BG_GRAY = 8;
const BLACK = 0;

/** wfont0: 1bpp text mask (highlight path). Each glyph is 8 bytes, MSB-first. */
const WFONT0 = wfont0Json as { glyphs: number[][] };
/** wfont3: 4bpp EGA-planar UI font. Each glyph is 32 bytes (8 rows × 4 planes). */
const WFONT3 = wfont3Json as { glyphs: number[][] };

/** Draw a wfont3 (4bpp) glyph into `buf` at strip-local pixel (px,py). The
 *  4-bit file pixel value IS the palette index the engine writes to VRAM, so we
 *  write it directly (no override). Pixels outside the strip are clipped. */
function drawGlyph4bpp(buf: Uint8Array, px: number, py: number, code: number): void {
  const glyph = WFONT3.glyphs[code];
  if (!glyph) return;
  for (let row = 0; row < CELL; row++) {
    const y = py + row;
    if (y < 0 || y >= STRIP_H) continue;
    const pG = glyph[row] ?? 0;
    const pB = glyph[8 + row] ?? 0;
    const pR = glyph[16 + row] ?? 0;
    const pI = glyph[24 + row] ?? 0;
    for (let col = 0; col < CELL; col++) {
      const x = px + col;
      if (x < 0 || x >= STRIP_W) continue;
      const bit = 7 - col;
      const fileIdx =
        ((pG >> bit) & 1) |
        (((pB >> bit) & 1) << 1) |
        (((pR >> bit) & 1) << 2) |
        (((pI >> bit) & 1) << 3);
      buf[y * STRIP_W + x] = fileIdx;
    }
  }
}

/**
 * Draw a wfont0 (1bpp) glyph mask into `buf` at strip-local pixel (px,py).
 *  - colored (inverse=false): write `stroke` at mask=1 pixels; leave mask=0
 *    pixels untouched (transparent — the underlying fill shows through).
 *  - inverse (inverse=true): write `bg` at every pixel of the 8×8 cell, then
 *    `stroke` (black) at the mask=1 pixels.
 */
function drawGlyph1bpp(
  buf: Uint8Array,
  px: number,
  py: number,
  code: number,
  stroke: number,
  bg: number,
  inverse: boolean,
): void {
  const glyph = WFONT0.glyphs[code];
  if (!glyph) return;
  for (let row = 0; row < CELL; row++) {
    const y = py + row;
    if (y < 0 || y >= STRIP_H) continue;
    const maskByte = glyph[row] ?? 0;
    for (let col = 0; col < CELL; col++) {
      const x = px + col;
      if (x < 0 || x >= STRIP_W) continue;
      const on = (maskByte >> (7 - col)) & 1;
      if (inverse) {
        buf[y * STRIP_W + x] = on ? stroke : bg;
      } else if (on) {
        buf[y * STRIP_W + x] = stroke;
      }
    }
  }
}

/**
 * Compose the PARTY OPTIONS bottom strip as a palette-index buffer.
 *
 * @param cursorIndex Index (0..8, column-major: col*3+row) of the highlighted
 *                    command cell.
 * @param _opts       Reserved for signature stability (blink phase). The cursor
 *                    highlight does not blink (OPTIONS_HILITE.blinks=false), so
 *                    `phase` is currently unused.
 */
export function composeOptionsStrip(
  cursorIndex: number,
  _opts?: { phase?: number },
): Uint8Array {
  const buf = new Uint8Array(STRIP_W * STRIP_H);
  // 1. Gray background fill.
  buf.fill(BG_GRAY);

  // 2. Header window top/bottom border: full-width black at the top cell row's
  //    first (y-local 0) and last (y-local 7) pixel rows.
  for (let x = 0; x < STRIP_W; x++) {
    buf[0 * STRIP_W + x] = BLACK;
    buf[(CELL - 1) * STRIP_W + x] = BLACK;
  }

  // 3. Right-edge vertical divider: black on every row.
  for (let y = 0; y < STRIP_H; y++) buf[y * STRIP_W + (STRIP_W - 1)] = BLACK;

  // 4. Header text — colored text (wfont0 mask), stroke = palette 9, gray bg
  //    shows through. Screen coords → strip-local.
  {
    const hx = OPTIONS_HEADER_AT.x - OPTIONS_STRIP.x;
    // The header glyphs occupy the full top cell row (y-local 0..7); the data
    // constant's y is approximate (mid-cell). Snap to the cell row.
    const hy = 0;
    for (let i = 0; i < OPTIONS_HEADER.length; i++) {
      drawGlyph1bpp(buf, hx + i * CELL, hy, OPTIONS_HEADER.charCodeAt(i), OPTIONS_HEADER_PALETTE, BG_GRAY, false);
    }
  }

  // 5. Command labels.
  for (let i = 0; i < OPTIONS_COMMANDS.length; i++) {
    const cmd = OPTIONS_COMMANDS[i]!;
    const label = OPTIONS_LABELS[cmd];
    const at = OPTIONS_CELL_AT[i]!;
    const lx = at.x - OPTIONS_STRIP.x;
    const ly = at.y - OPTIONS_STRIP.y;
    if (i === cursorIndex) {
      // Cursor cell: INVERSE highlight (yellow bar, black strokes).
      for (let c = 0; c < label.length; c++) {
        drawGlyph1bpp(buf, lx + c * CELL, ly, label.charCodeAt(c), BLACK, OPTIONS_HILITE.paletteIndex, true);
      }
    } else {
      // Normal: wfont3 4bpp (fg=1 white baked on gray bg).
      for (let c = 0; c < label.length; c++) {
        drawGlyph4bpp(buf, lx + c * CELL, ly, label.charCodeAt(c));
      }
    }
  }
  return buf;
}
