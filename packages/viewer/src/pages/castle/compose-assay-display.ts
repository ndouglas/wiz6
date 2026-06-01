/**
 * composeAssayDisplay — WPCVW ASSAY read-only item-inspect popup (state 0x11).
 *
 * After the player picks a carried item to ASSAY, the engine
 * (wpcvw_item_inspect_display @ wpcvw 0x7160) opens a 20×12 popup window at
 * (x=20, y=8, attr=0x19) OVER the character sheet and dumps the item's full
 * stat block, then waits for Enter. RE:
 * docs/re/findings/wpcvw-assay-action.json (#assay-display-function-and-window,
 * #assay-displayed-fields-and-labels, #assay-shows-name1-not-name2).
 *
 * This composer renders the popup + the bottom "PRESS ↵ TO EXIT" strip that
 * replaces the action menu. It OVERLAYS a frame composed by composeMainPanel
 * (the caller renders the char sheet first, then drops the action-menu strip and
 * paints these on top).
 *
 * Layout (all coordinates verified pixel-by-pixel against the committed
 * `assay-longsword` fixture):
 *
 *   Popup window (screenX=160, screenY=64, 20 cols × 12 rows):
 *     row 0   : top border (wfont1 chrome)
 *     row 1   : gray title band — item NAME (wfont3, centered) flanked by two
 *               wfont4 weapon-icon tiles
 *     row 2   : title-band bottom border (wfont1 chrome)
 *     row 3   : category label, centered (wfont0 colored, palette[1])
 *     rows 4-5: the two packed resistance/save header strings (per-char colors)
 *     row 6   : weaponType, centered (palette[2])      — weapons/missiles only
 *     rows 7-8: attack modes, left-aligned (palette[5]) — weapons/missiles only
 *     row 10  : "P/S" + equip-slot label + weight
 *     row 11  : bottom border (wfont1 chrome)
 *
 *   Bottom strip (40×5 @ y=160): "PRESS ↵ TO EXIT" centered (msg 0x456).
 *
 * Text rendering: the popup body text is the COLORED highlight path (attr =
 * palette_idx<<4, low nibble 0, invertHighlight=false → stroke = palette[idx]
 * on black). The name band uses wfont3 (attr 0x03) over the gray band, and the
 * weapon-flank icons use wfont4 (attr 0x04).
 */

