/**
 * composeSkillViewer — WPCVW camp SKILL action (state 0x11): the READ-ONLY
 * skill-level viewer. RE: docs/re/findings/wpcvw-skill-action.json +
 * wpcvw-skill-names.json; engine fixtures `skill-viewer-{weaponry,physical,
 * academia}` (THESUS).
 *
 * Layout (verified vs the captured fixtures):
 *   - The right-half SKILL PANEL (20×16 @ col 20, row 4) is the SAME window as
 *     the creation SKILL-TRAIN screen — reused via `composeSkillPanelWindow`.
 *     It covers the char view's AC grid + inventory list. Per-category name
 *     colors + the "SKILL POINTS" line come for free. The viewer is read-only,
 *     so there is NO selection cursor (cursorState 'none').
 *   - The DYNAMIC tab picker replaces the action-menu strip (40×5 @ y=160):
 *     the available categories MINUS the current one, then EXIT (msg 604),
 *     packed column-major into a 2-row grid (x_base=2, x_step=10), cursor
 *     highlighted inverse (attr 0x50). Entries come from the reducer's
 *     `skillTabEntries`. RE picker args: x=2,y=1,xstep=0xa,cols=2,msg_base=600.
 *
 * These windows OVERLAY a `composeMainPanel` char sheet (the caller renders
 * that first, then drops these on top).
 */

import { createTileWindow, clearWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import { composeSkillPanelWindow } from '../roster/creation/ega/skill-train-frame.js';
import { creationString } from '../roster/creation/messages.js';
import { SKILL_EXIT } from './character-view-reducer.js';

const CELL_PX = 8;

// ── Tab-picker strip (same region/idiom as the action menu) ──────────────────
const STRIP_W = 40;
const STRIP_H = 5;
const STRIP_Y = 20 * CELL_PX; // 160
const ATTR_BG = 0x03;
const ATTR_HIGHLIGHT = 0x50; // inverse (black-on-bar) cursor, like the action menu
const CHROME_BOTTOM_BORDER_CHAR = 0x1e; // wfont3 gray + 1px-black baseline
const TAB_X_BASE = 2;
const TAB_Y_BASE = 1;
const TAB_X_STEP = 10; // RE picker arg xstep=0xa (wider than the 6-step action menu)
const TAB_ROWS = 2;

const CATEGORY_MSG_BASE = 600; // 600=WEAPONRY,601=PHYSICAL,602=PERSONAL,603=ACADEMIA
const EXIT_MSG_ID = 604;

/** One displayed skill row: slot, resolved name, and level (0..50). */
export interface SkillViewerRow {
  slot: number;
  name: string;
  level: number;
}

export interface SkillViewerView {
  /** Displayed category (0..3). */
  category: number;
  /** Visible skill rows for `category`, in slot order (name pre-resolved). */
  rows: ReadonlyArray<SkillViewerRow>;
  /** "SKILL POINTS" footer value (record +0x4590). */
  skillPoints: number;
  /** Dynamic tab-picker entries (category indices + SKILL_EXIT), in display order. */
  tabEntries: ReadonlyArray<number>;
  /** Cursor index into `tabEntries`. */
  cursor: number;
  db: MessageDb;
}

function composeTabStrip(view: SkillViewerView): TileWindow {
  const w = createTileWindow({
    screenX: 0,
    screenY: STRIP_Y,
    widthCells: STRIP_W,
    heightCells: STRIP_H,
  });
  // Inverse highlight (black text on a coloured bar) — same as the action menu.
  w.invertHighlight = true;
  clearWindow(w, 0x20, ATTR_BG);

  // Chrome bottom-border row (the screen's 1-px black baseline at y=199).
  for (let cx = 0; cx < STRIP_W; cx++) {
    const idx = ((STRIP_H - 1) * STRIP_W + cx) * 2;
    w.cells[idx] = CHROME_BOTTOM_BORDER_CHAR;
    w.cells[idx + 1] = ATTR_BG;
  }

  for (let i = 0; i < view.tabEntries.length; i++) {
    const entry = view.tabEntries[i]!;
    const label =
      entry === SKILL_EXIT
        ? creationString(view.db, EXIT_MSG_ID)
        : creationString(view.db, CATEGORY_MSG_BASE + entry);
    if (!label) continue;
    const col = Math.floor(i / TAB_ROWS);
    const row = i % TAB_ROWS;
    setCursor(w, TAB_X_BASE + col * TAB_X_STEP, TAB_Y_BASE + row);
    puts(w, label, i === view.cursor ? ATTR_HIGHLIGHT : ATTR_BG);
  }

  return w;
}

/**
 * Compose the SKILL-viewer overlay windows (z-order, lowest first), painted ON
 * TOP of the character-view main panel and REPLACING the action menu:
 *   1. the 20×16 skill panel (right half) — category title + skill rows + points
 *   2. the dynamic category-tab picker strip (bottom)
 */
export function composeSkillViewer(view: SkillViewerView): TileWindow[] {
  const panel = composeSkillPanelWindow({
    categoryIdx: view.category,
    rows: view.rows.map((r) => ({ slot: r.slot, name: r.name, value: r.level })),
    skillPoints: view.skillPoints,
    cursorIdx: -1, // read-only: no selection cursor
    cursorState: 'none',
    db: view.db,
  });
  return [panel, composeTabStrip(view)];
}
