/**
 * composeReviewPicker — the in-dungeon "REVIEW WHO?" member picker bottom-strip overlay.
 *
 * Renders the 160×40 (= 20×5 cells, 8px each) bottom-left strip the engine paints over
 * the maze frame when the player chooses OPTIONS → REVIEW (game_state stays 5; only this
 * strip changes). Output is a palette-INDEX buffer of size REVIEW_STRIP.w × REVIEW_STRIP.h
 * — BYTE-EXACT against the engine fixtures (tools/parity/fixtures/engine/maze-review-who-*.idx.gz),
 * gated by review-picker-parity.test.ts.
 *
 * Layout (verified against the fixtures, palette indices):
 *  - Strip background = gray (palette 8); right-edge column (x=159) = black; the header
 *    cell-row top/bottom pixel rows are full-width black (window border) — same chrome as
 *    the OPTIONS strip.
 *  - "REVIEW WHO?" header drawn at REVIEW_HEADER_AT as COLORED TEXT (wfont0 1bpp mask,
 *    stroke = palette 9, transparent bg). EXIT label at REVIEW_EXIT_AT (header row).
 *  - Each non-null member name drawn at its panel slot (REVIEW_SLOT_AT[s]) — wfont3 (4bpp),
 *    fg=1 (white) baked on gray-8 bg.
 *  - The cursor cell (EXIT when cursor===-1, else slot `cursor`) = INVERSE highlight
 *    (wfont0 mask, palette-5 yellow bar, palette-0 black strokes) — same attr model as the
 *    OPTIONS menu.
 *
 * Spec: docs/superpowers/specs/2026-06-11-options-review-command-design.md
 */

import {
  REVIEW_STRIP,
  REVIEW_HEADER,
  REVIEW_HEADER_AT,
  REVIEW_EXIT_AT,
  REVIEW_SLOT_AT,
  REVIEW_HEADER_PALETTE,
  REVIEW_HILITE,
} from '@wiz6/data';
import wfont0Json from '../../data/wfont0.json' with { type: 'json' };
import wfont3Json from '../../data/wfont3.json' with { type: 'json' };

const STRIP_W = REVIEW_STRIP.w;
const STRIP_H = REVIEW_STRIP.h;
const CELL = 8;

const BG_GRAY = 8;
const BLACK = 0;

const EXIT_LABEL = 'EXIT';

/** wfont0: 1bpp text mask (highlight path). Each glyph is 8 bytes, MSB-first. */
const WFONT0 = wfont0Json as { glyphs: number[][] };
/** wfont3: 4bpp EGA-planar UI font. Each glyph is 32 bytes (8 rows × 4 planes). */
const WFONT3 = wfont3Json as { glyphs: number[][] };

/**
 * Draw a header/EXIT glyph as COLORED text using the wfont3 glyph SHAPE: wherever the
 * wfont3 4bpp glyph is a foreground (white, index 1) pixel, write `stroke`; bg shows
 * through. The engine draws the colored header from the wfont3 font (not wfont0) — they
 * agree on letters but the "?" differs by one pixel (wfont0 has an extra pixel at row 2),
 * which surfaced as the "REVIEW WHO?" parity diff at x98. Plane 0 (`glyph[row]`) is the
 * white/intensity plane that carries the glyph silhouette.
 */
function drawColoredFromWfont3(buf: Uint8Array, px: number, py: number, code: number, stroke: number): void {
  const glyph = WFONT3.glyphs[code];
  if (!glyph) return;
  for (let row = 0; row < CELL; row++) {
    const y = py + row;
    if (y < 0 || y >= STRIP_H) continue;
    const maskByte = glyph[row] ?? 0; // plane 0 = fg silhouette
    for (let col = 0; col < CELL; col++) {
      const x = px + col;
      if (x < 0 || x >= STRIP_W) continue;
      if ((maskByte >> (7 - col)) & 1) buf[y * STRIP_W + x] = stroke;
    }
  }
}

