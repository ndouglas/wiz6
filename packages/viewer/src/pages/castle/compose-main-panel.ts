/**
 * composeMainPanel — WPCVW full-screen main panel (40×20 @ x=0, y=0).
 *
 * Engine reference: the main panel hosts the character sheet — portrait +
 * header (rows 1-3), stats column (STR..KAR, rows 5-12), HP/STM/CND/GP/CC
 * column (rows 5-12), ARMORCLASS sub-panel + slot icons (rows 5-7),
 * inventory list (rows 9-13), and school-mana grid (rows 14-18). RE'd
 * directly from save 2's cell-grid dump (40×20 window at struct offset
 * 0x1f704 in tools/dosbox/save/2.sav).
 *
 * The action menu does NOT live here — the engine renders it in a SEPARATE
 * 40×4 window at y=20 (handled by compose-action-menu.ts).
 *
 * Scaffold renders the STR..KAR stats column with right-aligned values
 * (matches engine attrs 0x50 for label / 0x10 for value, palette[5] yellow
 * / palette[1] white). Header, HP column, ARMORCLASS, inventory, school
 * mana, and the wfont1 chrome frame remain TODO — closing them one by one
 * lifts the parity floor toward 100%.
 */

import { createTileWindow, clearWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { ActivePartyMember, MessageDb } from '@wiz6/data';
import {
  creationString,
  RACE_NAME_BASE,
  CLASS_NAME_BASE,
  SEX_NAME_BASE,
} from '../roster/creation/messages.js';

const PANEL_W = 40;
const PANEL_H = 20;
const PANEL_X = 0;
const PANEL_Y = 0;
// Engine default background for the main panel is attr 0x00 (palette[0]=black
// on highlight path), NOT the gray attr 0x03 we use elsewhere. Verified from
// save 2 cell dump: 80 space cells have attr 0x00. Only the AC icon-row gaps
// and the rightmost col 38 of rows 14-18 use attr 0x03 — see drawArmorClass
// and the small extras below.
const ATTR_BG = 0x00;
const ATTR_AC_GAP = 0x03;            // space attr in AC icon row inter-icon cells
const ATTR_STAT_LABEL = 0x50;       // palette[5] yellow — STR..KAR labels
const ATTR_STAT_VALUE = 0x10;       // palette[1] white  — STR..KAR values
const ATTR_VITAL_LABEL = 0x40;      // palette[4] green  — HP / STM / CND labels
const ATTR_VITAL_VALUE = 0x60;      // palette[6] red    — HP / STM / CND values
const ATTR_VITAL_SLASH = 0x80;      // palette[8]        — separator
const ATTR_GP_LABEL = 0xd0;         // palette[13]       — GP label
const ATTR_GP_VALUE = 0x50;         // palette[5] yellow — GP value
const ATTR_CC_LABEL = 0x80;         // palette[8]        — CC label
const ATTR_CC_VALUE = 0x90;         // palette[9]        — CC value
const ATTR_CND_HEALTHY = 0x01;      // wfont1 glyph 0x2f — healthy "/" indicator
const ATTR_NAME = 0x50;             // palette[5] yellow — character name
const ATTR_RACE_CLASS = 0x10;       // palette[1] white  — race/class/LVL value
const ATTR_RNK_LABEL = 0xb0;        // palette[11]       — RNK label
const ATTR_RNK_VALUE = 0x30;        // palette[3]        — RNK value (e.g. NONE)
const ATTR_EXPMKS_LABEL = 0xe0;     // palette[14]       — EXP / MKS labels
const ATTR_EXPMKS_VALUE = 0x60;     // palette[6]        — EXP / MKS values
const ATTR_LVL_LABEL = 0x80;        // palette[8]        — LVL label
const ATTR_LVL_VALUE = 0x90;        // palette[9]        — LVL value

// School mana grid (rows 14-18). 6 schools × 2 colors: icon at attr 0x02
// (wfont2 glyph), value at the school's distinctive attr below, slash at
// attr 0x90. Layout: schools 0/1/2 (Fire/Water/Air) in the left column,
// 3/4/5 (Earth/Mental/Divine) in the right column. Verified from save 2.
const SCHOOL_VALUE_ATTRS: ReadonlyArray<number> = [
  0x40, // 0 Fire
  0x20, // 1 Water
  0x30, // 2 Air
  0x60, // 3 Earth
  0x70, // 4 Mental
  0x50, // 5 Divine
];
const SCHOOL_ICON_CHARS: ReadonlyArray<number> = [
  0x23, // 0 Fire   '#'
  0x24, // 1 Water  '$'
  0x25, // 2 Air    '%'
  0x26, // 3 Earth  '&'
  0x27, // 4 Mental '''
  0x28, // 5 Divine '('
];
const ATTR_SCHOOL_ICON = 0x02;       // wfont2 — school glyph cell
const ATTR_MANA_SLASH = 0x90;        // palette[9] — separator

// Inventory list (rows 9-13 cols 21-38).
const ATTR_INV_MARGIN = 0x40;        // palette[4] left-margin "selected-row" marker
const ATTR_INV_NAME = 0x90;          // palette[9] item-name chars (carried, not equipped)
const ATTR_INV_NAME_HAND = 0x60;     // palette[6] equipped weapon/off-hand (body 0,1)
const ATTR_INV_NAME_WORN = 0x70;     // palette[7] equipped worn armor (body 2..7)
const ATTR_INV_PAD = 0x10;           // palette[1] trailing-space pad after the name
const ATTR_INV_ICON = 0x04;          // wfont0 highlighted — body-slot equip icon
const INV_CHECK_CHAR = 0x17;         // ✓ left-margin marker for an equipped item
const INV_NAME_COL = 22;
const INV_NAME_WIDTH = 15;           // cols 22..36 inclusive
const INV_ICON_COL = 38;
const INV_FIRST_ROW = 9;
const INV_MAX_ROWS = 5;              // rows 9..13

// ARMORCLASS sub-panel (rows 5-7 cols 21-38).
const ATTR_AC_LABEL = 0xf0;          // palette[15]      — "ARMORCLASS", parens, mid space
const ATTR_AC_TOTAL = 0x40;          // palette[4]       — total AC number
const ATTR_AC_MOD = 0x90;            // palette[9]       — "+0" modifier
const ATTR_AC_ICON = 0x04;           // wfont0 highlight — slot icons (y..~)
const ATTR_AC_SEP = 0x01;            // wfont1 0x1c     — separator
const ATTR_AC_VALUE_ZERO = 0x30;     // palette[3]      — slot value when 0
const ATTR_AC_VALUE_NONZERO = 0x70;  // palette[7]      — slot value when non-zero

// Window-chrome glyphs (wfont1, attr 0x01). All chars + positions decoded
// from save 2's main-panel cell dump.
const ATTR_CHROME = 0x01;
const CHROME_TOP_LEFT = 0x01;
const CHROME_TOP_HORZ = 0x02;
const CHROME_TOP_RIGHT = 0x03;
const CHROME_LEFT_VERT = 0x04;
const CHROME_RIGHT_VERT = 0x05;
const CHROME_BOT_LEFT = 0x06;
const CHROME_BOT_HORZ = 0x07;
const CHROME_BOT_RIGHT = 0x08;
const CHROME_T_LEFT = 0x09;     // left edge T-junction (rows 4, 13, 15, 17)
const CHROME_T_RIGHT = 0x0a;    // right edge T-junction (rows 4, 8)
const CHROME_T_BOT = 0x0b;      // bottom T-junction (row 19 at cols 2/10/12/20/37)
const CHROME_INNER_HORZ = 0x0c; // inner horizontal line
const CHROME_INNER_VERT = 0x0d; // inner vertical line
const CHROME_CROSS_X = 0x0e;    // crossroad junction (variant 1)
const CHROME_CROSS_T_UP = 0x0f; // T-up junction (rows 13, 15, 17 at col 20)
const CHROME_CROSS_T_DN = 0x10; // T-down junction (rows 15, 17 at cols 2/10/12)
const CHROME_AC_ICON_SEP = 0x1c;// vertical separator between AC icons (row 6)
const CHROME_AC_BOTTOM_T = 0x21;// special junction at (8, 20)

/** Default body-AC values when the character record doesn't carry bodyAc.
 *  Per CharacterSchema docs: stock value = [0, 0, 10, 10, 10, 10, 10]
 *  (Magical, Head, Chest, Legs, Hands, Feet, Encumbrance/Shield) — but the
 *  WPCVW panel renders 6 slots in the order:
 *  [Magical, Head, Chest, Legs, Hands, Feet] = [0, 10, 10, 10, 10, 10]
 *  (per save 2 dump). Engine flattens the schema's leading double-0.
 */
const AC_DEFAULTS = [0, 10, 10, 10, 10, 10] as const;

const STATS_LABEL_COL = 1;
const STATS_VALUE_COL = 5; // right edge of 2-char value at col 6
const STATS_VALUE_WIDTH = 2;
const STATS_FIRST_ROW = 5;

const STAT_LABELS: ReadonlyArray<{ label: string; value: (m: ActivePartyMember) => number }> = [
  { label: 'STR', value: (m) => m.attributes.str },
  { label: 'INT', value: (m) => m.attributes.int },
  { label: 'PIE', value: (m) => m.attributes.pie },
  { label: 'VIT', value: (m) => m.attributes.vit },
  { label: 'DEX', value: (m) => m.attributes.dex },
  { label: 'SPD', value: (m) => m.attributes.spd },
  { label: 'PER', value: (m) => m.attributes.per },
  { label: 'KAR', value: (m) => m.attributes.kar },
];

/** A single item row in the WPCVW inventory list. */
export interface InventoryItem {
  /** Display name, truncated/padded to 15 chars when rendered. */
  name: string;
  /** Body-slot glyph (wfont0 char) — e.g. 0x02 weapon, 0x2a body, 0x2d legs,
   *  0x2f feet, 0x27 shield. Maps from the item's `equipSlot` field. */
  iconChar: number;
  /** Body slot this item is equipped in (0..7), or null if carried-but-not-equipped.
   *  Equipped rows render a ✓ marker + recolored name; equipped armor also drives
   *  the AC-grid icons. RE: wpcvw-post-equip-view.json. */
  equippedBodySlot?: number | null;
}

export interface MainPanelView {
  member: ActivePartyMember;
  db: MessageDb;
  /** Inventory list to render in rows 9-13 (max 5). Defaults to empty.
   *  Runtime callers omit this until we have a scenario.dbs item-name
   *  lookup; the parity test passes the fixture's known 5 items. */
  inventory?: ReadonlyArray<InventoryItem> | undefined;
  /** Carrying-capacity values (current / max). Omit to render only the
   *  "CC" label. Derivation from STR + inventory weight is TODO. */
  cc?: { current: number; max: number } | undefined;
  /** Years-since-birth (row 2) and the engine's "secondAge" / age2 counter
   *  (row 3) displayed next to the portrait. Omit to skip rendering. */
  age?: { years: number; second: number } | undefined;
}

/** Right-align `value` to width `n`, space-pad on the left. */
function rpad(value: number | string, n: number): string {
  return String(value).padStart(n, ' ');
}

function drawStatsColumn(w: TileWindow, member: ActivePartyMember): void {
  for (let i = 0; i < STAT_LABELS.length; i++) {
    const { label, value } = STAT_LABELS[i]!;
    const row = STATS_FIRST_ROW + i;
    setCursor(w, STATS_LABEL_COL, row);
    puts(w, label, ATTR_STAT_LABEL);
    setCursor(w, STATS_VALUE_COL, row);
    puts(w, rpad(value(member), STATS_VALUE_WIDTH), ATTR_STAT_VALUE);
  }
}

function drawHpStmCndGpCc(w: TileWindow, member: ActivePartyMember): void {
  // HP row 5 + max row 6. Engine renders " HP" at cols 10-12, "   7" at cols
  // 14-17 (4-wide right-aligned), "/" at col 18 attr 0x80; row 6 has the max
  // value right-aligned at cols 14-17 (no slash).
  const hpCur = member.hpCurrent ?? 0;
  const hpMax = member.hpMax ?? 0;
  setCursor(w, 10, 5);
  puts(w, ' HP', ATTR_VITAL_LABEL);
  setCursor(w, 14, 5);
  puts(w, rpad(hpCur, 4), ATTR_VITAL_VALUE);
  setCursor(w, 18, 5);
  puts(w, '/', ATTR_VITAL_SLASH);
  setCursor(w, 14, 6);
  puts(w, rpad(hpMax, 4), ATTR_VITAL_VALUE);

  // STM row 8 — "STM" at cols 10-12, " 100" at cols 14-17, "%" at col 18.
  const stmPct =
    member.staminaMax && member.staminaMax > 0
      ? Math.round(((member.staminaCurrent ?? 0) / member.staminaMax) * 100)
      : 0;
  setCursor(w, 10, 8);
  puts(w, 'STM', ATTR_VITAL_LABEL);
  setCursor(w, 14, 8);
  puts(w, rpad(stmPct, 4), ATTR_VITAL_VALUE);
  setCursor(w, 18, 8);
  puts(w, '%', ATTR_VITAL_LABEL);

  // CND row 9 — "CND" at cols 10-12, "/" at col 14 attr 0x01 when healthy.
  // (Non-zero conditions render different glyphs; deferred.)
  setCursor(w, 10, 9);
  puts(w, 'CND', ATTR_VITAL_LABEL);
  const healthy = member.conditions.every((c) => c === 0);
  if (healthy) {
    setCursor(w, 14, 9);
    puts(w, '/', ATTR_CND_HEALTHY);
  }

  // GP row 11 — "GP" at cols 10-11, value right-aligned at cols 13-19 (7 wide).
  setCursor(w, 10, 11);
  puts(w, 'GP', ATTR_GP_LABEL);
  setCursor(w, 13, 11);
  puts(w, rpad(member.gold, 7), ATTR_GP_VALUE);

  // CC row 12 — "CC" at cols 10-11, " 29" at cols 13-15, "/" at col 16, "213"
  // at cols 17-19. Caller supplies CC values via view.cc since they are a
  // derived field not on CharacterSchema (carrying weight + STR-based max).
  setCursor(w, 10, 12);
  puts(w, 'CC', ATTR_CC_LABEL);
}

/** Render the CC (carrying-capacity) value pair when supplied by the caller. */
function drawCcValues(w: TileWindow, cc: { current: number; max: number } | undefined): void {
  if (!cc) return;
  setCursor(w, 13, 12);
  puts(w, rpad(cc.current, 3), ATTR_CC_VALUE);
  setCursor(w, 16, 12);
  puts(w, '/', ATTR_CC_LABEL);
  setCursor(w, 17, 12);
  puts(w, rpad(cc.max, 3), ATTR_CC_VALUE);
}

function drawAgeFields(w: TileWindow, age: { years: number; second: number }): void {
  // Row 2 col 4: wfont0 glyph 0x1e attr 0x50 (age indicator), cols 5-7 value
  // right-aligned in 3 chars attr 0xe0 (palette[14]).
  // Row 3 col 4: wfont0 glyph 0x1f attr 0x50, cols 5-7 value attr 0xc0.
  const ATTR_AGE_INDICATOR = 0x50;
  const ATTR_AGE_YEARS = 0xe0;
  const ATTR_AGE_SECOND = 0xc0;
  setCell(w, 4, 2, 0x1e, ATTR_AGE_INDICATOR);
  setCursor(w, 5, 2);
  puts(w, rpad(age.years, 3), ATTR_AGE_YEARS);
  setCell(w, 4, 3, 0x1f, ATTR_AGE_INDICATOR);
  setCursor(w, 5, 3);
  puts(w, rpad(age.second, 3), ATTR_AGE_SECOND);
}

function drawPortraitTiles(w: TileWindow): void {
  // Portrait is a 3×3 grid at rows 1-3 cols 1-3, glyphs 0x48..0x50 (wfont2).
  // The character's portrait must be patched into wfont2 at those glyph
  // slots by the caller (via patchFontSetWithPortrait); we just write the
  // cell positions here.
  const ATTR_PORTRAIT = 0x02;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      setCell(w, 1 + c, 1 + r, 0x48 + r * 3 + c, ATTR_PORTRAIT);
    }
  }
}

