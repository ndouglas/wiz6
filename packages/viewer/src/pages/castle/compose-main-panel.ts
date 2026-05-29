/**
 * composeMainPanel — WPCVW full-screen main panel (40×20 @ x=0, y=0).
 *
 * Engine reference: the main panel hosts the character sheet: stats column
 * (STR..KAR + HP/STM/CND/GP/CC), portrait, race/class/sex header, ARMORCLASS
 * sub-panel, and the inventory list. RE'd directly from save 2's
 * cell-grid dump (40×20 window at struct offset 0x1f704 in tools/dosbox/save/2.sav).
 *
 * The action menu does NOT live here — the engine renders it in a SEPARATE
 * 40×4 window at y=20 (handled by compose-action-menu.ts). This composer
 * was earlier (incorrectly) rendering the action menu in this panel; that
 * has been removed.
 *
 * Scaffold: returns an empty 40×20 window cleared to (char=0x20, attr=0x03).
 * Stats / portrait / inventory / armorclass rendering is TODO #044 — needs
 * derived AC + HP/SP from the character record, plus the wpcvw inventory
 * subsystem. Until then, the main panel is intentionally blank so the action
 * menu (now at y=20) is the only visible foreground element.
 */

import { createTileWindow, clearWindow, type TileWindow } from '@wiz6/parser';

const PANEL_W = 40;
const PANEL_H = 20;
const PANEL_X = 0;
const PANEL_Y = 0;
const ATTR_BG = 0x03;

export interface MainPanelView {
  // Intentionally empty. Future Phase B work (TODO #044) will add the
  // character-record fields needed to render stats + inventory here.
}

export function composeMainPanel(_view: MainPanelView): TileWindow {
  void _view;
  const w = createTileWindow({
    screenX: PANEL_X,
    screenY: PANEL_Y,
    widthCells: PANEL_W,
    heightCells: PANEL_H,
  });
  clearWindow(w, 0x20, ATTR_BG);
  return w;
}
