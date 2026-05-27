/**
 * wpcmk window chrome renderer.
 *
 * Fills a TileWindow with the correct wpcmk chrome:
 *   - All cells: (char=0x00, attr=0x01) — wfont1 solid-black tile
 *   - Frame border chars (all attr=0x01, wfont1 gray-line tiles):
 *       top-left=0x01, horiz-top=0x02, top-right=0x03
 *       left-vert=0x04,              right-vert=0x05
 *       bottom-left=0x06, horiz-bot=0x07, bottom-right=0x08
 *
 * This matches the engine's ui_window_clear (fill 0x00/0x01) followed by
 * FUN_06af (wpcmk file 0x06af) which writes frame chars via FUN_0689.
 *
 * RE source: docs/re/findings/wpcmk-window-chrome.json (confidence: high)
 */

import { clearWindow } from '@wiz6/parser';
import type { TileWindow } from '@wiz6/parser';

// Chrome tile chars (all use wfont1, attr=0x01)
const CHROME_FILL_CHAR = 0x00; // solid black interior
const CHROME_ATTR = 0x01; // wfont1

const CHROME_CORNER_TL = 0x01; // top-left
const CHROME_HORIZ_TOP = 0x02; // top horizontal edge
const CHROME_CORNER_TR = 0x03; // top-right
const CHROME_VERT_LEFT = 0x04; // left vertical edge
const CHROME_VERT_RIGHT = 0x05; // right vertical edge
const CHROME_CORNER_BL = 0x06; // bottom-left
const CHROME_HORIZ_BOT = 0x07; // bottom horizontal edge
const CHROME_CORNER_BR = 0x08; // bottom-right

/** Write a single cell (char, attr) at (x, y). */
function writeCell(win: TileWindow, x: number, y: number, char: number, attr: number): void {
  const idx = (y * win.widthCells + x) * 2;
  win.cells[idx] = char & 0xff;
  win.cells[idx + 1] = attr & 0xff;
}

/**
 * Draw the CHARACTER MENU char-sheet frame template into the 40×20 `top`
 * window — a faithful port of the engine's `ui_draw_creation_screen_borders`
 * (wpcmk FUN_06af). The window must already be cleared to (0x00, 0x01).
 *
 * All cells use attr 0x01 (wfont1): the engine's `ui_put_styled_char_at`
 * writes only the char byte, inheriting the clear attr. Frame glyphs 0x01–0x10
 * are wfont1's box-drawing tiles. The template builds a left stat-panel
 * (cols 0–20) with a central divider at col 20 and a full-width rule at row 4.
 *
 * RE source: docs/re/findings/wpcmk-charmenu-toplayout.json (fun06af_operations).
 * Validated byte-exact against the engine top-window cell grid (save 1).
 */