import { createTileWindow, clearWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { AssayDescriptor } from '@wiz6/data';

const CELL_PX = 8;

// ── Popup window geometry (RE: x=0x14, y=8, w=0x14, h=0xc) ───────────────────
const POPUP_COL = 20;
const POPUP_ROW = 8;
const POPUP_W = 20;
const POPUP_H = 12;

// ── Fonts / attrs ────────────────────────────────────────────────────────────
const ATTR_CHROME = 0x01; // wfont1 (chrome border tiles)
const ATTR_NAME = 0x03; // wfont3 (title-band text — name + exit prompt)
const ATTR_ICON = 0x04; // wfont4 (weapon-flank icon glyph 0x02)
const WEAPON_ICON_CHAR = 0x02; // wfont4 glyph 0x02 = the small sword icon

// Highlight-path colored text: attr = palette_idx << 4 (low nibble 0).
const ATTR_CATEGORY = 0x10; // palette[1] white
const ATTR_RESIST_A = 0x60; // palette[6] (resistance header default)
const ATTR_RESIST_B = 0xb0; // palette[11] (save header / alt columns)
const ATTR_WEAPON_TYPE = 0x20; // palette[2]
const ATTR_ATTACK_MODE = 0x50; // palette[5] yellow
const ATTR_PS_LABEL = 0x60; // palette[6] "P"
const ATTR_PS_REST = 0xe0; // palette[14] "/S"
const ATTR_SLOT = 0x40; // palette[4] green — equip-slot label
const ATTR_WEIGHT = 0x90; // palette[9] — weight value

// ── Chrome glyph template (wfont1 codepoints, decoded from the fixture) ──────
const CHROME_TOP = [0x15, ...Array<number>(POPUP_W - 2).fill(0x07), 0x08]; // row 0
const CHROME_BAND_BOT = [0x24, ...Array<number>(POPUP_W - 2).fill(0x12), 0x13]; // row 2
const CHROME_BOTTOM = [0x0b, ...Array<number>(POPUP_W - 2).fill(0x07), 0x08]; // row 11
const BAND_FILL_CHAR = 0x1b; // wfont1 solid-gray tile (title-band background)
const BODY_FILL_CHAR = 0x00; // wfont1 solid-black tile (body interior background)
// Body rows 3..10 left-edge tiles (alternating decorative left border).
const BODY_LEFT_EDGE = [0x0d, 0x0d, 0x0f, 0x0d, 0x0f, 0x0d, 0x0f, 0x0d];
const BODY_RIGHT_EDGE = 0x05;

// ── Per-character colors for the two packed header rows ──────────────────────
// "HEDGHFLDFRM MF" — palette[6] except the 'F' at index 5 (palette[11]).
const HEADER1_COLORS = [6, 6, 6, 6, 6, 11, 6, 6, 6, 6, 6, 6, 6, 6];
// "FMPTRABPVBLSMN".
const HEADER2_COLORS = [6, 11, 11, 11, 11, 11, 11, 11, 6, 11, 6, 11, 11, 11];
const HEADER_COL = 3; // left-aligned header start column

// ── Bottom strip ("PRESS ↵ TO EXIT") ─────────────────────────────────────────
const BAR_W = 40;
const BAR_H = 5;
const BAR_Y = 20 * CELL_PX; // 160
const BAR_BG_ATTR = 0x03; // wfont3 gray strip
const EXIT_PROMPT = 'PRESS \x15 TO EXIT'; // \x15 = wfont3 return-arrow glyph
const EXIT_PROMPT_ROW = 1;
// wfont3 glyph 0x1e is the chrome bottom-border tile (gray + 1px black baseline).
const CHROME_BOTTOM_BORDER_CHAR = 0x1e;

export interface AssayDisplayView {
  descriptor: AssayDescriptor;
}

/** Set cell (col, row) to (char, attr), bypassing the cursor. */
function setCell(w: TileWindow, col: number, row: number, char: number, attr: number): void {
  const i = (row * w.widthCells + col) * 2;
  w.cells[i] = char & 0xff;
  w.cells[i + 1] = attr & 0xff;
}

/** Engine's centered-text x: x = 10 − floor((len+1)/2) (RE @ wpcvw 0x7382). */
function centeredCol(len: number): number {
  return 10 - Math.floor((len + 1) / 2);
}

function composePopup(d: AssayDescriptor): TileWindow {
  const w = createTileWindow({
    screenX: POPUP_COL * CELL_PX,
    screenY: POPUP_ROW * CELL_PX,
    widthCells: POPUP_W,
    heightCells: POPUP_H,
  });
  // Body text is COLORED highlight (stroke = palette[hi-nibble], black bg).
  w.invertHighlight = false;

  // ── Chrome scaffold ────────────────────────────────────────────────────────
  // Row 0: top border.
  CHROME_TOP.forEach((ch, c) => setCell(w, c, 0, ch, ATTR_CHROME));
  // Row 1: gray title band — fill with the gray tile, then place name + icons.
  for (let c = 0; c < POPUP_W; c++) setCell(w, c, 1, BAND_FILL_CHAR, ATTR_CHROME);
  setCell(w, 0, 1, 0x05, ATTR_CHROME); // left edge of the band
  setCell(w, 1, 1, WEAPON_ICON_CHAR, ATTR_ICON); // left weapon icon
  setCell(w, 18, 1, WEAPON_ICON_CHAR, ATTR_ICON); // right weapon icon
  // Row 2: title-band bottom border.
  CHROME_BAND_BOT.forEach((ch, c) => setCell(w, c, 2, ch, ATTR_CHROME));
  // Rows 3..10: black interior with the alternating left edge + right edge.
  for (let r = 3; r <= 10; r++) {
    for (let c = 0; c < POPUP_W; c++) setCell(w, c, r, BODY_FILL_CHAR, ATTR_CHROME);
    setCell(w, 0, r, BODY_LEFT_EDGE[r - 3]!, ATTR_CHROME);
    setCell(w, POPUP_W - 1, r, BODY_RIGHT_EDGE, ATTR_CHROME);
  }
  // Row 11: bottom border.
  CHROME_BOTTOM.forEach((ch, c) => setCell(w, c, 11, ch, ATTR_CHROME));

  // ── Title band: item name, centered (wfont3 over gray). ─────────────────────
  const name = d.name;
  setCursor(w, centeredCol(name.length), 1);
  puts(w, name, ATTR_NAME);

  // ── Row 3: category label, centered (colored white). ────────────────────────
  const cat = d.categoryLabel;
  setCursor(w, centeredCol(cat.length), 3);
  puts(w, cat, ATTR_CATEGORY);

  // ── Rows 4-5: packed resistance/save header strings (per-char colors). ──────
  drawHeaderRow(w, 4, d.resistanceHeaders[0], HEADER1_COLORS);
  drawHeaderRow(w, 5, d.resistanceHeaders[1], HEADER2_COLORS);

  // ── Row 6: weapon type, centered (weapons/missiles only). ───────────────────
  if (d.weaponType) {
    setCursor(w, centeredCol(d.weaponType.length), 6);
    puts(w, d.weaponType, ATTR_WEAPON_TYPE);
  }

  // ── Rows 7-8: attack modes, left-aligned at col 3 (weapons/missiles only). ──
  const modes = d.attackModes ?? [];
  for (let i = 0; i < Math.min(modes.length, 2); i++) {
    setCursor(w, HEADER_COL, 7 + i);
    puts(w, modes[i]!, ATTR_ATTACK_MODE);
  }

  // ── Row 10: "P/S" + equip-slot label + weight. ──────────────────────────────
  // "P" at col 1 (palette[6]), "/S" (palette[14]).
  setCursor(w, 1, 10);
  puts(w, 'P', ATTR_PS_LABEL);
  setCursor(w, 2, 10);
  puts(w, '/S', ATTR_PS_REST);
  // Equip-slot label at col 8 (palette[4] green).
  if (d.equipSlotLabel) {
    setCursor(w, 8, 10);
    puts(w, d.equipSlotLabel, ATTR_SLOT);
  }
  // Weight value, right-aligned to col 18 (palette[9]). LONGSWORD 5.0 → "5.0".
  const weightStr = d.weight.toFixed(1);
  setCursor(w, 19 - weightStr.length, 10);
  puts(w, weightStr, ATTR_WEIGHT);

  return w;
}

/** Draw a packed header string at row `r`, col HEADER_COL, coloring each
 *  printable char from the per-char palette table (space cells are skipped). */
function drawHeaderRow(w: TileWindow, r: number, text: string, colors: number[]): void {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === ' ') continue;
    const idx = colors[i] ?? colors[colors.length - 1] ?? 6;
    setCell(w, HEADER_COL + i, r, ch.charCodeAt(0), idx << 4);
  }
}

