/**
 * composeSwagBag — WPCVW camp SWAG action (state 0x11): the per-character
 * "SWAG BAG" manager popup. RE: docs/re/findings/wpcvw-swag-action.json;
 * engine fixtures `swag-empty` + `swag-longsword`. All cell values below are
 * byte-exact from the engine popup struct (dump-cells.py --header
 * 0x14,0x10,0x14,4,0x19 on saves 5/6).
 *
 * Layout — 20×16 popup @ (col 20, row 4, attr 0x19):
 *   - row 0  : top border  [0x0e, 0x0c×18, 0x0a] attr 0x01
 *   - row 1  : gray title band (attr 0x03): "SWAG BAG" centered at col 6,
 *              flank bag-icon 0x64 (attr 0x04) at cols 2 + 17; edges 0x0d / 0x05
 *   - row 2  : band separator [0x21, 0x0c×16, 0x0e(col17), 0x0c, 0x0a]
 *   - rows 3..14: bag list. col 0 left-vert (0x0d, or 0x0f on rows 9/11/13);
 *              col 17 vertical divider 0x0d; col 19 right edge 0x05. For an
 *              OCCUPIED row: col 1 black margin 0x00, item NAME at col 2 (attr
 *              0x90) + pad (attr 0x10) to col 16, item icon at col 18 (attr
 *              0x04). For an EMPTY row: cols 1-16 black space (0x20 attr 0x00),
 *              col 18 gray space (0x20 attr 0x03).
 *   - row 15 : bottom border [0x0b, 0x07×16, 0x0b(col17), 0x07, 0x08]
 *
 * The 3-option ADD/REMOVE/DROP (+EXIT) menu replaces the action-menu strip
 * (40×5 @ y=160): dynamic (disabled options HIDDEN), column-major 2-row grid,
 * x_step 8, inverse-highlighted cursor.
 *
 * Overlays a `composeMainPanel` char sheet (caller renders that first).
 */

