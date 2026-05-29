/**
 * composeMainPanel — WPCVW full-screen main panel (40×20 @ x=0, y=0).
 *
 * Engine reference: ui_render_inventory_panel @ wpcvw 0x6c81 + the 11-action
 * picker grid at file 0x6b8a. See docs/re/findings/wpcvw-character-view-ux.json
 * findings for action-menu layout and disable-mask semantics.
 *
 * Scaffold renders the 12-entry action menu (EQUIP..REVIEW + EXIT) as a 2×6
 * grid in the panel's lower half. Inventory grid rendering is deferred to a
 * follow-up sub-project. All non-EXIT entries render at the disabled attr
 * (0x07) per the scaffold spec; EXIT renders at the cursor's highlight attr
 * (0x50) when cursorIdx == 11.
 */

import { createTileWindow, clearWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import { creationString } from '../roster/creation/messages.js';

const PANEL_W = 40;
const PANEL_H = 20;
const PANEL_X = 0;
const PANEL_Y = 0;
const ATTR_BG = 0x03;
const ATTR_DISABLED = 0x07;
const ATTR_HIGHLIGHT = 0x50;

const ACTION_MSG_BASE = 301;
const ACTION_COUNT = 12; // 11 actions + EXIT

const GRID_X_BASE = 2;
const GRID_Y_BASE = 13; // bottom half of the main panel
const GRID_X_STEP = 8;
const GRID_Y_STEP = 1;

export interface MainPanelView {
  /** Index of the focused action 0..11. EXIT is index 11. */
  cursorIdx: number;
  db: MessageDb;
}

function actionPosition(idx: number): { x: number; y: number } {
  return {
    x: GRID_X_BASE + (idx % 2) * GRID_X_STEP,
    y: GRID_Y_BASE + Math.floor(idx / 2) * GRID_Y_STEP,
  };
}

export function composeMainPanel(view: MainPanelView): TileWindow {
  const w = createTileWindow({
    screenX: PANEL_X,
    screenY: PANEL_Y,
    widthCells: PANEL_W,
    heightCells: PANEL_H,
  });
  clearWindow(w, 0x20, ATTR_BG);

  for (let idx = 0; idx < ACTION_COUNT; idx++) {
    const label = creationString(view.db, ACTION_MSG_BASE + idx);
    if (!label) continue;
    const { x, y } = actionPosition(idx);
    setCursor(w, x, y);
    // Scaffold rule: only EXIT (idx 11) is enabled. Cursor highlight only
    // applies to the focused entry.
    let attr: number;
    if (idx === view.cursorIdx) {
      attr = ATTR_HIGHLIGHT;
    } else if (idx === 11) {
      // EXIT not focused but still drawn at normal attr (it's the only enabled action).
      attr = ATTR_BG;
    } else {
      attr = ATTR_DISABLED;
    }
    puts(w, label, attr);
  }

  return w;
}
