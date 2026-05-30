/**
 * composePortraitChange — WPCVW EDIT/CHANGE PORTRAIT screen.
 *
 * Engine reference: wpcvw_change_portrait (formerly misnamed
 * wpcvw_identify_shop_or_temple) @ wpcvw.ovr 0x63bc. Creates a sub-window
 * at (x=0x14, y=4, w=0x14, h=0x10, attr=0x1e), draws a 3×3 portrait
 * preview at chars 0x48..0x50, and shows two prompts:
 *   - msg 0x458 ("◄► TO REVIEW PORTRAITS") at row 9
 *   - msg 0x459 ("PRESS ▶ TO SELECT") at row 12
 *
 * The composer renders the static layout. The active portrait is supplied
 * via a font-set patch elsewhere — chars 0x48..0x50 in the font sheet
 * get swapped to the previewed portrait between renders.
 *
 * Spec: docs/superpowers/specs/2026-05-29-wpcvw-edit-submenu-design.md
 */

import { createTileWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import { creationString } from '../roster/creation/messages.js';

const CELL_PX = 8;
const WIN_X = 20 * CELL_PX;
const WIN_Y = 4 * CELL_PX;
const WIN_W = 20;
const WIN_H = 16;

const PORTRAIT_GLYPH_BASE = 0x48;
const PORTRAIT_CELL_X = 8;
const PORTRAIT_CELL_Y = 3;
const ATTR_PORTRAIT = 0x02;
const ATTR_PROMPT = 0x03;

const MSG_REVIEW = 0x458;
const MSG_SELECT = 0x459;
const ROW_REVIEW = 9;
const ROW_SELECT = 12;

export interface PortraitChangeView {
  /** 0..41 — current portrait being previewed. */
  previewIdx: number;
  db: MessageDb;
}

export function composePortraitChange(view: PortraitChangeView): TileWindow {
  const w = createTileWindow({
    screenX: WIN_X,
    screenY: WIN_Y,
    widthCells: WIN_W,
    heightCells: WIN_H,
  });
  void view.previewIdx; // Used by caller's font-patch; layout is static.

  for (let r = 0; r < 3; r++) {
    setCursor(w, PORTRAIT_CELL_X, PORTRAIT_CELL_Y + r);
    for (let c = 0; c < 3; c++) {
      puts(w, String.fromCharCode(PORTRAIT_GLYPH_BASE + r * 3 + c), ATTR_PORTRAIT);
    }
  }

  const review = creationString(view.db, MSG_REVIEW);
  setCursor(w, Math.max(1, Math.floor((WIN_W - review.length) / 2)), ROW_REVIEW);
  puts(w, review, ATTR_PROMPT);

  const select = creationString(view.db, MSG_SELECT);
  setCursor(w, Math.max(1, Math.floor((WIN_W - select.length) / 2)), ROW_SELECT);
  puts(w, select, ATTR_PROMPT);

  return w;
}