import { createTileWindow, clearWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';

const CELL_PX = 8;

// ── Popup geometry (RE: x=0x14, y=4, w=0x14, h=0x10) ─────────────────────────
const POPUP_COL = 20;
const POPUP_ROW = 4;
const POPUP_W = 20;
const POPUP_H = 16;

// ── Attrs / glyphs (byte-exact from the engine cells) ────────────────────────
const ATTR_CHROME = 0x01;  // wfont1 frame
const ATTR_BAND = 0x03;    // wfont3 title-band content
const ATTR_ICON = 0x04;    // wfont4 flank icon + per-item icon
const ATTR_NAME = 0x90;    // item-name chars (matches the inventory list)
const ATTR_PAD = 0x10;     // trailing pad after the name
const ATTR_STRIP = 0x03;   // gray space in col 18 on empty rows
const ATTR_BODY_FILL = 0x00; // black space in cols 1-16 on empty rows

const FLANK_ICON = 0x64;   // wfont4 bag icon flanking the title
const TITLE = 'SWAG BAG';
const DIVIDER_COL = 17;    // inner vertical divider
const ICON_COL = 18;       // per-item icon / gray strip
const RIGHT_EDGE_COL = 19;
const NAME_COL = 2;        // item names start at col 2
const MARGIN_COL = 1;      // black margin cell before an item name
const FIRST_ROW = 3;
const LAST_BODY_ROW = POPUP_H - 2; // 14

// ── Bottom menu strip (action-menu idiom) ────────────────────────────────────
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

/** A bag item: display name + the wfont4 icon glyph drawn in col 18. */
export interface SwagBagItem {
  name: string;
  icon: number;
}

/** A SWAG menu entry. `enabled` controls dynamic show/hide. */
export interface SwagMenuEntry {
  label: string;
  enabled: boolean;
}

export interface SwagBagView {
  /** Bag items in slot order (top → bottom). */
  bagItems: ReadonlyArray<SwagBagItem>;
  /** Menu entries [ADD, REMOVE, DROP, EXIT]; disabled ones are hidden. */
  menu: ReadonlyArray<SwagMenuEntry>;
  /** Cursor index into the VISIBLE (enabled) menu entries. */
  cursor: number;
}

function setCell(w: TileWindow, col: number, row: number, char: number, attr: number): void {
  const i = (row * w.widthCells + col) * 2;
  w.cells[i] = char & 0xff;
  w.cells[i + 1] = attr & 0xff;
}

function fillRow(w: TileWindow, row: number, char: number, attr: number): void {
  for (let c = 0; c < POPUP_W; c++) setCell(w, c, row, char, attr);
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
  setCell(w, 0, 0, 0x0e, ATTR_CHROME);
  for (let c = 1; c < POPUP_W - 1; c++) setCell(w, c, 0, 0x0c, ATTR_CHROME);
  setCell(w, POPUP_W - 1, 0, 0x0a, ATTR_CHROME);

  // Row 1: gray title band (space-filled attr 0x03) + flank icons + title.
  fillRow(w, 1, 0x20, ATTR_BAND);
  setCell(w, 0, 1, 0x0d, ATTR_CHROME);
  setCell(w, 2, 1, FLANK_ICON, ATTR_ICON);
  setCell(w, 17, 1, FLANK_ICON, ATTR_ICON);
  setCell(w, RIGHT_EDGE_COL, 1, 0x05, ATTR_CHROME);
  setCursor(w, centeredCol(TITLE.length), 1);
  puts(w, TITLE, ATTR_BAND);

  // Row 2: band separator (T-junction left, divider-top at col 17, corner right).
  setCell(w, 0, 2, 0x21, ATTR_CHROME);
  for (let c = 1; c <= 16; c++) setCell(w, c, 2, 0x0c, ATTR_CHROME);
  setCell(w, DIVIDER_COL, 2, 0x0e, ATTR_CHROME);
  setCell(w, 18, 2, 0x0c, ATTR_CHROME);
  setCell(w, RIGHT_EDGE_COL, 2, 0x0a, ATTR_CHROME);

  // Rows 3..14: bag list.
  for (let r = FIRST_ROW; r <= LAST_BODY_ROW; r++) {
    const item = view.bagItems[r - FIRST_ROW];
    // Interior cols 1-16: black space by default (empty row).
    for (let c = 1; c <= 16; c++) setCell(w, c, r, 0x20, ATTR_BODY_FILL);
    // Left vertical edge: 0x0f on rows 9/11/13 (engine quirk), else 0x0d.
    setCell(w, 0, r, r === 9 || r === 11 || r === 13 ? 0x0f : 0x0d, ATTR_CHROME);
    setCell(w, DIVIDER_COL, r, 0x0d, ATTR_CHROME);
    setCell(w, RIGHT_EDGE_COL, r, 0x05, ATTR_CHROME);
    if (item) {
      setCell(w, MARGIN_COL, r, 0x00, ATTR_CHROME); // black margin
      setCursor(w, NAME_COL, r);
      puts(w, item.name, ATTR_NAME);
      // Pad the rest of the name field (after the name, up to col 16) at attr 0x10.
      for (let c = NAME_COL + item.name.length; c <= 16; c++) setCell(w, c, r, 0x20, ATTR_PAD);
      setCell(w, ICON_COL, r, item.icon, ATTR_ICON);
    } else {
      setCell(w, ICON_COL, r, 0x20, ATTR_STRIP); // gray strip
    }
  }

  // Row 15: bottom border (T-bottom at col 17).
  setCell(w, 0, POPUP_H - 1, 0x0b, ATTR_CHROME);
  for (let c = 1; c <= 16; c++) setCell(w, c, POPUP_H - 1, 0x07, ATTR_CHROME);
  setCell(w, DIVIDER_COL, POPUP_H - 1, 0x0b, ATTR_CHROME);
  setCell(w, 18, POPUP_H - 1, 0x07, ATTR_CHROME);
  setCell(w, RIGHT_EDGE_COL, POPUP_H - 1, 0x08, ATTR_CHROME);

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
