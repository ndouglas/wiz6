/**
 * composeInventoryPicker — the engine's `ui_pick_inventory_item` prompt, the
 * reusable "pick a carried item" picker shared by ASSAY / USE / DROP.
 *
 * The picker overlays the normal character-view main panel (rendered first by
 * the caller) with two regions, mirroring compose-equip-picker.ts:
 *
 *   1. A ROW-CURSOR HIGHLIGHT in the carried-item list (rows 9-13). When the
 *      cursor is on an item (cursor < items.length), that item's name renders
 *      inverse (attr 0x50 — black on yellow) over its inventory row, matching
 *      the menu-selection convention (invertHighlight = true). When the cursor
 *      is on NONE (cursor == items.length) no item row is highlighted.
 *
 *   2. A BOTTOM PROMPT BAR replacing the action menu (40×5 at y=20). It reads
 *      "<prompt>   <selection>" where the selection is the cursored item's name
 *      (cursor < items.length) or "NONE" (cursor == items.length), rendered
 *      inverse-highlighted. e.g. "ASSAY WHICH ITEM?   NONE" with NONE on a
 *      yellow bar.
 *
 * The cursor cycles over [items…, NONE] where the NONE/skip index == items.length.
 * The carried-item list is vertical, so Up/Down move the cursor (see
 * nextInventoryCursor). On the initial frame the cursor defaults to NONE.
 */

import { createTileWindow, clearWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';

const CELL_PX = 8;

// ── Bottom prompt bar (40×5 @ y=20 — same geometry as the action menu) ───────
const BAR_W = 40;
const BAR_H = 5;
const BAR_X = 0;
const BAR_Y = 20 * CELL_PX; // 160
const BAR_BG_ATTR = 0x03;          // wfont3 gray strip background (== action menu)
const PROMPT_COL = 2;              // text starts at col 2 (verified vs equip-picker)
const PROMPT_ROW = 1;              // cell row 1 of the 5-row strip (screen row 21)
const PROMPT_TEXT_ATTR = 0x03;     // wfont3 white-on-gray prompt text
const PROMPT_SELECT_ATTR = 0x50;   // font0 inverse highlight (black on yellow)
// Gap between the prompt and the highlighted selection (verified vs fixture:
// prompt occupies cols 2..18, the inverse NONE bar starts at col 20 — one
// space of plain gray strip between them).
const PROMPT_GAP = ' ';
// wfont3 glyph 0x1e is the chrome bottom-border tile (7 gray rows + 1 black) —
// the engine paints it across the strip's last cell row (the screen baseline).
const CHROME_BOTTOM_BORDER_CHAR = 0x1e;
const NONE_LABEL = 'NONE';

// ── Carried-item list geometry (matches compose-main-panel inventory list) ───
const INV_FIRST_ROW = 9;           // inventory row 0 → main-panel cell row 9
const INV_NAME_COL = 22;           // item-name column (cols 22..36)
const INV_NAME_WIDTH = 15;         // inventory name field width
const ROW_HILITE_ATTR = 0x50;      // inverse highlight (black on yellow)

/** A carried item offered by the picker. */
export interface InventoryPickerItem {
  /** Display name (resolved from scenario.dbs items[id].name1). */
  name: string;
}

export interface InventoryPickerView {
  /** Prompt text shown at the left of the bottom bar (e.g. "ASSAY WHICH ITEM?"). */
  prompt: string;
  /** Carried items, in cursor order. */
  items: ReadonlyArray<InventoryPickerItem>;
  /**
   * Cursor over [items…, NONE]. `items.length` selects the NONE/skip position
   * (no item row highlighted, "NONE" shown in the prompt tail).
   */
  cursor: number;
}

/** The prompt-bar selection name: the cursored item's name or "NONE". */
function selectionName(view: InventoryPickerView): string {
  const item = view.items[view.cursor];
  return item ? item.name : NONE_LABEL;
}

function composePromptBar(view: InventoryPickerView): TileWindow {
  const w = createTileWindow({
    screenX: BAR_X,
    screenY: BAR_Y,
    widthCells: BAR_W,
    heightCells: BAR_H,
  });
  // The trailing selection highlight renders inverse (black on a yellow bar) —
  // the menu-cursor convention shared with compose-action-menu.ts.
  w.invertHighlight = true;
  clearWindow(w, 0x20, BAR_BG_ATTR);

  // Chrome bottom-border row (the screen baseline at y=199).
  for (let cx = 0; cx < BAR_W; cx++) {
    const idx = ((BAR_H - 1) * BAR_W + cx) * 2;
    w.cells[idx] = CHROME_BOTTOM_BORDER_CHAR;
    w.cells[idx + 1] = BAR_BG_ATTR;
  }

  setCursor(w, PROMPT_COL, PROMPT_ROW);
  puts(w, view.prompt, PROMPT_TEXT_ATTR);
  setCursor(w, PROMPT_COL + view.prompt.length, PROMPT_ROW);
  puts(w, PROMPT_GAP, PROMPT_TEXT_ATTR);
  setCursor(w, PROMPT_COL + view.prompt.length + PROMPT_GAP.length, PROMPT_ROW);
  puts(w, selectionName(view), PROMPT_SELECT_ATTR);

  return w;
}

/** Highlight the cursored item's row in the carried-item list. When NONE is
 *  cursored there is no item row to mark, so no overlay is drawn. */
function composeRowHighlight(view: InventoryPickerView): TileWindow | null {
  const item = view.items[view.cursor];
  if (!item) return null;

  const row = INV_FIRST_ROW + view.cursor;
  const w = createTileWindow({
    screenX: INV_NAME_COL * CELL_PX,
    screenY: row * CELL_PX,
    widthCells: INV_NAME_WIDTH,
    heightCells: 1,
  });
  // Inverse highlight (black text on a yellow bar) — the menu-selection style.
  w.invertHighlight = true;
  clearWindow(w, 0x20, ROW_HILITE_ATTR);
  setCursor(w, 0, 0);
  puts(w, item.name.slice(0, INV_NAME_WIDTH), ROW_HILITE_ATTR);
  return w;
}

/**
 * Compose the inventory-picker overlay windows (z-order, lowest first). Painted
 * ON TOP of the character-view main panel and REPLACING the action-menu strip:
 *   1. bottom prompt bar
 *   2. row-cursor highlight (omitted when NONE is cursored)
 */
export function composeInventoryPicker(view: InventoryPickerView): TileWindow[] {
  const windows: TileWindow[] = [composePromptBar(view)];
  const highlight = composeRowHighlight(view);
  if (highlight) windows.push(highlight);
  return windows;
}

/**
 * Pure navigation helper for the inventory-item picker's cursor. The cursor
 * runs over [items…, NONE] where the NONE index == itemCount. The carried-item
 * list is vertical, so Up/Down move the cursor; it clamps at both ends.
 */
export function nextInventoryCursor(cursor: number, key: string, itemCount: number): number {
  const max = itemCount; // NONE is at index itemCount
  if (key === 'ArrowDown') return Math.min(max, cursor + 1);
  if (key === 'ArrowUp') return Math.max(0, cursor - 1);
  return cursor;
}
