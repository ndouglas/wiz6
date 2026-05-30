/**
 * composeEditSubmenu — WPCVW EDIT submenu (option 9 in the main action menu).
 *
 * Replaces the bottom action-menu strip when the user is in the EDIT
 * submenu state. Mirrors the bottom-strip layout convention used by
 * `composeActionMenu` (40×5 at y=20), with the same gray wfont3
 * background and inverse-highlight cursor.
 *
 * Engine reference: wpcvw_edit_submenu @ wpcvw.ovr 0x671f. 5 entries
 * (msg 650..654: RENAME / CHANGE PORTRAIT / CHANGE PROFESSION / REPLACE / EX).
 * REPLACE (index 3) is ALWAYS force-disabled by the engine. Picker geometry
 * from finding `edit-submenu-options`: x_base=2, y_base=1, x_step=0x12=18,
 * cols=2 (≡ max-col-index, so columns 0..2). NOTE: in the engine the picker
 * is hosted in the main panel; we adapt it to the bottom-strip position
 * to fit our scaffold's existing layout where the main action menu lives
 * in the bottom strip too.
 *
 * Spec: docs/superpowers/specs/2026-05-29-wpcvw-edit-submenu-design.md
 */

import { createTileWindow, clearWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import { creationString } from '../roster/creation/messages.js';

const CELL_PX = 8;
const PANEL_W = 40;
const PANEL_H = 5;
const PANEL_X = 0;
const PANEL_Y = 20 * CELL_PX; // 160 — same as action menu
const ATTR_BG = 0x03;
const ATTR_ENABLED = 0x03;
const ATTR_DISABLED = 0x70;
const ATTR_HIGHLIGHT = 0x50;
// wfont3 glyph 0x1e is the chrome bottom-border tile, used by the action
// menu for its 1-pixel black baseline at row 199. Mirror that here.
const CHROME_BOTTOM_BORDER_CHAR = 0x1e;

const SUBMENU_MSG_BASE = 650;
const REPLACE_INDEX = 3;
const ENTRY_COUNT = 5;

const X_BASE = 2;
const Y_BASE = 1;
const X_STEP = 18; // 0x12
const ROWS = 2;

export interface EditSubmenuView {
  /** Packed cursor index 0..4 into the 5 entries (REPLACE skipped by reducer). */
  cursorIdx: number;
  db: MessageDb;
}

function gridPosition(entryIdx: number): { x: number; y: number } {
  const col = Math.floor(entryIdx / ROWS);
  const row = entryIdx % ROWS;
  return { x: X_BASE + col * X_STEP, y: Y_BASE + row };
}

export function composeEditSubmenu(view: EditSubmenuView): TileWindow {
  const w = createTileWindow({
    screenX: PANEL_X,
    screenY: PANEL_Y,
    widthCells: PANEL_W,
    heightCells: PANEL_H,
  });
  w.invertHighlight = true;
  clearWindow(w, 0x20, ATTR_BG);

  // Chrome baseline row (matches the action menu strip).
  for (let cx = 0; cx < PANEL_W; cx++) {
    const idx = ((PANEL_H - 1) * PANEL_W + cx) * 2;
    w.cells[idx] = CHROME_BOTTOM_BORDER_CHAR;
    w.cells[idx + 1] = ATTR_BG;
  }

  for (let i = 0; i < ENTRY_COUNT; i++) {
    const msgId = SUBMENU_MSG_BASE + i;
    const label = creationString(view.db, msgId);
    if (!label) continue;
    const { x, y } = gridPosition(i);
    const attr =
      i === REPLACE_INDEX
        ? ATTR_DISABLED
        : i === view.cursorIdx
          ? ATTR_HIGHLIGHT
          : ATTR_ENABLED;
    setCursor(w, x, y);
    // Pad the label to its picker slot width so the highlighted/disabled bar
    // is uniform; clamp to the panel's right edge for the last entry (EX).
    const maxWidth = PANEL_W - x;
    const slotWidth = Math.min(X_STEP, maxWidth);
    puts(w, label.padEnd(slotWidth), attr);
  }

  return w;
}
