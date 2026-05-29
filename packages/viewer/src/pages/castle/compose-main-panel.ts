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
const ATTR_BG = 0x03;
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

export interface MainPanelView {
  member: ActivePartyMember;
  db: MessageDb;
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
  // at cols 17-19. Carrying capacity is a derived field not on the schema;
  // scaffold renders "  0/  0" until the derivation lands (TODO follow-up).
  setCursor(w, 10, 12);
  puts(w, 'CC', ATTR_CC_LABEL);
  setCursor(w, 13, 12);
  puts(w, '  0', ATTR_CC_VALUE);
  setCursor(w, 16, 12);
  puts(w, '/', ATTR_CC_LABEL);
  setCursor(w, 17, 12);
  puts(w, '  0', ATTR_CC_VALUE);
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

export function composeMainPanel(view: MainPanelView): TileWindow {
  const w = createTileWindow({
    screenX: PANEL_X,
    screenY: PANEL_Y,
    widthCells: PANEL_W,
    heightCells: PANEL_H,
  });
  clearWindow(w, 0x20, ATTR_BG);
  drawHeader(w, view.member, view.db);
  drawStatsColumn(w, view.member);
  drawHpStmCndGpCc(w, view.member);
  return w;
}