export function drawCharSheetTemplate(win: TileWindow): void {
  const put = (x: number, y: number, ch: number) => writeCell(win, x, y, ch, 0x01);

  // Outer corners + edges
  put(0, 0, 0x01); put(39, 0, 0x03); put(0, 19, 0x06);
  for (let x = 1; x <= 38; x++) put(x, 0, 0x02);        // top edge
  for (let x = 1; x <= 19; x++) put(x, 19, 0x07);       // bottom edge (left panel)
  for (let y = 1; y <= 18; y++) put(0, y, 0x04);        // left edge
  for (let y = 1; y <= 5; y++) put(39, y, 0x05);        // right edge (rows 1–5)

  // Left-edge / right-edge T-junctions
  put(0, 4, 0x09); put(0, 13, 0x09); put(0, 15, 0x09); put(0, 17, 0x09);
  put(39, 4, 0x0a);

  // Bottom T-junctions + left-panel bottom-right corner (col 20)
  put(2, 19, 0x0b); put(10, 19, 0x0b); put(12, 19, 0x0b);
  put(20, 19, 0x08);

  // Full-width horizontal double-rule at row 4
  for (let x = 1; x <= 38; x++) put(x, 4, 0x0c);
  // Horizontal rule under the right header (cols 21–38, row 6)
  for (let x = 21; x <= 38; x++) put(x, 6, 0x07);

  // Central vertical divider at col 20
  put(20, 4, 0x0e); put(20, 5, 0x0d);
  for (let y = 7; y <= 18; y++) put(20, y, 0x05);
  put(20, 6, 0x15);
  put(20, 13, 0x0a); put(20, 15, 0x0a); put(20, 17, 0x0a);
  put(39, 6, 0x08);

  // Left stat-panel: horizontal rules at rows 13/15/17 (cols 1–19)
  for (let x = 1; x <= 19; x++) { put(x, 13, 0x0c); put(x, 15, 0x0c); put(x, 17, 0x0c); }
  // Stat-panel vertical rules at cols 2/10/12
  put(2, 13, 0x0e); put(10, 13, 0x0e); put(12, 13, 0x0e);
  for (let y = 14; y <= 18; y++) { put(2, y, 0x0d); put(10, y, 0x0d); put(12, y, 0x0d); }
  // Stat-panel cross junctions
  put(2, 15, 0x10); put(2, 17, 0x10); put(10, 15, 0x10);
  put(10, 17, 0x10); put(12, 15, 0x10); put(12, 17, 0x10);

  // Right-header status row (cols 21–38, row 5): cleared to GRAY (wfont3 space).
  // Engine `ui_clear_top_status_row()` — a label slot above the menuPanel.
  for (let x = 21; x <= 38; x++) writeCell(win, x, 5, 0x20, 0x03);
}

/**
 * Draw the wpcmk window chrome onto `win`.
 *
 * Overwrites ALL cells — call this before writing any per-screen text content.
 * After this call every cell has attr=0x01 (wfont1), interior cells have
 * char=0x00, and border cells have the appropriate frame tile char (0x01..0x08).
 *
 * For windows smaller than 2 cells in either dimension, the function degrades
 * gracefully:
 *   - 1×1: single cell gets the top-left corner char (0x01).
 *   - 1×N or N×1: corners are drawn, edge runs have zero-length range (no-op).
 */
export function drawWindowChrome(win: TileWindow): void {
  const w = win.widthCells;
  const h = win.heightCells;

  // 1. Fill entire window with (0x00, 0x01) — solid black tiles via wfont1.
  clearWindow(win, CHROME_FILL_CHAR, CHROME_ATTR);

  // 2. Draw top horizontal edge (cols 1..w-2, row 0)
  for (let x = 1; x < w - 1; x++) {
    writeCell(win, x, 0, CHROME_HORIZ_TOP, CHROME_ATTR);
  }

  // 3. Draw bottom horizontal edge (cols 1..w-2, last row)
  if (h > 1) {
    for (let x = 1; x < w - 1; x++) {
      writeCell(win, x, h - 1, CHROME_HORIZ_BOT, CHROME_ATTR);
    }
  }

  // 4. Draw left vertical edge (rows 1..h-2, col 0)
  for (let y = 1; y < h - 1; y++) {
    writeCell(win, 0, y, CHROME_VERT_LEFT, CHROME_ATTR);
  }

  // 5. Draw right vertical edge (rows 1..h-2, col w-1)
  if (w > 1) {
    for (let y = 1; y < h - 1; y++) {
      writeCell(win, w - 1, y, CHROME_VERT_RIGHT, CHROME_ATTR);
    }
  }

  // 6. Draw corners (written last so they always win over edge fill)
  writeCell(win, 0, 0, CHROME_CORNER_TL, CHROME_ATTR); // top-left
  if (w > 1) {
    writeCell(win, w - 1, 0, CHROME_CORNER_TR, CHROME_ATTR); // top-right
  }
  if (h > 1) {
    writeCell(win, 0, h - 1, CHROME_CORNER_BL, CHROME_ATTR); // bottom-left
    if (w > 1) {
      writeCell(win, w - 1, h - 1, CHROME_CORNER_BR, CHROME_ATTR); // bottom-right
    }
  }
}
