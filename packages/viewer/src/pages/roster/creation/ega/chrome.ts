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
