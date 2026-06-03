/**
 * compose-spell-panel.ts — fills the character-creation SPELL PICKER windows
 * (spellOuter 20×16 @160,32 attr 0x16; spellInner 19×8 @168,56 attr 0x17) to
 * pixel-match the engine.
 *
 * The engine picker is a 3×2 SCHOOL GRID that drills into a per-school spell
 * sub-list. The PANEL (these two windows) renders one of two states:
 *
 *   - GRID-BROWSE (`selectedIdx === null`): the current school's level-1 spell
 *     names listed down the inner window (row 3 onward), no highlight bar, COST
 *     box BLANK. Each name is plain black-on-gray text (wfont3). Empty list →
 *     no names (blank interior).
 *   - SUB-LIST (`selectedIdx === i`): the same name list, but the i-th name is
 *     drawn as a full-width highlight bar — coloured text (realm colour) on a
 *     black background — and the COST box shows the selected spell's cost in the
 *     realm colour.
 *
 * Layout (inner 19×8): scrollbar in col 0; spell names start at row 3, col 1,
 * one row per spell. The highlight bar spans cols 1..17 (col 0 keeps the
 * scrollbar, col 18 stays gray).
 *
 * spellOuter draws the frame chrome + "SPELLS" title (row 1), a level-pip bar +
 * the realm name in colour (row 12), and a "COST" label + value box (row 14).
 *
 * Cell layout reverse-engineered from live saves + committed fixtures under
 * tools/parity/fixtures/engine/ (creation-spell-pick / -grid-water / -grid-air /
 * -grid-earth / -sublist-chill / -sublist-terror). Highlight render mode
 * (coloured-text-on-black, NOT inverse) confirmed by pixel-picking the chill/
 * terror fixtures: highlighted name = realm-colour stroke (idx 2 = WATER blue)
 * on black (idx 0). See docs/re/findings/spell-realm-colors.json + the
 * "highlight attr SIGN" checklist in CLAUDE.md.
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

/**
 * Spell `school` index (0..5, from SPELL_TABLE) → realm display name.
 * Names are msg.dbs entries 0x0f6e + school (FIRE/WATER/AIR/EARTH/MENTAL/MAGIC) —
 * verified on-screen in the creation picker. Note school 5 displays as "MAGIC",
 * not "DIVINE" (the spell-schools.ts RE comment's "Divine" label is the internal
 * school name; the engine shows MAGIC).
 */
export const REALM_NAMES = ['FIRE', 'WATER', 'AIR', 'EARTH', 'MENTAL', 'MAGIC'] as const;

/**
 * Realm → highlight attr (low-nibble 0 = wfont0 highlight path; high nibble = colour).
 *
 * Colours come from the engine's school→colour-nibble table at wroot.exe file
 * offset 0xff84 — six words `[4, 2, 3, 6, 7, 5]` indexed by spell school (0=Fire
 * … 5=Magic), so attr = nibble<<4. All six were pixel-picked from live DOSBox-X
 * captures of the creation spell picker (navigating the 3×2 school grid with
 * left/right/up/down) and match the table exactly (6/6). See
 * docs/re/findings/spell-realm-colors.json.
 */
export const REALM_ATTR: Record<string, number> = {
  FIRE: 0x40,   // bright red     (school 0) — capture-verified
  WATER: 0x20,  // bright blue    (school 1) — capture-verified
  AIR: 0x30,    // bright magenta (school 2) — capture-verified
  EARTH: 0x60,  // bright green   (school 3) — capture-verified
  MENTAL: 0x70, // bright cyan    (school 4) — capture-verified
  MAGIC: 0x50,  // bright yellow  (school 5) — capture-verified
  // CANCEL sentinel cell (camp-SPELL, the engine's 0xffff cursor): the label
  // reads "CANCEL" in GRAY (palette idx 9 = 170,170,170) on black — pixel-picked
  // from the spellbook-cancel fixture. RE: docs/re/findings/wpcvw-spell-action.json.
  CANCEL: 0x90, // gray (idx 9) — capture-verified vs spellbook-cancel fixture
};

export interface SpellPanelView {
  /** Current school's realm display name, e.g. "WATER". */
  realm: string;
  /** The school's level-1 spell names, in display order. Empty → blank list. */
  spellNames: string[];
  /** Sub-list mode: index of the highlighted spell. Grid-browse mode: null. */
  selectedIdx: number | null;
  /** COST value text (≤3 chars) for the selected spell; only shown when selectedIdx !== null. */
  cost?: string | null;
  /** 6-glyph level-pip bar (chars). Defaults to the full bar 0x18..0x1d. */
  pips?: number[];
}