function composeExitBar(): TileWindow {
  const w = createTileWindow({
    screenX: 0,
    screenY: BAR_Y,
    widthCells: BAR_W,
    heightCells: BAR_H,
  });
  w.invertHighlight = false;
  clearWindow(w, 0x20, BAR_BG_ATTR);
  // Chrome bottom-border row (screen baseline at y=199).
  for (let cx = 0; cx < BAR_W; cx++) {
    setCell(w, cx, BAR_H - 1, CHROME_BOTTOM_BORDER_CHAR, BAR_BG_ATTR);
  }
  // "PRESS ↵ TO EXIT" centered (wfont3, gray strip).
  const startCol = Math.floor((BAR_W - EXIT_PROMPT.length) / 2);
  setCursor(w, startCol, EXIT_PROMPT_ROW);
  puts(w, EXIT_PROMPT, BAR_BG_ATTR);
  return w;
}

/**
 * Compose the ASSAY inspect-popup overlay windows (z-order, lowest first),
 * painted ON TOP of the character-view main panel and REPLACING the action
 * menu:
 *   1. bottom "PRESS ↵ TO EXIT" strip
 *   2. the 20×12 stat-block popup
 */
export function composeAssayDisplay(view: AssayDisplayView): TileWindow[] {
  return [composeExitBar(), composePopup(view.descriptor)];
}
