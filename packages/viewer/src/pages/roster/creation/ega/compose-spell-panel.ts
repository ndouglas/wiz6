/**
 * compose-spell-panel.ts — fills the character-creation SPELL PICKER windows
 * (spellOuter 20×16 @160,32 attr 0x16; spellInner 19×8 @168,56 attr 0x17) to
 * pixel-match the engine.
 *
 * The engine picker is a SCROLLABLE SINGLE-SPELL DETAIL view (NOT a flat list):
 *   - spellOuter draws the frame chrome + "SPELLS" title (row 1), a level-pip
 *     bar + the realm name in colour (row 12), and a "COST" label + value box
 *     (row 14).
 *   - spellInner draws a vertical scrollbar in col 0 and the current spell's
 *     name at row 3, col 1.
 * Cell layout reverse-engineered from a live save (game_state 0x10), see
 * docs/re/findings/wpcmk-spell-picker-geometry.json + the committed fixture
 * tools/parity/fixtures/engine/creation-spell-pick.png.
 *
 * Render order: outer first, then inner on top (inner overdraws the interior).
 */
import { setCursor, puts, type TileWindow } from '@wiz6/parser';

/** Write a single cell (char + attr) at (x,y). */
function cell(w: TileWindow, x: number, y: number, ch: number, attr: number): void {
  setCursor(w, x, y);
  puts(w, String.fromCharCode(ch), attr);
}
/** Fill cols [x0..x1] of row y with one char/attr. */
function fillRow(w: TileWindow, x0: number, x1: number, y: number, ch: number, attr: number): void {
  for (let x = x0; x <= x1; x++) cell(w, x, y, ch, attr);
}
/** Write an ASCII string starting at (x,y) with one attr. */
function text(w: TileWindow, x: number, y: number, s: string, attr: number): void {
  setCursor(w, x, y);
  puts(w, s, attr);
}

/** Realm → highlight attr (low-nibble 0 = wfont0 highlight path; high nibble = colour). */
export const REALM_ATTR: Record<string, number> = {
  FIRE: 0x40,   // red
  WATER: 0x10,  // blue
  AIR: 0xf0,    // white/bright
  EARTH: 0x60,  // brown/cyan-ish
  MENTAL: 0xd0, // magenta
  DIVINE: 0xe0, // yellow
};

export interface SpellPanelView {
  /** Spell display name, e.g. "ENERGY BLAST". */
  spellName: string;
  /** Realm/element name, e.g. "FIRE". */
  realm: string;
  /** 6-glyph level-pip bar (chars). Defaults to the full bar 0x18..0x1d. */
  pips?: number[];
  /** COST value text (≤3 chars), or null/empty for blank box. */
  cost?: string | null;
}

const DEFAULT_PIPS = [0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d];

/**
 * Fill the outer (20×16) + inner (19×8) spell-picker windows for `view`.
 * Both windows must already exist (createSpellPickWindows). Mutates them.
 */
