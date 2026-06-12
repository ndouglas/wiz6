/**
 * composeDoorMenu — the FORCE/PICK/EXIT door-action menu overlay.
 *
 * Renders the 160×40 (= 20×5 cells, 8px each) bottom-left strip the engine
 * paints over the maze frame when the player presses OPEN facing a locked door.
 * Output is a palette-INDEX buffer of size DOOR_MENU.strip.w × DOOR_MENU.strip.h —
 * BYTE-EXACT against the engine fixtures
 * (tools/parity/fixtures/engine/maze-door-menu-*.idx.gz), gated by
 * door-menu-parity.test.ts.
 *
 * Layout (verified against the fixtures, palette indices):
 *  - Strip background = gray (palette 8).
 *  - Right-edge column (x=159) = black (palette 0) on every row — the maze
 *    panel's vertical divider that the strip preserves.
 *  - Header window (top cell row, y-local 0..7): the row's top/bottom pixel rows
 *    (y-local 0 and 7) are full-width black (the window border); "PARTY OPTIONS"
 *    text drawn as COLORED TEXT — wfont0 (1bpp) mask, stroke = palette 9,
 *    transparent bg (gray shows through). Identical to composeOptionsStrip's header.
 *  - Three label cells at DOOR_MENU.cellAt (single row y=160): FORCE/PICK/EXIT.
 *    Normal labels = wfont3 (4bpp), fg=1 (white) baked on gray-8 bg.
 *    The cursor cell = INVERSE highlight — wfont0 mask, bg = palette 5 (yellow),
 *    stroke = palette 0 (black). No blink (DOOR_MENU.hilite.blinks=false).
 *
 * Cell origins pinned byte-exact against maze-door-menu-*.idx.gz on 2026-06-11:
 *  FORCE {x:8,y:160}, PICK {x:64,y:160}, EXIT {x:120,y:160}.
 *
 * Spec: docs/superpowers/plans/ (feat/open-door-force-pick, #089).
 */

import { DOOR_MENU } from '@wiz6/data';
import wfont0Json from '../../data/wfont0.json' with { type: 'json' };
import wfont3Json from '../../data/wfont3.json' with { type: 'json' };
import { drawGlyph4bpp, drawGlyph1bpp } from './glyph-core.js';

const STRIP_W = DOOR_MENU.strip.w;
const STRIP_H = DOOR_MENU.strip.h;
const CELL = 8;

/** Palette indices used by the strip. */
const BG_GRAY = 8;
const BLACK = 0;

/** wfont0: 1bpp text mask (highlight path). Each glyph is 8 bytes, MSB-first. */
const WFONT0 = wfont0Json as { glyphs: number[][] };
/** wfont3: 4bpp EGA-planar UI font. Each glyph is 32 bytes (8 rows × 4 planes). */
const WFONT3 = wfont3Json as { glyphs: number[][] };

/**
 * Compose the FORCE/PICK/EXIT door menu as a palette-index buffer.
 *
 * @param cursorIndex  0 = FORCE, 1 = PICK, 2 = EXIT.
 * @param _opts        Reserved for signature stability (blink phase). The cursor
 *                     highlight does not blink (DOOR_MENU.hilite.blinks=false),
 *                     so `phase` is currently unused.
 */
export function composeDoorMenu(
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
    const hx = DOOR_MENU.headerAt.x - DOOR_MENU.strip.x;
    // The header glyphs occupy the full top cell row (y-local 0..7); snap to cell row.
    const hy = 0;
    for (let i = 0; i < DOOR_MENU.header.length; i++) {
      drawGlyph1bpp(buf, STRIP_W, STRIP_H, hx + i * CELL, hy, DOOR_MENU.header.charCodeAt(i), DOOR_MENU.headerPalette, BG_GRAY, false, WFONT0.glyphs);
    }
  }

  // 5. Labels (single row: FORCE, PICK, EXIT).
  for (let i = 0; i < DOOR_MENU.labels.length; i++) {
    const label = DOOR_MENU.labels[i]!;
    const at = DOOR_MENU.cellAt[i]!;
    const lx = at.x - DOOR_MENU.strip.x;
    const ly = at.y - DOOR_MENU.strip.y;
    if (i === cursorIndex) {
      // Cursor cell: INVERSE highlight (yellow bar, black strokes).
      for (let c = 0; c < label.length; c++) {
        drawGlyph1bpp(buf, STRIP_W, STRIP_H, lx + c * CELL, ly, label.charCodeAt(c), BLACK, DOOR_MENU.hilite.paletteIndex, true, WFONT0.glyphs);
      }
    } else {
      // Normal: wfont3 4bpp (fg=1 white baked on gray bg).
      for (let c = 0; c < label.length; c++) {
        drawGlyph4bpp(buf, STRIP_W, STRIP_H, lx + c * CELL, ly, label.charCodeAt(c), WFONT3.glyphs);
      }
    }
  }
  return buf;
}