function drawHeader(w: TileWindow, member: ActivePartyMember, db: MessageDb): void {
  // Row 1: NAME at cols 4-9 attr 0x50, RACE at cols 13-20 attr 0x10, RNK
  // label at cols 25-27 attr 0xb0, RNK value (e.g. NONE) at cols 35-38 attr 0x30.
  // Engine race format is "{sex_letter}-{race_name}", e.g. "M-RAWULF".
  const sex = creationString(db, SEX_NAME_BASE + member.sex);
  const race = creationString(db, RACE_NAME_BASE + member.race);
  const cls = creationString(db, CLASS_NAME_BASE + member.class);
  const sexLetter = sex ? sex.charAt(0) : '?';
  const sexRace = `${sexLetter}-${race}`;

  setCursor(w, 4, 1);
  puts(w, member.name, ATTR_NAME);
  setCursor(w, 13, 1);
  puts(w, sexRace, ATTR_RACE_CLASS);
  setCursor(w, 25, 1);
  puts(w, 'RNK', ATTR_RNK_LABEL);
  setCursor(w, 35, 1);
  puts(w, 'NONE', ATTR_RNK_VALUE);

  // Row 2: CLASS at cols 13-19 attr 0x10, EXP label cols 25-27 attr 0xe0,
  // EXP value right-aligned cols 29-38 (10 wide) attr 0x60.
  setCursor(w, 13, 2);
  puts(w, cls, ATTR_RACE_CLASS);
  setCursor(w, 25, 2);
  puts(w, 'EXP', ATTR_EXPMKS_LABEL);
  setCursor(w, 29, 2);
  puts(w, rpad(member.xp, 10), ATTR_EXPMKS_VALUE);

  // Row 3: LVL label cols 13-15 attr 0x80, LVL value cols 17-19 (3 wide)
  // attr 0x90, MKS label cols 25-27 attr 0xe0, MKS value right-aligned cols
  // 29-38 attr 0x60 (placeholder 0 — MKS not on schema).
  setCursor(w, 13, 3);
  puts(w, 'LVL', ATTR_LVL_LABEL);
  setCursor(w, 17, 3);
  puts(w, rpad(member.level, 3), ATTR_LVL_VALUE);
  setCursor(w, 25, 3);
  puts(w, 'MKS', ATTR_EXPMKS_LABEL);
  setCursor(w, 29, 3);
  puts(w, rpad(0, 10), ATTR_EXPMKS_VALUE);
}

