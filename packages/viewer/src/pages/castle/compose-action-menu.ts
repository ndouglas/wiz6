/**
 * composeActionMenu — WPCVW state-0x11 action menu (40×4 @ x=0, y=20).
 *
 * The engine's ui_menu_picker_grid renders enabled actions packed column-major
 * into a grid. Picker args at view-loop entry: `(x_base=2, y_base=1, x_step=6,
 * cols=2, attr=5, msg_base=0x12d=301)`. Decoded from save 2's bottom 40×4
 * window at file offset 0x1fd5a:
 *
 *   row 1:  "  EQUIP ASSAY SKILL"
 *   row 2:  "  SPELL SWAG  EXIT"   (EXIT highlighted on cursor)
 *
 * Under the camp context mask (`*0x4fce == 4`) only 6 of the 11 actions are
 * enabled: EQUIP / SPELL / ASSAY / SWAG / SKILL + EXIT (msg ids 301/302/304/
 * 305/309 + 312). The picker packs them column-major into a 3-col × 2-row
 * grid (the engine arg `cols=2` is "max col index", giving 3 columns 0..2).
 *
 * Scaffold renders the camp subset only — context-mask wiring + cursor
 * movement across non-EXIT entries is TODO #042 follow-up.
 *
 * RE: docs/re/findings/wpcvw-character-view-ux.json (view-main-menu-options,
 * view-input-keys). Engine fixture: tools/parity/fixtures/engine/creation-review-member.png.
 */

import { createTileWindow, clearWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import { creationString } from '../roster/creation/messages.js';

const CELL_PX = 8;
const PANEL_W = 40;
const PANEL_H = 5;
const PANEL_X = 0;
const PANEL_Y = 20 * CELL_PX; // 160
const ATTR_BG = 0x03;
const ATTR_HIGHLIGHT = 0x50;
// wfont3 glyph 0x1e is the chrome bottom-border tile: 7 rows of palette[8] gray
// + 1 row of palette[0] black. The engine paints it across the action menu's
// last cell row, giving the strip its characteristic 1-px black baseline.
const CHROME_BOTTOM_BORDER_CHAR = 0x1e;

const ACTION_MSG_BASE = 301;
const ACTION_EXIT_MSG_ID = 312;

const GRID_X_BASE = 2;
const GRID_Y_BASE = 1;
const GRID_X_STEP = 6;
const GRID_Y_STEP = 1;
const GRID_ROWS = 2;

/**
 * Camp context-mask: actions enabled when the character view is opened from
 * the castle (out of combat). Indices into the 11-action set:
 *   0=EQUIP, 1=SPELL, 3=ASSAY, 4=SWAG, 8=SKILL. EXIT is implicit (msg 312).
 *
 * Note this is hardcoded for the scaffold — the engine recomputes the mask
 * each view loop iteration based on gold, inventory count, and party_size.
 * TODO #042 will wire the dynamic mask once we have a fixture for the
 * combat / contextual variants.
 */
const CAMP_ENABLED_INDICES: readonly number[] = [0, 1, 3, 4, 8];

/**
 * Camp context-mask extended with EDIT (action index 9 = msg 310). Used when
 * the character view is opened from the camp's EDIT submenu so the player can
 * still reach EDIT without backing out of the view.
 */
const CAMP_PLUS_EDIT_INDICES: readonly number[] = [0, 1, 3, 4, 8, 9];

export interface ActionMenuView {
  /** Index of the currently-highlighted enabled action. EXIT is the last index. */
  cursorIdx: number;
  db: MessageDb;
  /**
   * When true, append EDIT (msg 310) to the camp action set. Used when the
   * character view is reached via the camp EDIT submenu so the player can
   * re-open EDIT directly from the view. Defaults to false.
   */
  includeEditFromCamp?: boolean;
}

/** Returns the list of (msgId, label) for the enabled actions in order. */
function enabledActions(
  db: MessageDb,
  includeEdit: boolean,
): Array<{ msgId: number; label: string }> {
  const indices = includeEdit ? CAMP_PLUS_EDIT_INDICES : CAMP_ENABLED_INDICES;
  const list = indices.map((i) => {
    const msgId = ACTION_MSG_BASE + i;
    return { msgId, label: creationString(db, msgId) };
  });
  list.push({ msgId: ACTION_EXIT_MSG_ID, label: creationString(db, ACTION_EXIT_MSG_ID) });
  return list;
}

/** Column-major position for the n-th enabled action in the 3×2 grid. */
function gridPosition(packedIdx: number): { x: number; y: number } {
  const col = Math.floor(packedIdx / GRID_ROWS);
  const row = packedIdx % GRID_ROWS;
  return {
    x: GRID_X_BASE + col * GRID_X_STEP,
    y: GRID_Y_BASE + row * GRID_Y_STEP,
  };
}

export function composeActionMenu(view: ActionMenuView): TileWindow {
  const w = createTileWindow({
    screenX: PANEL_X,
    screenY: PANEL_Y,
    widthCells: PANEL_W,
    heightCells: PANEL_H,
  });
  // Menu-style highlights render inverse (black text on coloured bar) — same
  // convention as the wpcmk character-menu bottomBar.
  w.invertHighlight = true;
  clearWindow(w, 0x20, ATTR_BG);

  // Paint the chrome bottom-border row (last cell row) with the gray+1px-black
  // glyph used by the engine to mark the very bottom of the screen.
  for (let cx = 0; cx < PANEL_W; cx++) {
    const idx = ((PANEL_H - 1) * PANEL_W + cx) * 2;
    w.cells[idx] = CHROME_BOTTOM_BORDER_CHAR;
    w.cells[idx + 1] = ATTR_BG;
  }

  const actions = enabledActions(view.db, view.includeEditFromCamp === true);
  for (let i = 0; i < actions.length; i++) {
    const { label } = actions[i]!;
    if (!label) continue;
    const { x, y } = gridPosition(i);
    setCursor(w, x, y);
    puts(w, label, i === view.cursorIdx ? ATTR_HIGHLIGHT : ATTR_BG);
  }

  return w;
}