/** Draw a wfont3 (4bpp) glyph into `buf` at strip-local pixel (px,py). The 4-bit file
 *  pixel value IS the palette index the engine writes to VRAM, so write it directly. */
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
 *  - colored (inverse=false): write `stroke` at mask=1 pixels; leave mask=0 untouched.
 *  - inverse (inverse=true): write `bg` over the whole 8×8 cell, `stroke` at mask=1.
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

/** Draw a label as wfont3 (4bpp) normal text at strip-local (px,py). */
function drawTextNormal(buf: Uint8Array, px: number, py: number, text: string): void {
  for (let c = 0; c < text.length; c++) {
    drawGlyph4bpp(buf, px + c * CELL, py, text.charCodeAt(c));
  }
}

/** Draw a label as an INVERSE highlight (yellow bar, black strokes) at strip-local (px,py). */
function drawTextInverse(buf: Uint8Array, px: number, py: number, text: string): void {
  for (let c = 0; c < text.length; c++) {
    drawGlyph1bpp(buf, px + c * CELL, py, text.charCodeAt(c), BLACK, REVIEW_HILITE.paletteIndex, true);
  }
}

/**
 * Compose the REVIEW WHO? member picker bottom strip as a palette-index buffer.
 *
 * @param slotNames Per-slot member names (length 6, null = empty slot).
 * @param cursor    -1 = EXIT cell highlighted; 0..5 = the slot cell highlighted.
 */
export function composeReviewPicker(
  slotNames: ReadonlyArray<string | null>,
  cursor: number,
): Uint8Array {
  const buf = new Uint8Array(STRIP_W * STRIP_H);
  // 1. Gray background fill.
  buf.fill(BG_GRAY);

  // 2. Header cell-row top/bottom border: full-width black at y-local 0 and 7.
  for (let x = 0; x < STRIP_W; x++) {
    buf[0 * STRIP_W + x] = BLACK;
    buf[(CELL - 1) * STRIP_W + x] = BLACK;
  }

  // 3. Right-edge vertical divider: black on every row.
  for (let y = 0; y < STRIP_H; y++) buf[y * STRIP_W + (STRIP_W - 1)] = BLACK;

  // 4. Header text — colored text (wfont0 mask), stroke = palette 9, gray bg shows through.
  {
    const hx = REVIEW_HEADER_AT.x - REVIEW_STRIP.x;
    const hy = 0; // top cell row (header glyphs span y-local 0..7).
    for (let i = 0; i < REVIEW_HEADER.length; i++) {
      drawColoredFromWfont3(buf, hx + i * CELL, hy, REVIEW_HEADER.charCodeAt(i), REVIEW_HEADER_PALETTE);
    }
  }

  // 5. EXIT label (header row). Normal = colored palette-9 text (wfont0 mask, same as the
  //    header), NOT white wfont3 — verified against the m0/m1 fixtures. Highlighted = INVERSE.
  {
    const ex = REVIEW_EXIT_AT.x - REVIEW_STRIP.x;
    const ey = REVIEW_EXIT_AT.y - REVIEW_STRIP.y;
    if (cursor === -1) {
      drawTextInverse(buf, ex, ey, EXIT_LABEL);
    } else {
      for (let c = 0; c < EXIT_LABEL.length; c++) {
        drawColoredFromWfont3(buf, ex + c * CELL, ey, EXIT_LABEL.charCodeAt(c), REVIEW_HEADER_PALETTE);
      }
    }
  }

  // 6. Member names at their panel slots. Highlighted INVERSE when the cursor is on the slot.
  for (let s = 0; s < REVIEW_SLOT_AT.length; s++) {
    const name = slotNames[s];
    if (!name) continue;
    const at = REVIEW_SLOT_AT[s]!;
    const sx = at.x - REVIEW_STRIP.x;
    const sy = at.y - REVIEW_STRIP.y;
    if (cursor === s) drawTextInverse(buf, sx, sy, name);
    else drawTextNormal(buf, sx, sy, name);
  }

  return buf;
}