export function composeSpellPanel(outer: TileWindow, inner: TileWindow, view: SpellPanelView): void {
  const pips = view.pips ?? DEFAULT_PIPS;
  const realmAttr = REALM_ATTR[view.realm] ?? 0x40;

  // ---- spellOuter (20 wide × 16 tall) ----
  // r0: top frame rule
  cell(outer, 0, 0, 0x0e, 0x01);
  fillRow(outer, 1, 18, 0, 0x0c, 0x01);
  cell(outer, 19, 0, 0x0a, 0x01);
  // r1: title "SPELLS" (cols 7-12) between quote glyphs (cols 2,17)
  cell(outer, 0, 1, 0x0d, 0x01);
  fillRow(outer, 1, 18, 1, 0x20, 0x03);
  cell(outer, 2, 1, 0x22, 0x04);
  text(outer, 7, 1, 'SPELLS', 0x03);
  cell(outer, 17, 1, 0x22, 0x04);
  cell(outer, 19, 1, 0x05, 0x01);
  // r2: separator under title
  cell(outer, 0, 2, 0x15, 0x01);
  fillRow(outer, 1, 18, 2, 0x07, 0x01);
  cell(outer, 19, 2, 0x08, 0x01);
  // r3..r10: black interior with left V-rail (inner window overdraws cols 1-19)
  for (let y = 3; y <= 10; y++) {
    cell(outer, 0, y, y === 9 ? 0x0a : 0x05, 0x01);
    fillRow(outer, 1, 19, y, 0x00, 0x01);
  }
  // r11: divider above the realm row (with junctions)
  const r11 = [0x16, 0x12, 0x22, 0x12, 0x12, 0x12, 0x12, 0x12, 0x12, 0x13, 0x11, 0x12, 0x12, 0x12, 0x12, 0x12, 0x12, 0x12, 0x12, 0x13];
  r11.forEach((ch, x) => cell(outer, x, 11, ch, 0x01));
  // r12: pips (cols 3-8, attr 0x50) + realm name (cols 11-14, realm colour)
  cell(outer, 0, 12, 0x0d, 0x01);
  cell(outer, 1, 12, 0x22, 0x02);
  cell(outer, 2, 12, 0x0d, 0x01);
  pips.slice(0, 6).forEach((ch, i) => cell(outer, 3 + i, 12, ch, 0x50));
  cell(outer, 9, 12, 0x05, 0x01);
  cell(outer, 10, 12, 0x04, 0x01);
  const realm = view.realm.slice(0, 4).padEnd(4, ' ');
  for (let i = 0; i < 4; i++) {
    const c = realm.charCodeAt(i);
    cell(outer, 11 + i, 12, c === 0x20 ? 0x20 : c, c === 0x20 ? 0x00 : realmAttr);
  }
  fillRow(outer, 15, 18, 12, 0x20, 0x00);
  cell(outer, 19, 12, 0x05, 0x01);
  // r13: divider below realm row
  const r13 = [0x17, 0x07, 0x0b, 0x07, 0x07, 0x18, 0x0c, 0x0c, 0x0c, 0x0a, 0x06, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x08];
  r13.forEach((ch, x) => cell(outer, x, 13, ch, 0x01));
  // r14: "COST" label (cols 1-4) + value box (cols 6-8)
  cell(outer, 0, 14, 0x05, 0x01);
  text(outer, 1, 14, 'COST', 0x03);
  cell(outer, 5, 14, 0x04, 0x01);
  const cost = (view.cost ?? '').slice(0, 3);
  for (let i = 0; i < 3; i++) {
    const c = i < cost.length ? cost.charCodeAt(i) : 0x20;
    cell(outer, 6 + i, 14, c, i < cost.length ? 0x03 : 0x00);
  }
  cell(outer, 9, 14, 0x05, 0x01);
  fillRow(outer, 10, 19, 14, 0x20, 0x03);
  // r15: bottom frame
  cell(outer, 0, 15, 0x08, 0x01);
  fillRow(outer, 1, 4, 15, 0x20, 0x03);
  cell(outer, 5, 15, 0x06, 0x01);
  fillRow(outer, 6, 8, 15, 0x07, 0x01);
  cell(outer, 9, 15, 0x08, 0x01);
  fillRow(outer, 10, 19, 15, 0x20, 0x03);

  // ---- spellInner (19 wide × 8 tall) ----
  // background spaces (attr 0x03), scrollbar in col 0 (wfont2 glyphs), name row 3
  for (let y = 0; y < 8; y++) fillRow(inner, 0, 18, y, 0x20, 0x03);
  // scrollbar: up-arrow (0x45), track (0x47×5), down-arrow (0x46); row 7 blank
  const bar = [0x45, 0x47, 0x47, 0x47, 0x47, 0x47, 0x46];
  bar.forEach((ch, y) => cell(inner, 0, y, ch, 0x02));
  // current spell name at row 3, col 1
  text(inner, 1, 3, view.spellName, 0x03);
}
