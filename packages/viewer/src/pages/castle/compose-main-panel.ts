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
import type { ActivePartyMember } from '@wiz6/data';

const PANEL_W = 40;
const PANEL_H = 20;
const PANEL_X = 0;
const PANEL_Y = 0;
const ATTR_BG = 0x03;
const ATTR_STAT_LABEL = 0x50; // palette[5] = yellow stroke on black (colored highlight)
const ATTR_STAT_VALUE = 0x10; // palette[1] = white stroke on black

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
}

export function composeMainPanel(view: MainPanelView): TileWindow {
  const w = createTileWindow({
    screenX: PANEL_X,
    screenY: PANEL_Y,
    widthCells: PANEL_W,
    heightCells: PANEL_H,
  });
  clearWindow(w, 0x20, ATTR_BG);

  for (let i = 0; i < STAT_LABELS.length; i++) {
    const { label, value } = STAT_LABELS[i]!;
    const row = STATS_FIRST_ROW + i;
    setCursor(w, STATS_LABEL_COL, row);
    puts(w, label, ATTR_STAT_LABEL);
    const valueStr = String(value(view.member)).padStart(STATS_VALUE_WIDTH, ' ');
    setCursor(w, STATS_VALUE_COL, row);
    puts(w, valueStr, ATTR_STAT_VALUE);
  }

  return w;
}
