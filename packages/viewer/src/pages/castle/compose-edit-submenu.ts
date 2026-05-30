/**
 * composeEditSubmenu — WPCVW EDIT submenu (option 9 in the main action menu).
 *
 * Engine reference: wpcvw_edit_submenu @ wpcvw.ovr 0x671f. 5 entries
 * (msg 650..654: RENAME / CHANGE PORTRAIT / CHANGE PROFESSION / REPLACE / EX).
 * REPLACE (index 3) is ALWAYS force-disabled by the engine. Picker geometry
 * from finding `edit-submenu-options`: x_base=2, y_base=1, x_step=0x12=18,
 * cols=2 (≡ max-col-index, so columns 0..2), attr=5, msg_base=0x28a=650.
 *
 * Column-major fill (engine order):
 *   idx 0 (RENAME)         → col 2,  row 1
 *   idx 1 (CHANGE PORTRAIT)→ col 2,  row 2
 *   idx 2 (CHANGE PROFESSION) → col 20, row 1
 *   idx 3 (REPLACE — disabled) → col 20, row 2
 *   idx 4 (EX)             → col 38, row 1
 *
 * Hosted in the wpcvw main panel (40×20 at x=0, y=0). Caller composes the
 * full character-view frame; this composer produces only the submenu overlay
 * cells (it does not clear the panel — caller already drew the character
 * sheet underneath).
 *
 * Spec: docs/superpowers/specs/2026-05-29-wpcvw-edit-submenu-design.md
 */

import { createTileWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import { creationString } from '../roster/creation/messages.js';

const PANEL_W = 40;
const PANEL_H = 20;
const PANEL_X = 0;
const PANEL_Y = 0;

const SUBMENU_MSG_BASE = 650;
const REPLACE_INDEX = 3;
const ENTRY_COUNT = 5;

const ATTR_ENABLED = 0x05;
const ATTR_DISABLED = 0x07; // dimmed gray — confirm against engine fixture (TODO #057)
const ATTR_HIGHLIGHT = 0x50;

const X_BASE = 2;
const Y_BASE = 1;
const X_STEP = 0x12; // 18
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
    puts(w, label, attr);
  }

  return w;
}
