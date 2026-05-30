/**
 * composeEditSubmenuInto — WPCVW EDIT submenu (option 9 in the main action menu).
 *
 * Engine reference: wpcvw_edit_submenu @ wpcvw.ovr 0x671f. 5 entries
 * (msg 650..654: RENAME / CHANGE PORTRAIT / CHANGE PROFESSION / REPLACE / EX).
 * REPLACE (index 3) is ALWAYS force-disabled by the engine. Picker geometry
 * from finding `edit-submenu-options`: x_base=2, y_base=1, x_step=0x12=18,
 * cols=2 (≡ max-col-index, so columns 0..2), msg_base=0x28a=650.
 *
 * Column-major fill (engine order):
 *   idx 0 (RENAME)         → col 2,  row 1
 *   idx 1 (CHANGE PORTRAIT)→ col 2,  row 2
 *   idx 2 (CHANGE PROFESSION) → col 20, row 1
 *   idx 3 (REPLACE — disabled) → col 20, row 2
 *   idx 4 (EX)             → col 38, row 1
 *
 * Engine-faithful behavior: the engine picker writes labels directly INTO
 * the picker host window (the main panel) rather than opening a fresh
 * overlay. We do the same — the composer mutates the supplied main-panel
 * TileWindow in place. The character sheet drawn underneath remains
 * visible at every cell the picker does not write to.
 *
 * Caller is responsible for setting `mainPanel.invertHighlight = true`
 * before the picker is composed in (or for the duration of the picker
 * state) so the cursor highlight renders as inverse (black-on-yellow).
 *
 * Spec: docs/superpowers/specs/2026-05-29-wpcvw-edit-submenu-design.md
 */

import { setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import { creationString } from '../roster/creation/messages.js';

const SUBMENU_MSG_BASE = 650;
const REPLACE_INDEX = 3;
const ENTRY_COUNT = 5;

// Engine picker writes labels into the host window via wfont3 (gray text).
const ATTR_ENABLED = 0x03; // wfont3 → gray text on whatever's underneath
const ATTR_DISABLED = 0x70; // highlight path, bg=palette[7] light gray, stroke=palette[0] black → "dimmed"
const ATTR_HIGHLIGHT = 0x50; // highlight path, bg=palette[5] yellow, stroke=palette[0] → cursor

const X_BASE = 2;
const Y_BASE = 1;
const X_STEP = 0x12; // 18 — engine's x_step for the picker
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

/**
 * Write the WPCVW EDIT submenu labels INTO the given main panel window,
 * matching the engine's picker behavior of mutating the host window's
 * cells rather than overlaying a new window.
 *
 * Engine ref: wpcvw_edit_submenu @ wpcvw 0x671f.
 */
export function composeEditSubmenuInto(mainPanel: TileWindow, view: EditSubmenuView): void {
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
    // Pad the label to fill its picker slot — clears any underlying
    // char-sheet content in the gap between entries. The last entry (EX)
    // sits at the screen edge with only 2 cells available; clamp padding
    // to whatever fits before the window's right edge.
    const maxWidth = mainPanel.widthCells - x;
    const slotWidth = Math.min(X_STEP, maxWidth);
    const padded = label.padEnd(slotWidth);
    setCursor(mainPanel, x, y);
    puts(mainPanel, padded, attr);
  }
}