/** Set the cell at (row, col) to (char, attr) directly — bypassing the
 *  cursor-advancing puts(). Used for chrome where positions are sparse. */
function setCell(w: TileWindow, col: number, row: number, char: number, attr: number): void {
  const i = (row * w.widthCells + col) * 2;
  w.cells[i] = char;
  w.cells[i + 1] = attr;
}

function drawChrome(w: TileWindow): void {
  // Row 0: top border = 0x01 0x02×38 0x03
  setCell(w, 0, 0, CHROME_TOP_LEFT, ATTR_CHROME);
  for (let x = 1; x <= 38; x++) setCell(w, x, 0, CHROME_TOP_HORZ, ATTR_CHROME);
  setCell(w, 39, 0, CHROME_TOP_RIGHT, ATTR_CHROME);

  // Rows 1-18 col 0: left vertical (with T-junctions at rows 4, 13, 15, 17)
  // Rows 1-18 col 39: right vertical (with T-junctions at rows 4, 8)
  for (let y = 1; y <= 18; y++) {
    const isLeftT = y === 4 || y === 13 || y === 15 || y === 17;
    setCell(w, 0, y, isLeftT ? CHROME_T_LEFT : CHROME_LEFT_VERT, ATTR_CHROME);
    const isRightT = y === 4 || y === 8;
    setCell(w, 39, y, isRightT ? CHROME_T_RIGHT : CHROME_RIGHT_VERT, ATTR_CHROME);
  }

  // Row 4: horizontal separator under header. 0x0c × 19 with 0x0e at col 20.
  for (let x = 1; x <= 19; x++) setCell(w, x, 4, CHROME_INNER_HORZ, ATTR_CHROME);
  setCell(w, 20, 4, CHROME_CROSS_X, ATTR_CHROME);
  for (let x = 21; x <= 38; x++) setCell(w, x, 4, CHROME_INNER_HORZ, ATTR_CHROME);

  // Col 20 rows 5-18: inner vertical (mostly 0x0d, special at rows 8/13/15/17)
  for (let y = 5; y <= 18; y++) {
    let ch: number = CHROME_INNER_VERT;
    if (y === 8) ch = CHROME_AC_BOTTOM_T;
    else if (y === 13 || y === 15 || y === 17) ch = CHROME_CROSS_T_UP;
    setCell(w, 20, y, ch, ATTR_CHROME);
  }

  // Row 8 cols 21-38: horizontal separator under AC values. 0x0c × 16 with
  // 0x0e at col 37, 0x0c at col 38.
  for (let x = 21; x <= 36; x++) setCell(w, x, 8, CHROME_INNER_HORZ, ATTR_CHROME);
  setCell(w, 37, 8, CHROME_CROSS_X, ATTR_CHROME);
  setCell(w, 38, 8, CHROME_INNER_HORZ, ATTR_CHROME);

  // Col 37 rows 9-18: inner vertical (with 0x0e at row 8 handled above)
  for (let y = 9; y <= 18; y++) {
    setCell(w, 37, y, CHROME_INNER_VERT, ATTR_CHROME);
  }

  // Row 13: horizontal separator. 0x0c × 19 with 0x0e at cols 2, 10, 12 and
  // 0x0f at col 20.
  for (let x = 1; x <= 19; x++) {
    const ch =
      x === 2 || x === 10 || x === 12 ? CHROME_CROSS_X : CHROME_INNER_HORZ;
    setCell(w, x, 13, ch, ATTR_CHROME);
  }
  setCell(w, 20, 13, CHROME_CROSS_T_UP, ATTR_CHROME);

  // Rows 15, 17: same horizontal pattern as row 13 but with 0x10 (T-down)
  // at cols 2, 10, 12 instead of 0x0e.
  for (const y of [15, 17]) {
    for (let x = 1; x <= 19; x++) {
      const ch =
        x === 2 || x === 10 || x === 12 ? CHROME_CROSS_T_DN : CHROME_INNER_HORZ;
      setCell(w, x, y, ch, ATTR_CHROME);
    }
    setCell(w, 20, y, CHROME_CROSS_T_UP, ATTR_CHROME);
  }

  // Rows 14, 16, 18 cols 2, 10, 12: school mana cell verticals (0x0d).
  for (const y of [14, 16, 18]) {
    for (const x of [2, 10, 12]) {
      setCell(w, x, y, CHROME_INNER_VERT, ATTR_CHROME);
    }
  }

  // Row 19: bottom border. 0x06, mixed 0x07/0x0b, 0x08.
  setCell(w, 0, 19, CHROME_BOT_LEFT, ATTR_CHROME);
  for (let x = 1; x <= 38; x++) {
    const isT = x === 2 || x === 10 || x === 12 || x === 20 || x === 37;
    setCell(w, x, 19, isT ? CHROME_T_BOT : CHROME_BOT_HORZ, ATTR_CHROME);
  }
  setCell(w, 39, 19, CHROME_BOT_RIGHT, ATTR_CHROME);
}

