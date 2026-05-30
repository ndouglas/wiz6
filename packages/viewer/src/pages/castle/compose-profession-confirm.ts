/**
 * composeProfessionConfirm — yes/no warning before applying the class-change tax.
 *
 * The engine likely shows an engine-string warning here; without a captured
 * fixture we use a port-internal English string. NO is highlighted by default
 * (destructive defaults). The reducer maps Y/Enter-on-YES to apply, anything
 * else to cancel.
 *
 * Spec: docs/superpowers/specs/2026-05-29-wpcvw-edit-submenu-design.md
 */

import { createTileWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';

const PANEL_W = 28;
const PANEL_H = 7;
const SCREEN_X = ((40 - PANEL_W) / 2) * 8;
const SCREEN_Y = ((20 - PANEL_H) / 2) * 8;
const ATTR_BG = 0x03;
const ATTR_HIGHLIGHT = 0x50;

const WARNING_LINES = [
  'CONFIRM CLASS CHANGE',
  'WIPES XP AND RESETS',
  'LEVEL TO 1.',
];

export interface ProfessionConfirmView {
  /** True → YES is highlighted; false → NO is highlighted (engine default). */
  cursorYes: boolean;
}

export function composeProfessionConfirm(view: ProfessionConfirmView): TileWindow {
  const w = createTileWindow({
    screenX: SCREEN_X,
    screenY: SCREEN_Y,
    widthCells: PANEL_W,
    heightCells: PANEL_H,
  });
  w.invertHighlight = true;

  for (let i = 0; i < WARNING_LINES.length; i++) {
    const line = WARNING_LINES[i]!;
    setCursor(w, Math.max(1, Math.floor((PANEL_W - line.length) / 2)), 1 + i);
    puts(w, line, ATTR_BG);
  }

  const yesCol = Math.floor(PANEL_W / 4) - 1;
  const noCol = Math.floor((3 * PANEL_W) / 4) - 1;
  const choicesRow = 5;
  setCursor(w, yesCol, choicesRow);
  puts(w, 'YES', view.cursorYes ? ATTR_HIGHLIGHT : ATTR_BG);
  setCursor(w, noCol, choicesRow);
  puts(w, 'NO', !view.cursorYes ? ATTR_HIGHLIGHT : ATTR_BG);

  return w;
}
