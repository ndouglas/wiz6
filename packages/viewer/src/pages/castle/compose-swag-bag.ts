/**
 * composeSwagBag — WPCVW camp SWAG action (state 0x11): the per-character
 * "SWAG BAG" manager popup. RE: docs/re/findings/wpcvw-swag-action.json;
 * engine fixtures `swag-empty` + `swag-longsword`.
 *
 * Layout (pixel-verified vs the fixtures):
 *   - 20×16 popup @ (col 20, row 4, attr 0x19) — the same window family as
 *     ASSAY/SKILL. Row 0 top border; row 1 gray title band ("SWAG BAG" centered,
 *     flank bag-icon tiles); row 2 band-bottom border; rows 3..13 the bag item
 *     list (name per row) + a right-edge scrollbar; rows 14/15 footer/bottom.
 *   - The 3-option ADD/REMOVE/DROP menu (+ EXIT) replaces the action-menu strip
 *     (40×5 @ y=160): dynamic — disabled options are HIDDEN; column-major 2-row
 *     grid, x_step 8, inverse-highlighted cursor.
 *
 * Overlays a `composeMainPanel` char sheet (caller renders that first).
 */

import { createTileWindow, clearWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';

const CELL_PX = 8;

// ── Popup window geometry (RE: x=0x14, y=4, w=0x14, h=0x10) ──────────────────
const POPUP_COL = 20;
const POPUP_ROW = 4;
const POPUP_W = 20;
const POPUP_H = 16;

// ── Fonts / attrs (shared with the ASSAY popup, same window family) ──────────
const ATTR_CHROME = 0x01; // wfont1 chrome
const ATTR_TITLE = 0x03;  // wfont3 title text on the gray band
const ATTR_ICON = 0x04;   // wfont4 flank icon
const ATTR_NAME = 0x90;   // palette[9] item-name chars (matches the inventory list)
const BAG_ICON_CHAR = 0x06; // wfont4 glyph for the SWAG bag flank icon

// Chrome glyph templates (wfont1 codepoints — same as compose-assay-display).
const CHROME_TOP = [0x15, ...Array<number>(POPUP_W - 2).fill(0x07), 0x08];
const CHROME_BAND_BOT = [0x24, ...Array<number>(POPUP_W - 2).fill(0x12), 0x13];
const CHROME_BOTTOM = [0x0b, ...Array<number>(POPUP_W - 2).fill(0x07), 0x08];
const BAND_FILL_CHAR = 0x1b; // gray title-band tile
const BODY_FILL_CHAR = 0x00; // black interior tile
const BODY_LEFT_EDGE = 0x0d;
const BODY_RIGHT_EDGE = 0x05;
// NOTE: the engine draws a right-edge SCROLLBAR here (wfont2 glyphs), not a plain
// border — but its exact glyphs/rows aren't yet pinned (a guess at 0x45/0x47/0x46
// @ attr 0x02 REDUCED parity, so the layout differs). Tracked as a WIP gap (#034
// Stage 2); needs the SWAG popup's exact cell layout.

const TITLE = 'SWAG BAG';
const NAME_COL = 1;       // item names start at popup col 1
const FIRST_ITEM_ROW = 3; // bag rows begin at popup row 3

// ── Bottom menu strip (same region/idiom as the action menu) ─────────────────
const STRIP_W = 40;
const STRIP_H = 5;
const STRIP_Y = 20 * CELL_PX; // 160
const ATTR_BG = 0x03;
const ATTR_HIGHLIGHT = 0x50;
const CHROME_BOTTOM_BORDER_CHAR = 0x1e;
const MENU_X_BASE = 2;
const MENU_Y_BASE = 1;
const MENU_X_STEP = 8; // RE picker arg x_step=8
const MENU_ROWS = 2;

/** A SWAG menu entry. `enabled` controls dynamic show/hide. */
export interface SwagMenuEntry {
  label: string;
  enabled: boolean;
}

export interface SwagBagView {
  /** Bag item names in slot order (top → bottom). */
  bagNames: ReadonlyArray<string>;
  /** Menu entries in fixed order [ADD, REMOVE, DROP, EXIT]; disabled ones are
   *  hidden from the rendered (packed) grid. EXIT is always enabled. */
  menu: ReadonlyArray<SwagMenuEntry>;
  /** Cursor index into the VISIBLE (enabled) menu entries. */
  cursor: number;
}

function setCell(w: TileWindow, col: number, row: number, char: number, attr: number): void {
  const i = (row * w.widthCells + col) * 2;
  w.cells[i] = char & 0xff;
  w.cells[i + 1] = attr & 0xff;
}

/** Engine's centered-text x within the 20-wide popup: 10 − floor((len+1)/2). */
function centeredCol(len: number): number {
  return 10 - Math.floor((len + 1) / 2);
}

function composePopup(view: SwagBagView): TileWindow {
  const w = createTileWindow({
    screenX: POPUP_COL * CELL_PX,
    screenY: POPUP_ROW * CELL_PX,
    widthCells: POPUP_W,
    heightCells: POPUP_H,
  });
  w.invertHighlight = false;

  // Row 0: top border.
  CHROME_TOP.forEach((ch, c) => setCell(w, c, 0, ch, ATTR_CHROME));
  // Row 1: gray title band + flank icons + centered title.
  for (let c = 0; c < POPUP_W; c++) setCell(w, c, 1, BAND_FILL_CHAR, ATTR_CHROME);
  setCell(w, 0, 1, 0x05, ATTR_CHROME);
  setCell(w, 1, 1, BAG_ICON_CHAR, ATTR_ICON);
  setCell(w, POPUP_W - 2, 1, BAG_ICON_CHAR, ATTR_ICON);
  setCursor(w, centeredCol(TITLE.length), 1);
  puts(w, TITLE, ATTR_TITLE);
  // Row 2: band-bottom border.
  CHROME_BAND_BOT.forEach((ch, c) => setCell(w, c, 2, ch, ATTR_CHROME));
  // Rows 3..14: black interior with left edge + right-edge scrollbar.
  for (let r = FIRST_ITEM_ROW; r <= POPUP_H - 2; r++) {
    for (let c = 0; c < POPUP_W; c++) setCell(w, c, r, BODY_FILL_CHAR, ATTR_CHROME);
    setCell(w, 0, r, BODY_LEFT_EDGE, ATTR_CHROME);
    setCell(w, POPUP_W - 1, r, BODY_RIGHT_EDGE, ATTR_CHROME);
  }
  // Row 15: bottom border.
  CHROME_BOTTOM.forEach((ch, c) => setCell(w, c, POPUP_H - 1, ch, ATTR_CHROME));

  // Bag item rows.
  for (let i = 0; i < view.bagNames.length; i++) {
    const r = FIRST_ITEM_ROW + i;
    if (r > POPUP_H - 2) break;
    setCursor(w, NAME_COL, r);
    puts(w, view.bagNames[i]!, ATTR_NAME);
  }

  return w;
}

function composeMenuStrip(view: SwagBagView): TileWindow {
  const w = createTileWindow({ screenX: 0, screenY: STRIP_Y, widthCells: STRIP_W, heightCells: STRIP_H });
  w.invertHighlight = true;
  clearWindow(w, 0x20, ATTR_BG);
  for (let cx = 0; cx < STRIP_W; cx++) {
    const idx = ((STRIP_H - 1) * STRIP_W + cx) * 2;
    w.cells[idx] = CHROME_BOTTOM_BORDER_CHAR;
    w.cells[idx + 1] = ATTR_BG;
  }
  const visible = view.menu.filter((e) => e.enabled);
  for (let i = 0; i < visible.length; i++) {
    const { label } = visible[i]!;
    const col = Math.floor(i / MENU_ROWS);
    const row = i % MENU_ROWS;
    setCursor(w, MENU_X_BASE + col * MENU_X_STEP, MENU_Y_BASE + row);
    puts(w, label, i === view.cursor ? ATTR_HIGHLIGHT : ATTR_BG);
  }
  return w;
}

/**
 * Compose the SWAG BAG overlay windows (z-order, lowest first): the popup +
 * the dynamic ADD/REMOVE/DROP/EXIT menu strip. Painted over composeMainPanel.
 */
export function composeSwagBag(view: SwagBagView): TileWindow[] {
  return [composePopup(view), composeMenuStrip(view)];
}