/** Cells where the engine uses attr 0x03 (gray bg) instead of the default
 *  attr 0x00 (black). Verified from save 2 cell dump. */
function drawBackgroundExtras(w: TileWindow): void {
  // AC icon row 6: gaps between icons + after the last icon.
  for (const c of [21, 24, 27, 30, 33, 36, 38]) {
    setCell(w, c, 6, 0x20, ATTR_AC_GAP);
  }
  // School-mana rows: rightmost col 38.
  for (const r of [14, 15, 16, 17, 18]) {
    setCell(w, 38, r, 0x20, ATTR_AC_GAP);
  }
}

/** Interpret a stored AC byte as signed (the weapon/shield slot underflows to
 *  0xFF = −1 etc — see computeAc's u8-wrap note). */
function signed8(b: number): number {
  return b > 127 ? b - 256 : b;
}

function drawArmorClass(
  w: TileWindow,
  member: ActivePartyMember,
  items: ReadonlyArray<InventoryItem>,
): void {
  // The stored AC array keeps the combined weapon/off-hand AC (bodyAc[0], the
  // +0x4549 byte) SEPARATE from the per-body-part AC; the panel FOLDS its signed
  // value into the total and the 5 worn slots at render time (Magical is exempt).
  // RE: wpcvw-post-equip-view.json #ac-display-folds-in-weapon-shield-ac.
  const hasBodyAc = member.bodyAc != null;
  const shieldAc = hasBodyAc ? signed8(member.bodyAc![0] ?? 0) : 0;

  // Row 5: "ARMORCLASS" cols 21-30 attr 0xf0; total (2 chars) cols 32-33 attr
  // 0x40; " (" 34-35 attr 0xf0; signed modifier 36-37; ")" 38 attr 0xf0. The
  // modifier is the folded-in weapon/shield AC: "+0" attr 0x90 when ≥0, else
  // "-N" attr 0x60 (red).
  setCursor(w, 21, 5);
  puts(w, 'ARMORCLASS', ATTR_AC_LABEL);
  const total = rpad((member.derivedAc ?? 10) + shieldAc, 2);
  setCursor(w, 32, 5);
  puts(w, total, ATTR_AC_TOTAL);
  setCursor(w, 34, 5);
  puts(w, ' (', ATTR_AC_LABEL);
  const modText = shieldAc < 0 ? `-${-shieldAc}` : `+${shieldAc}`;
  const modAttr = shieldAc < 0 ? ATTR_VITAL_VALUE : ATTR_AC_MOD; // red 0x60 vs 0x90
  setCursor(w, 36, 5);
  puts(w, modText, modAttr);
  setCursor(w, 38, 5);
  puts(w, ')', ATTR_AC_LABEL);

  // Row 6: 6 slot icons interleaved with wfont1 separator 0x1c. Each grid slot i
  // maps to body slot i+2 (Magical=2, Head=3, Chest=4, Legs=5, Hands=6, Feet=7);
  // if armor is equipped there the icon is that item's body-slot glyph, else the
  // default wfont0 char 0x79+i.
  for (let i = 0; i < 6; i++) {
    const iconCol = 22 + i * 3;
    const equipped = items.find((it) => it.equippedBodySlot === i + 2);
    const iconChar = equipped ? equipped.iconChar : 0x79 + i;
    setCursor(w, iconCol, 6);
    puts(w, String.fromCharCode(iconChar), ATTR_AC_ICON);
    if (i < 5) {
      setCursor(w, iconCol + 1, 6);
      puts(w, String.fromCharCode(CHROME_AC_ICON_SEP), ATTR_AC_SEP);
    }
  }

  // Row 7: 6 AC values, 2-char right-aligned. grid[0] (Magical) = bodyAc[1] with
  // no fold-in; grid[1..5] (Head..Feet) = bodyAc[2..6] + shieldAc. Value 0 →
  // attr 0x30 (dim); value >0 → attr 0x70.
  for (let i = 0; i < 6; i++) {
    const v = hasBodyAc
      ? (member.bodyAc![i + 1] ?? 0) + (i === 0 ? 0 : shieldAc)
      : (AC_DEFAULTS[i] ?? 0);
    const attr = v === 0 ? ATTR_AC_VALUE_ZERO : ATTR_AC_VALUE_NONZERO;
    setCursor(w, 22 + i * 3, 7);
    puts(w, rpad(v, 2), attr);
  }
}

