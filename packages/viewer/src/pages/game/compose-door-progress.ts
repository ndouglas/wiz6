/**
 * composeDoorProgress / composeDoorResult — the FORCE/PICK strain/tumble
 * progress bar and result-text overlay.
 *
 * Renders onto the same 160×40 bottom strip as the door menu
 * ({@link DOOR_MENU}.strip = {x:0,y:144,w:160,h:40}).
 *
 * Two exported functions:
 *  - composeDoorProgress(kind, filled, total): animation frame showing a bar
 *    of `filled` glyph-0x61 cells out of `total`, with a header line.
 *  - composeDoorResult(outcome): result frame with the outcome message
 *    centered on the strip.
 *
 * Both return a palette-index Uint8Array of size STRIP_W × STRIP_H (160×40).
 *
 * Strip chrome: gray fill (palette 8), black top/bottom border rows at
 * y-local 0 and 7 (first cell row border, same as door menu), black
 * right-edge column at x=159.
 *
 * ⚠️ LAYOUT IS PROVISIONAL — byte-exact engine pixel parity for the
 * strain/tumble bar and result frames is DEFERRED (tracked as TODO #089
 * / blocked by #090 stale-serialize path + test door triggering combat).
 * Positions (bar row at y-local ≈16, header at y-local 0) are sensible but
 * not pinned against a captured engine frame. Adjust when the pixel gate
 * lands.
 *
 * Spec: docs/superpowers/plans/ (feat/open-door-force-pick, #089).
 */

import { DOOR_MENU } from '@wiz6/data';
import wfont0Json from '../../data/wfont0.json' with { type: 'json' };
import wfont3Json from '../../data/wfont3.json' with { type: 'json' };
import { drawGlyph4bpp, drawGlyph1bpp } from './glyph-core.js';

const STRIP_W = DOOR_MENU.strip.w;   // 160
const STRIP_H = DOOR_MENU.strip.h;   // 40
const CELL = 8;

/** Palette indices. */
const BG_GRAY = 8;
const BLACK = 0;

/** Progress-bar glyph (engine draws char 0x61 = 'a' in attr 12 for the bar). */
const BAR_GLYPH = 0x61;
/** Palette index for the bar glyph (attr color 12 in the engine). */
const BAR_COLOR = 12;

/** wfont0: 1bpp text mask (highlight / colored-text path). */
const WFONT0 = wfont0Json as { glyphs: number[][] };
/** wfont3: 4bpp EGA-planar UI font (normal label path). */
const WFONT3 = wfont3Json as { glyphs: number[][] };

// ---------------------------------------------------------------------------
// Engine string constants (cited by indexedMessages id from msg.json)
// ---------------------------------------------------------------------------

/** Engine id 2112: "straining_press_~" — rendered as plain label. */
const STR_STRAINING = 'STRAINING';

/** Engine id 2111: "tumbling" */
const STR_TUMBLING = 'TUMBLING';

/** Engine id 2113: "success" */
const STR_SUCCESS = 'SUCCESS';

/** Engine id 2114: "^_failure_^" — decoration markers stripped */
const STR_FAILURE = 'FAILURE';

/** Engine id 2115: "^_jammed_^" — decoration markers stripped */
const STR_JAMMED = 'JAMMED';

// ---------------------------------------------------------------------------
// Shared chrome helper
// ---------------------------------------------------------------------------

/**
 * Draw the standard strip chrome into buf:
 *  - gray background fill
 *  - black top/bottom border on the first cell row (y-local 0 and 7)
 *  - black right-edge column at x=159
 */
