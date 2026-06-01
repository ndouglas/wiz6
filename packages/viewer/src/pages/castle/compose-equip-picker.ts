/**
 * composeEquipPicker — WPCVW state-0x11 EQUIP slot-picker overlay.
 *
 * The EQUIP action turns the character view into a per-body-slot re-equip
 * wizard (RE: docs/re/findings/wpcvw-equip-action.json). For the slot being
 * filled, the engine overlays the normal character sheet with two things:
 *
 *   1. A CANDIDATE-ROW HIGHLIGHT in the inventory list. FUN_8dcd (wpcvw 0x8dcd,
 *      #equip-item-label-highlight-helper) draws a row-cursor "▸" marker at
 *      col 0x15 (21) and the cursored candidate's name at col 0x16 (22), row
 *      `candidate+9` (i.e. into the inventory-list region). Verified from the
 *      committed `equip-slot0` fixture: the marker is a font0 `>` glyph in
 *      palette[5] (yellow) and the name is font0 colored text in palette[4].
 *
 *   2. A BOTTOM PROMPT BAR replacing the action menu (40×5 at y=20). It reads
 *      `SELECT <SLOT TITLE> > <current candidate name | NONE>` — msg 0x3b
 *      ("SELECT $ >") formatted with the per-slot title (msg 0x3c..0x43) plus
 *      the current selection. The prompt text is plain wfont3 (attr 0x03,
 *      white-on-gray) and the trailing selection is highlighted (attr 0x50,
 *      inverse — black on yellow).
 *
 * Slot titles come from the engine msg table: 0x3c PRIMARY WEAPON, 0x3d
 * SECONDARY ITEM, 0x3e MISC. ITEM, 0x3f HELMET, 0x40 BODY ARMOR, 0x41 LEG
 * ARMOR, 0x42 GAUNTLETS, 0x43 BOOTS (body slots 0..7). "NONE" is msg 0x44.
 *
 * The returned windows OVERLAY a frame composed by composeCharacterViewFrame:
 * render that frame's main panel first, then drop the action-menu strip and
 * paint these on top (the candidate-row highlight + the prompt bar).
 */