const DEFAULT_PIPS = [0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d];

/** First inner row a spell name lands on (col 1). */
const NAME_ROW0 = 3;
/** Inner highlight bar extent (cols, inclusive). Col 0 = scrollbar, col 18 = gray edge. */
const BAR_X0 = 1;
const BAR_X1 = 17;

/**
 * Fill the outer (20×16) + inner (19×8) spell-picker windows for `view`.
 * Both windows must already exist (createSpellPickWindows). Mutates them.
 */
export function composeSpellPanel(outer: TileWindow, inner: TileWindow, view: SpellPanelView): void {
  const pips = view.pips ?? DEFAULT_PIPS;
  const realmAttr = REALM_ATTR[view.realm] ?? 0x40;
  const inSubList = view.selectedIdx !== null && view.selectedIdx !== undefined;

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
  // Realm name left-aligned at col 11, full length (realm colour on black);
  // trailing cells to col 18 are black (wfont0 highlight, colour idx 0).
  const realm = view.realm.slice(0, 8);
  for (let i = 0; i < 8; i++) {
    const cx = 11 + i;
    if (cx > 18) break;
    if (i < realm.length) cell(outer, cx, 12, realm.charCodeAt(i), realmAttr);
    else cell(outer, cx, 12, 0x20, 0x00);
  }
  cell(outer, 19, 12, 0x05, 0x01);
  // r13: divider below realm row
  const r13 = [0x17, 0x07, 0x0b, 0x07, 0x07, 0x18, 0x0c, 0x0c, 0x0c, 0x0a, 0x06, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x08];
  r13.forEach((ch, x) => cell(outer, x, 13, ch, 0x01));
  // r14: "COST" label (cols 1-4) + value box (cols 6-8). Value shown only in sub-list mode.
  cell(outer, 0, 14, 0x05, 0x01);
  text(outer, 1, 14, 'COST', 0x03);
  cell(outer, 5, 14, 0x04, 0x01);
  // COST value box (cols 6-8): the digit is RIGHT-aligned to col 8, in the realm
  // colour on black (wfont0 highlight). Blank in grid-browse mode.
  const cost = inSubList ? (view.cost ?? '').slice(0, 3) : '';
  const costPadded = cost.padStart(3, '\0'); // sentinel for "blank" slots
  for (let i = 0; i < 3; i++) {
    const ch = costPadded.charCodeAt(i);
    if (ch !== 0) cell(outer, 6 + i, 14, ch, realmAttr);
    else cell(outer, 6 + i, 14, 0x20, 0x00);
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
  // background spaces (attr 0x03 = gray), scrollbar in col 0 (wfont2 glyphs).
  for (let y = 0; y < 8; y++) fillRow(inner, 0, 18, y, 0x20, 0x03);
  // scrollbar: up-arrow (0x45), track (0x47×5), down-arrow (0x46); row 7 blank
  const bar = [0x45, 0x47, 0x47, 0x47, 0x47, 0x47, 0x46];
  bar.forEach((ch, y) => cell(inner, 0, y, ch, 0x02));

  // spell names, one per row. The list scrolls so the *anchor* spell sits on
  // NAME_ROW0: grid-browse anchors the first spell (offset 0); sub-list anchors
  // the SELECTED spell (offset = selectedIdx). Confirmed against the chill
  // (idx 0 → row 3) and terror (idx 1 → CHILLING@row2, TERROR@row3) fixtures.
  const anchor = inSubList ? (view.selectedIdx as number) : 0;
  view.spellNames.forEach((name, i) => {
    const row = NAME_ROW0 + (i - anchor);
    if (row < 0 || row > 6) return; // interior is rows 0..6 (row 7 is the scrollbar trailer)
    if (inSubList && view.selectedIdx === i) {
      // Highlight bar: realm-colour text on black across cols 1..17 (wfont0).
      // Lay the full bar black first, then the name glyphs on top.
      fillRow(inner, BAR_X0, BAR_X1, row, 0x20, realmAttr);
      text(inner, 1, row, name.slice(0, BAR_X1 - BAR_X0 + 1), realmAttr);
    } else {
      // Plain row: black-on-gray text (wfont3).
      text(inner, 1, row, name, 0x03);
    }
  });
}