function drawStripChrome(buf: Uint8Array): void {
  buf.fill(BG_GRAY);
  for (let x = 0; x < STRIP_W; x++) {
    buf[0 * STRIP_W + x] = BLACK;
    buf[(CELL - 1) * STRIP_W + x] = BLACK;
  }
  for (let y = 0; y < STRIP_H; y++) {
    buf[y * STRIP_W + (STRIP_W - 1)] = BLACK;
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DoorProgressKind = 'strain' | 'tumble';

// ---------------------------------------------------------------------------
// composeDoorProgress
// ---------------------------------------------------------------------------

/**
 * Compose a FORCE/PICK attempt progress-bar frame.
 *
 * @param kind    'strain' = FORCE attempt; 'tumble' = PICK attempt.
 * @param filled  Number of bar cells to fill (0..total inclusive).
 * @param total   Total bar cell width. Clamped to the number of cells that
 *                fit in the strip (max floor(STRIP_W / CELL) = 20).
 *
 * Layout (provisional — not pixel-gated, see file JSDoc):
 *  - Header text ("STRAINING" or "TUMBLING") at strip-local y=0 (first cell
 *    row), x=8, drawn as colored text via wfont0, stroke = DOOR_MENU.headerPalette.
 *  - Bar at y-local 16 (second cell row), x=8; filled cells use wfont3 4bpp
 *    glyph 0x61 in palette-index color 12; unfilled cells are gray background.
 */
export function composeDoorProgress(
  kind: DoorProgressKind,
  filled: number,
  total: number,
): Uint8Array {
  const buf = new Uint8Array(STRIP_W * STRIP_H);
  drawStripChrome(buf);

  const header = kind === 'strain' ? STR_STRAINING : STR_TUMBLING;

  // Header: colored text, wfont0 mask, stroke = headerPalette (9).
  // y-local 0 = first cell row (inside the border at row 1..6).
  const hx = 8;
  const hy = 0; // cell row y-local 0; glyphs render at rows 1..6 (border occupies row 0 and 7)
  for (let i = 0; i < header.length; i++) {
    drawGlyph1bpp(
      buf, STRIP_W, STRIP_H,
      hx + i * CELL, hy,
      header.charCodeAt(i),
      DOOR_MENU.headerPalette, BG_GRAY, false,
      WFONT0.glyphs,
    );
  }

  // Bar: glyph 0x61, wfont3 4bpp but with per-pixel color override.
  // Because drawGlyph4bpp writes the *file pixel value* (0..15) as the index,
  // and glyph 0x61 has a specific set of non-zero values, we instead draw via
  // drawGlyph1bpp using the wfont0 mask for the shape and BAR_COLOR as stroke.
  // This ensures all bar pixels land at palette index 12 regardless of what
  // the 4bpp plane encoding would produce.
  const bx = 8;
  const by = 16; // second cell row, y-local 16 (= screen y ≈ 160)
  const maxCells = Math.floor((STRIP_W - bx) / CELL);
  const clampedTotal = Math.min(total, maxCells);
  const clampedFilled = Math.min(filled, clampedTotal);

  for (let c = 0; c < clampedTotal; c++) {
    if (c < clampedFilled) {
      // Filled cell: draw the bar glyph with BAR_COLOR stroke.
      drawGlyph1bpp(
        buf, STRIP_W, STRIP_H,
        bx + c * CELL, by,
        BAR_GLYPH,
        BAR_COLOR, BG_GRAY, false,
        WFONT0.glyphs,
      );
    }
    // Unfilled cells remain as background gray — no draw needed.
  }

  return buf;
}

// ---------------------------------------------------------------------------
// composeDoorResult
// ---------------------------------------------------------------------------

/**
 * Compose a FORCE/PICK attempt result frame.
 *
 * @param outcome  'success' | 'failure' | 'jammed'
 *
 * Layout (provisional — not pixel-gated, see file JSDoc):
 *  - Result text centered horizontally on the strip, at y-local 16
 *    (second cell row), drawn as colored text via wfont0, stroke = headerPalette (9).
 */
export function composeDoorResult(
  outcome: 'success' | 'failure' | 'jammed',
): Uint8Array {
  const buf = new Uint8Array(STRIP_W * STRIP_H);
  drawStripChrome(buf);

  const text =
    outcome === 'success' ? STR_SUCCESS :
    outcome === 'failure' ? STR_FAILURE :
    STR_JAMMED;

  // Center horizontally: total text width = text.length * CELL pixels.
  const textW = text.length * CELL;
  const startX = Math.floor((STRIP_W - textW) / 2);
  const ty = 16; // y-local 16 (second cell row)

  for (let i = 0; i < text.length; i++) {
    drawGlyph1bpp(
      buf, STRIP_W, STRIP_H,
      startX + i * CELL, ty,
      text.charCodeAt(i),
      DOOR_MENU.headerPalette, BG_GRAY, false,
      WFONT0.glyphs,
    );
  }

  return buf;
}
