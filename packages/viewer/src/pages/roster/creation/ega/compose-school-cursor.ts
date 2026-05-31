/**
 * compose-school-cursor.ts — draws the "current school" cursor over the
 * char-sheet's 6 school-mana icon cells (the `top` window, bottom-left grid).
 *
 * During spell picking the engine highlights the currently-browsed school by
 * replacing that school's icon glyph with a SOLID HIGHLIGHT BLOCK: wfont0 glyph
 * 0x63 (7 full rows + 1 black baseline row — the only such fill glyph in wfont0)
 * rendered through the highlight path at colour nibble 5 (attr 0x50, palette[5] =
 * bright yellow). Pixel-picking the committed fixtures
 * (creation-spell-grid-water = school 1 → top-left icon; creation-spell-grid-
 * earth = school 3 → top-right icon) shows the selected cell as 7 rows of
 * palette index 5 + 1 black row, while unselected cells keep their normal
 * multi-colour wfont2 icon glyph. The cursor colour is a FIXED index 5, not the
 * realm colour.
 *
 * Icon grid layout (matches drawIcons in char-sheet.ts):
 *   left  column x=1, rows 14/16/18 → schools 0, 1, 2
 *   right column x=11, rows 14/16/18 → schools 3, 4, 5
 */
import { setCursor, puts, type TileWindow } from '@wiz6/parser';

/** wfont0 glyph 0x63 = 7 full rows + 1 black baseline (the solid block glyph). */
const CURSOR_GLYPH = 0x63;
/** wfont0 highlight, colour nibble 5 → palette[5] stroke on black. */
const CURSOR_ATTR = 0x50;

/** Cell coords of each school's icon in the `top` char-sheet window, by school index 0..5. */
const ICON_POS: ReadonlyArray<readonly [number, number]> = [
  [1, 14], [1, 16], [1, 18],
  [11, 14], [11, 16], [11, 18],
];

/**
 * Highlight the `school`-th (0..5) school-mana icon in the char-sheet `top`
 * window with the current-school cursor block. No-op for out-of-range indices.
 * Mutates `top`; call AFTER drawCharSheet (it overdraws the icon cell).
 */
export function drawSchoolCursor(top: TileWindow, school: number): void {
  const pos = ICON_POS[school];
  if (!pos) return;
  setCursor(top, pos[0], pos[1]);
  puts(top, String.fromCharCode(CURSOR_GLYPH), CURSOR_ATTR);
}