function drawInventoryList(w: TileWindow, items: ReadonlyArray<InventoryItem>): void {
  for (let i = 0; i < Math.min(items.length, INV_MAX_ROWS); i++) {
    const { name, iconChar, equippedBodySlot } = items[i]!;
    const row = INV_FIRST_ROW + i;
    const equipped = equippedBodySlot != null;
    // Left-margin marker: ✓ (0x17) for an equipped item, else blank — both attr 0x40.
    setCursor(w, INV_NAME_COL - 1, row);
    puts(w, equipped ? String.fromCharCode(INV_CHECK_CHAR) : ' ', ATTR_INV_MARGIN);
    // Item name. Equipped weapon/off-hand (body 0,1) → attr 0x60; equipped worn
    // armor (body 2..7) → attr 0x70; carried-but-not-equipped → attr 0x90.
    const nameAttr = !equipped
      ? ATTR_INV_NAME
      : equippedBodySlot <= 1
        ? ATTR_INV_NAME_HAND
        : ATTR_INV_NAME_WORN;
    const namePart = name.slice(0, INV_NAME_WIDTH);
    setCursor(w, INV_NAME_COL, row);
    puts(w, namePart, nameAttr);
    // Trailing padding at attr 0x10 from name end to col 36.
    const padCount = INV_NAME_WIDTH - namePart.length;
    if (padCount > 0) {
      setCursor(w, INV_NAME_COL + namePart.length, row);
      puts(w, ' '.repeat(padCount), ATTR_INV_PAD);
    }
    // Body-slot icon at col 38 attr 0x04 (wfont0 highlight).
    setCursor(w, INV_ICON_COL, row);
    puts(w, String.fromCharCode(iconChar), ATTR_INV_ICON);
  }
}

