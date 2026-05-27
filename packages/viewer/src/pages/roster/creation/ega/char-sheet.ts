/**
 * drawCharSheet — populate the 40×20 wpcmk creation `top` window with the
 * character sheet CONTENT (labels + values), on top of the bare frame template
 * drawn by `drawCharSheetTemplate` (chrome.ts).
 *
 * This is a faithful port of three cooperating wpcmk routines:
 *   - ui_render_stat_panel        (wpcmk 0x2b04) — 8 attribute label+value rows,
 *                                   BONUS row, HP / STM cur/max triplets.
 *   - ui_redraw_character_sheet   (wpcmk 0x0df7) — dynamic LVL/RNK/EXP/MKS labels,
 *                                   class/rank title, left age values, 6 icon
 *                                   glyphs, 6 bottom-grid cur/max pairs.
 *   - ui_print_character_header   (wpcmk 0x0d52) — row-1 header: name + sex glyph
 *                                   + '-' + race name.
 *
 * Rendering substrate: the tile-window primitives (setCursor/puts). Every cell
 * is `(char, attr)`; the engine encodes the attr byte as `attrParam << 4` (high
 * nibble = bg color index, low nibble 0 = the highlight/1bpp render path).
 *
 * Numbers are RIGHT-aligned in a fixed field width, SPACE-padded (never zero-
 * padded): the cursor is set to the field's LEFT cell and the digits hug the
 * RIGHT edge.
 *
 * Source spec (per-cell positions/attrs/sources/widths):
 *   docs/re/findings/wpcmk-charsheet-fields.json
 *
 * Validated byte-exact against the engine `top` cell memory in
 *   tools/parity/fixtures/cells/race-select.json   (race not picked)
 *   tools/parity/fixtures/cells/class-select.json  (race=HUMAN, bonus=6)
 */

import { setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { DraftState } from '../state.js';
import {
  creationString,
  raceName,
  className,
  SEX_NAME_BASE,
} from '../messages.js';

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

/** The engine's attr-byte encoding: `attrParam << 4` (high nibble = bg color). */
function attrFor(attrParam: number): number {
  return (attrParam << 4) & 0xff;
}

/**
 * Write a single styled cell at (x, y) with `attrParam << 4`, then leave the
 * cursor advanced by 1 (mirrors the engine's putcell). Used for the '/'
 * separators and the wfont2 icon glyphs.
 */
function putCell(win: TileWindow, x: number, y: number, char: number, attr: number): void {
  setCursor(win, x, y);
  puts(win, String.fromCharCode(char), attr);
}

/**
 * Right-align a non-negative integer into `[x .. x+width-1]` on row `y`,
 * space-padding the leading cells. The whole field (pad + digits) is written
 * with attr `attrParam << 4`, matching FUN_0507's behaviour: it writes the
 * leading spaces AND the digits with the same attr.
 */
function putNumberRight(
  win: TileWindow,
  x: number,
  y: number,
  value: number,
  width: number,
  attrParam: number,
): void {
  const s = String(value);
  const text = s.length >= width ? s.slice(-width) : ' '.repeat(width - s.length) + s;
  setCursor(win, x, y);
  puts(win, text, attrFor(attrParam));
}

// ---------------------------------------------------------------------------
// Field-table constants (from wpcmk-charsheet-fields.json)
// ---------------------------------------------------------------------------

/** Attribute label msg IDs STR..KAR = 0xcc..0xd3. */
const ATTR_LABEL_BASE = 0xcc;
/** Attribute draft keys in STR..KAR order (matches DGROUP 0x559c byte array). */
const ATTR_KEYS = ['str', 'int', 'pie', 'vit', 'dex', 'spd', 'per', 'kar'] as const;

const MSG_LVL = 0xc8;
const MSG_RNK = 0xc9;
const MSG_EXP = 0xca;
const MSG_MKS = 0xcb;
const MSG_HP = 0xd4;
const MSG_STM = 0xd5;
const MSG_BONUS = 0x453;
/** Class/rank title base: msg(800 + class*10 + secondary). secondary=0. */
const CLASS_TITLE_BASE = 800;

/** wfont2 icon glyphs for the bottom-grid (chars 0x23..0x28), attr 0x02. */
const ICON_CHARS = [0x23, 0x24, 0x25, 0x26, 0x27, 0x28];
/** Per-grid-slot attrParam table (wroot DGROUP 0x0004 indexed): 4,2,3,6,7,5. */
const GRID_ATTR = [4, 2, 3, 6, 7, 5];

// ---------------------------------------------------------------------------
// drawCharSheet
// ---------------------------------------------------------------------------

/**
 * Fill the `top` window with the character-creation character sheet.
 * Mutates `top` in place. Call AFTER `createPersistentWindows()` (which has
 * already cleared `top` black and drawn the frame template).
 *
 * @param title  Optional screen title (e.g. "CHARACTER RACE", "PROFESSION")
 *               drawn centered into the status row (row 5, cols 21..38) by the
 *               engine's `ui_print_screen_title`. Passing it here keeps the
 *               char sheet self-contained for the per-screen callers.
 */
export function drawCharSheet(
  top: TileWindow,
  draft: DraftState,
  db: MessageDb,
  title?: string,
): void {
  drawHeader(top, draft, db);
  drawRedrawFields(top, draft, db);
  drawStatPanel(top, draft, db);
  if (title) drawStatusTitle(top, title);
}

/**
 * Center `title` in the status row (row 5, cols 21..38, an 18-cell field) at
 * attr 0x03 (wfont3). Mirrors `ui_print_screen_title`.
 */
function drawStatusTitle(top: TileWindow, title: string): void {
  const fieldStart = 21;
  const fieldWidth = 18;
  const len = Math.min(title.length, fieldWidth);
  const pad = (fieldWidth - len) >> 1;
  setCursor(top, fieldStart + pad, 5);
  puts(top, title.slice(0, len), 0x03);
}

// ---------------------------------------------------------------------------
// ui_print_character_header (wpcmk 0x0d52) — row-1 header
// ---------------------------------------------------------------------------

function drawHeader(top: TileWindow, draft: DraftState, db: MessageDb): void {
  // NAME at (4,1) attr 0x50, left-aligned. Empty name writes nothing (the
  // fixtures show a 1-char residual already present in engine memory; we
  // reproduce the draft.name content here).
  if (draft.name.length > 0) {
    setCursor(top, 4, 1);
    puts(top, draft.name, attrFor(5));
  }

  // Sex glyph + '-' + race name at (13,1), attr 0x10. Only present once a race
  // is picked (the header routine is re-run by the race picker). When race is
  // null (race-select screen) nothing is written here.
  if (draft.race !== null) {
    const sexIdx = draft.sex ?? 0;
    const sexGlyph = creationString(db, SEX_NAME_BASE + sexIdx);
    const race = raceName(db, draft.race);
    // The header writes a single sex glyph char, '-', then the race name.
    const text = `${sexGlyph.charAt(0)}-${race}`;
    setCursor(top, 13, 1);
    puts(top, text, attrFor(1));
  }

  // CLASS name at (13,2) attr 0x10 — only once a class is picked (the rank
  // TITLE at row 1 col 35 stays "NONE" at creation; this is the class name).
  if (draft.class !== null) {
    setCursor(top, 13, 2);
    puts(top, className(db, draft.class), attrFor(1));
  }
}

// ---------------------------------------------------------------------------
// ui_redraw_character_sheet (wpcmk 0x0df7) — dynamic labels + right column
// ---------------------------------------------------------------------------

function drawRedrawFields(top: TileWindow, draft: DraftState, db: MessageDb): void {
  // Top-left header strip: cols 1..3 of rows 1/2/3 cleared to gray (0x20,0x03);
  // col 4 carries the up/down arrow glyphs for the age field on rows 2/3
  // (chars 0x1e/0x1f at attr 0x50). The name occupies (4,1) — see drawHeader.
  for (const y of [1, 2, 3]) {
    setCursor(top, 1, y);
    puts(top, '   ', 0x03);
  }
  putCell(top, 4, 2, 0x1e, attrFor(5)); // up-arrow
  putCell(top, 4, 3, 0x1f, attrFor(5)); // down-arrow

  // Left-panel age values (col 5, width-3) — rows 2/3. Source is the age cache;
  // 0 during creation (unverified multi-digit width). attr 0xe (row2) / 0xc (row3).
  putNumberRight(top, 5, 2, 0, 3, 0xe);
  putNumberRight(top, 5, 3, 0, 3, 0xc);

  // RNK label (25,1) attr 0xb. LVL label (13,3) attr 0x8.
  // EXP label (25,2) attr 0xe. MKS label (25,3) attr 0xe.
  putLabel(top, 25, 1, creationString(db, MSG_RNK), 0xb);
  putLabel(top, 13, 3, creationString(db, MSG_LVL), 0x8);
  putLabel(top, 25, 2, creationString(db, MSG_EXP), 0xe);
  putLabel(top, 25, 3, creationString(db, MSG_MKS), 0xe);

  // Class/rank TITLE, right-aligned to col 39 (exclusive: ends at col 38).
  // msg(800 + class*10 + 0); "NONE" when no class picked (class*10 → 800).
  const classIdx = draft.class ?? 0;
  const title = creationString(db, CLASS_TITLE_BASE + classIdx * 10);
  if (title.length > 0) {
    setCursor(top, 39 - title.length, 1);
    puts(top, title, attrFor(3));
  }

  // LVL value (col 19, width-3 ending at 19) attr 0x9.
  putNumberRight(top, 17, 3, draft.derived.level ?? 0, 3, 0x9);

  // EXP value (row2) / MKS value (row3): right number ending at col 38.
  // Source 0 in both fixtures; width inferred. The fixtures show a lone '0' at
  // col 38 attr 0x6 with leading gray spaces at cols 29..38 (attr 0x6).
  putNumberRight(top, 29, 2, draft.derived.xp ?? 0, 10, 0x6);
  putNumberRight(top, 29, 3, 0, 10, 0x6);

  // 6 wfont2 icon glyphs at the bottom grid (left col x=1, right col x=11).
  drawIcons(top);

  // 6 bottom-grid cur/max pairs (school mana — 0 during creation).
  drawBottomGrid(top, draft);
}

/** Icon glyphs: chars 0x23..0x28 at attr 0x02 (wfont2). */
function drawIcons(top: TileWindow): void {
  // (1,14)(1,16)(1,18) left column ; (11,14)(11,16)(11,18) right column.
  const positions: [number, number][] = [
    [1, 14], [1, 16], [1, 18],
    [11, 14], [11, 16], [11, 18],
  ];
  for (let i = 0; i < 6; i++) {
    const [x, y] = positions[i]!;
    putCell(top, x, y, ICON_CHARS[i]!, 0x02);
  }
}

/**
 * The 6 bottom-grid cur/max number pairs. Left triplet (i=0,1,2) at rows
 * 14/16/18 cols 3..9; right triplet (i=3,4,5) at rows 14/16/18 cols 13..19.
 * Each pair: cur (width-3, right-aligned), '/' at the separator cell (attr 9),
 * max (width-3, right-aligned). All values 0 during creation.
 */
function drawBottomGrid(top: TileWindow, _draft: DraftState): void {
  const rows = [14, 16, 18];
  for (let i = 0; i < 6; i++) {
    const left = i < 3;
    const y = rows[i % 3]!;
    const attrParam = GRID_ATTR[i]!;
    const baseX = left ? 3 : 13; // cur field left edge
    // cur: width-3 right-aligned -> digit lands at baseX+2
    putNumberRight(top, baseX, y, 0, 3, attrParam);
    // '/' separator at baseX+3, attr 9
    putCell(top, baseX + 3, y, 0x2f, attrFor(9));
    // max: width-3 right-aligned starting baseX+4 -> digit at baseX+6
    putNumberRight(top, baseX + 4, y, 0, 3, attrParam);
  }
}

// ---------------------------------------------------------------------------
// ui_render_stat_panel (wpcmk 0x2b04) — attribute rows, BONUS, HP/STM
// ---------------------------------------------------------------------------

function drawStatPanel(top: TileWindow, draft: DraftState, db: MessageDb): void {
  // 8 attribute rows (i=0..7) at rows 5..12.
  for (let i = 0; i < 8; i++) {
    const y = 5 + i;
    putLabel(top, 1, y, creationString(db, ATTR_LABEL_BASE + i), 0x5);
    const value = draft.attributes[ATTR_KEYS[i]!];
    // value: width-2 right-aligned at cols 5..6, attr 0x1.
    putNumberRight(top, 5, y, value, 2, 0x1);
  }

  // HP: label at (10,5) attr 0x4 — msg 0xd4 is " HP" (leading space), so cols
  // 10..12 = " HP". cur at cols 14..17 (width4), '/' at col 18 (attr 0x8).
  // The cur/max numbers are stacked VERTICALLY: cur on the label row, '/' at
  // col 18 of the label row, max on the NEXT row (cur==max at creation).
  putLabel(top, 10, 5, creationString(db, MSG_HP), 0x4);
  const hp = draft.derived.hpInitial ?? 0;
  putNumberRight(top, 14, 5, hp, 4, 0x6); // cur (row5), digit at col 17
  putCell(top, 18, 5, 0x2f, attrFor(8)); // '/'
  putNumberRight(top, 14, 6, hp, 4, 0x6); // max (row6), digit at col 17

  // STM: label at (10,8) attr 0x4, cur/max width-3 at cols 15..17, '/' col 18.
  putLabel(top, 10, 8, creationString(db, MSG_STM), 0x4);
  const stm = draft.derived.stamina ?? 0;
  putNumberRight(top, 15, 8, stm, 3, 0x6); // cur (row8), digit at col 17
  putCell(top, 18, 8, 0x2f, attrFor(8)); // '/'
  putNumberRight(top, 15, 9, stm, 3, 0x6); // max (row9), digit at col 17

  // BONUS row (10,11): shown once the pool has been ROLLED (>= 0; the engine's
  // *0x56ac is -1 until the bonus roll fires). It stays visible after full
  // allocation, displaying "BONUS  0". Label cols 10..14, value cols 16..17.
  if (draft.bonusPool >= 0) {
    putLabel(top, 10, 11, creationString(db, MSG_BONUS), 0x7);
    putNumberRight(top, 16, 11, draft.bonusPool, 2, 0x7);
  }
}

/** Print a left-aligned label string at (x,y) with attr `attrParam << 4`. */
function putLabel(
  top: TileWindow,
  x: number,
  y: number,
  text: string,
  attrParam: number,
): void {
  if (text.length === 0) return;
  setCursor(top, x, y);
  puts(top, text, attrFor(attrParam));
}