import { createTileWindow, clearWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import { creationString } from '../roster/creation/messages.js';

const CELL_PX = 8;

// ── Bottom prompt bar (40×5 @ y=20 — same geometry as the action menu) ───────
const BAR_W = 40;
const BAR_H = 5;
const BAR_X = 0;
const BAR_Y = 20 * CELL_PX; // 160
const BAR_BG_ATTR = 0x03;          // wfont3 gray strip background (== action menu)
const PROMPT_COL = 2;              // text starts at col 2 (verified vs fixture)
const PROMPT_ROW = 1;              // cell row 1 of the 5-row strip (screen row 21)
const PROMPT_TEXT_ATTR = 0x03;     // wfont3 white-on-gray prompt text
const PROMPT_SELECT_ATTR = 0x50;   // font0 inverse highlight (black on yellow)
// wfont3 glyph 0x1e is the chrome bottom-border tile (7 gray rows + 1 black) —
// the engine paints it across the strip's last cell row (the screen baseline).
const CHROME_BOTTOM_BORDER_CHAR = 0x1e;

// ── Candidate-row highlight (overlays the inventory list region) ─────────────
const HILITE_W = 16;               // cols 21..36 (marker + 15-char name field) — NOT col 37 (chrome)
const HILITE_H = 1;
const INV_FIRST_ROW = 9;           // inventory row 0 → main-panel cell row 9
const MARKER_COL = 21;             // FUN_8dcd row-cursor marker column (0x15)
const NAME_COL = 22;               // FUN_8dcd candidate-name column (0x16)
const NAME_WIDTH = 15;             // inventory name field width (cols 22..36)
const MARKER_CHAR = 0x64;          // font0 row-cursor arrow glyph (filled ▸ triangle)
const MARKER_ATTR = 0x50;          // font0 colored: stroke = palette[5] (yellow)
const NAME_ATTR = 0x40;            // font0 colored: stroke = palette[4]

// ── Message ids ──────────────────────────────────────────────────────────────
const MSG_SELECT_TEMPLATE = 0x3b;  // "SELECT $ >"
const MSG_SLOT_TITLE_BASE = 0x3c;  // body slot 0 → 0x3c PRIMARY WEAPON
const MSG_NONE = 0x44;             // "NONE"

/** A candidate item offered for the slot being filled. */
export interface EquipCandidate {
  /** Display name (resolved from scenario.dbs items[id].name1). */
  name: string;
}

export interface EquipPickerView {
  db: MessageDb;
  /** Body slot 0..7 being filled (selects the slot-title message). */
  bodySlot: number;
  /**
   * Slot title text override. When provided it is used verbatim in the prompt
   * instead of the msg-table lookup (useful for tests / unresolved slots).
   */
  slotTitle?: string;
  /** Candidate items eligible for this slot, in cursor order. */
  candidates: ReadonlyArray<EquipCandidate>;
  /**
   * Row-cursor over `candidates`: which candidate's inventory row gets the
   * "▸" marker + colored-name highlight. `-1` (or out of range) = no row
   * highlighted (the SKIP/empty position). On entry the engine highlights the
   * first candidate (cursor 0) even while the committed selection is still
   * NONE — the row-cursor and the committed selection are independent.
   */
  cursor: number;
  /**
   * Committed selection shown in the prompt bar's highlighted tail. `null`
   * renders "NONE" (msg 0x44 — the empty/skip selection). When set to a
   * candidate index it shows that candidate's name. Defaults to `null`.
   */
  selection?: number | null;
}

/** Format msg 0x3b "SELECT $ >" with the slot title substituted for "$". */
function formatPrompt(db: MessageDb, slotTitle: string): string {
  const template = creationString(db, MSG_SELECT_TEMPLATE) || 'SELECT $ >';
  return template.replace('$', slotTitle);
}

/**
 * Body-slot title for the prompt: PRIMARY WEAPON / SECONDARY ITEM / MISC. ITEM
 * / HELMET / BODY ARMOR / LEG ARMOR / GAUNTLETS / BOOTS (body slots 0..7).
 *
 * TODO(#equip-wiring): source these from msg.dbs. The msg ids ARE known
 * (0x3c..0x43, the SELECT template is 0x3b, NONE is 0x44 — verified vs
 * extracted/messages/msg.json `records`), but `creationString` reads
 * `db.indexedMessages`, where these low-index strings are NOT present. Until a
 * raw-record accessor exists, callers should pass `view.slotTitle` (and the
 * SELECT template / NONE are hardcoded in formatPrompt / currentSelectionName
 * to match the engine). The pixel-parity test is the gate.
 */
const SLOT_TITLES = [
  'PRIMARY WEAPON', 'SECONDARY ITEM', 'MISC. ITEM', 'HELMET',
  'BODY ARMOR', 'LEG ARMOR', 'GAUNTLETS', 'BOOTS',
] as const;

function resolveSlotTitle(view: EquipPickerView): string {
  if (view.slotTitle !== undefined) return view.slotTitle;
  // Prefer the msg table if a future accessor populates it; else the constant.
  return creationString(view.db, MSG_SLOT_TITLE_BASE + view.bodySlot)
    || SLOT_TITLES[view.bodySlot]
    || '';
}

/** The prompt-bar selection name: the committed candidate's name or "NONE". */
function currentSelectionName(view: EquipPickerView): string {
  const sel = view.selection ?? null;
  if (sel != null) {
    const c = view.candidates[sel];
    if (c) return c.name;
  }
  return creationString(view.db, MSG_NONE) || 'NONE';
}

function composePromptBar(view: EquipPickerView): TileWindow {
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

  const prompt = formatPrompt(view.db, resolveSlotTitle(view)); // "SELECT PRIMARY WEAPON >"
  setCursor(w, PROMPT_COL, PROMPT_ROW);
  puts(w, prompt, PROMPT_TEXT_ATTR);
  // A space then the highlighted selection ("NONE" or the candidate name).
  setCursor(w, PROMPT_COL + prompt.length, PROMPT_ROW);
  puts(w, ' ', PROMPT_TEXT_ATTR);
  setCursor(w, PROMPT_COL + prompt.length + 1, PROMPT_ROW);
  puts(w, currentSelectionName(view), PROMPT_SELECT_ATTR);

  return w;
}

/** Highlight the cursored candidate's row in the inventory list. When SKIP is
 *  cursored there is no candidate row to mark, so no overlay is drawn. */
function composeCandidateHighlight(view: EquipPickerView): TileWindow | null {
  const candidate = view.candidates[view.cursor];
  if (!candidate) return null;

  const row = INV_FIRST_ROW + view.cursor;
  const w = createTileWindow({
    screenX: MARKER_COL * CELL_PX,
    screenY: row * CELL_PX,
    widthCells: HILITE_W,
    heightCells: HILITE_H,
  });
  // Candidate name + marker render as COLORED highlight text (stroke =
  // palette[high nibble], black bg) — NOT inverse.
  w.invertHighlight = false;
  // Window-local cols: 0 = marker col 21, 1 = name col 22.
  setCursor(w, 0, 0);
  puts(w, String.fromCharCode(MARKER_CHAR), MARKER_ATTR);
  setCursor(w, NAME_COL - MARKER_COL, 0);
  puts(w, candidate.name.slice(0, NAME_WIDTH), NAME_ATTR);
  return w;
}

/**
 * Compose the EQUIP slot-picker overlay windows (z-order, lowest first). These
 * are painted ON TOP of the character-view main panel (which the caller renders
 * first) and REPLACE the action-menu strip:
 *   1. bottom prompt bar
 *   2. candidate-row highlight (omitted when SKIP is cursored)
 */
export function composeEquipPicker(view: EquipPickerView): TileWindow[] {
  const windows: TileWindow[] = [composePromptBar(view)];
  const highlight = composeCandidateHighlight(view);
  if (highlight) windows.push(highlight);
  return windows;
}