function drawSchoolManaGrid(w: TileWindow, member: ActivePartyMember): void {
  // Each school cell: icon at col {1 or 11}, current at col {5 or 15}, slash
  // at col {6 or 16}, max at col {9 or 19}. Rows 14, 16, 18 hold the three
  // pairs (left col schools 0/1/2, right col schools 3/4/5). Separator
  // rows 15 + 17 are chrome (wfont1) and are deferred to a future slice.
  const rows = [14, 16, 18];
  for (let i = 0; i < 6; i++) {
    const row = rows[i % 3]!;
    const isLeft = i < 3;
    const iconCol = isLeft ? 1 : 11;
    const curCol = isLeft ? 5 : 15;
    const slashCol = isLeft ? 6 : 16;
    const maxCol = isLeft ? 9 : 19;
    const valueAttr = SCHOOL_VALUE_ATTRS[i]!;
    const iconChar = SCHOOL_ICON_CHARS[i]!;

    setCursor(w, iconCol, row);
    puts(w, String.fromCharCode(iconChar), ATTR_SCHOOL_ICON);
    setCursor(w, curCol, row);
    puts(w, String(member.schoolMana[i] ?? 0), valueAttr);
    setCursor(w, slashCol, row);
    puts(w, '/', ATTR_MANA_SLASH);
    setCursor(w, maxCol, row);
    puts(w, String(member.schoolManaMax[i] ?? 0), valueAttr);
  }
}

export function composeMainPanel(view: MainPanelView): TileWindow {
  const w = createTileWindow({
    screenX: PANEL_X,
    screenY: PANEL_Y,
    widthCells: PANEL_W,
    heightCells: PANEL_H,
  });
  clearWindow(w, 0x20, ATTR_BG);
  drawBackgroundExtras(w);
  drawChrome(w);
  drawPortraitTiles(w);
  if (view.age) drawAgeFields(w, view.age);
  drawHeader(w, view.member, view.db);
  drawStatsColumn(w, view.member);
  drawHpStmCndGpCc(w, view.member);
  drawCcValues(w, view.cc);
  const inventory = view.inventory ?? [];
  drawArmorClass(w, view.member, inventory);
  drawInventoryList(w, inventory);
  drawSchoolManaGrid(w, view.member);
  return w;
}
