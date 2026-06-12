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
import { drawGlyph4bpp, drawGlyph1bpp } from './glyph-core.js';

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

/** Draw a label as wfont3 (4bpp) normal text at strip-local (px,py). */
function drawTextNormal(buf: Uint8Array, px: number, py: number, text: string): void {
  for (let c = 0; c < text.length; c++) {
    drawGlyph4bpp(buf, STRIP_W, STRIP_H, px + c * CELL, py, text.charCodeAt(c), WFONT3.glyphs);
  }
}

/** Draw a label as an INVERSE highlight (yellow bar, black strokes) at strip-local (px,py). */
function drawTextInverse(buf: Uint8Array, px: number, py: number, text: string): void {
  for (let c = 0; c < text.length; c++) {
    drawGlyph1bpp(buf, STRIP_W, STRIP_H, px + c * CELL, py, text.charCodeAt(c), BLACK, REVIEW_HILITE.paletteIndex, true, WFONT0.glyphs);
  }
}

/**
 * Optional chrome overrides for composeReviewPicker. Defaults preserve the
 * REVIEW WHO? layout exactly (byte-identical to the existing REVIEW fixtures).
 */
export interface ReviewPickerChrome {
  /** Header string. Default: REVIEW_HEADER ('REVIEW WHO?') */
  header?: string;
  /** Header screen-px origin. Default: REVIEW_HEADER_AT */
  headerAt?: { x: number; y: number };
  /** EXIT label screen-px origin. Default: REVIEW_EXIT_AT */
  exitAt?: { x: number; y: number };
}

/**
 * Compose the REVIEW WHO? (or WHO WILL TRY?) member picker bottom strip as a
 * palette-index buffer.
 *
 * @param slotNames Per-slot member names (length 6, null = empty slot).
 * @param cursor    -1 = EXIT cell highlighted; 0..5 = the slot cell highlighted.
 * @param chrome    Optional layout overrides (header string/position, EXIT position).
 *                  Defaults reproduce the REVIEW WHO? chrome exactly.
 */
export function composeReviewPicker(
  slotNames: ReadonlyArray<string | null>,
  cursor: number,
  chrome?: ReviewPickerChrome,
): Uint8Array {
  // Resolve chrome overrides, falling back to REVIEW WHO? defaults.
  const headerStr = chrome?.header ?? REVIEW_HEADER;
  const headerAt = chrome?.headerAt ?? REVIEW_HEADER_AT;
  const exitAt = chrome?.exitAt ?? REVIEW_EXIT_AT;

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

  // 4. Header text — colored text (wfont3 silhouette), stroke = palette 9, gray bg shows through.
  {
    const hx = headerAt.x - REVIEW_STRIP.x;
    const hy = 0; // top cell row (header glyphs span y-local 0..7).
    for (let i = 0; i < headerStr.length; i++) {
      drawColoredFromWfont3(buf, hx + i * CELL, hy, headerStr.charCodeAt(i), REVIEW_HEADER_PALETTE);
    }
  }

  // 5. EXIT label (header row). Normal = colored palette-9 text (wfont3 silhouette, same as the
  //    header), NOT white wfont3 — verified against the m0/m1 fixtures. Highlighted = INVERSE.
  {
    const ex = exitAt.x - REVIEW_STRIP.x;
    const ey = exitAt.y - REVIEW_STRIP.y;
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
