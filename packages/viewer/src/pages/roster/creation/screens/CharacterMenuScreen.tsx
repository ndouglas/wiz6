/**
 * CharacterMenuScreen — the CHARACTER MENU entry screen for the character
 * creation / roster management flow. Rendered over the persistent window chrome.
 *
 * ## Roster-state-dependent options
 *
 * `wpcmk_entry_and_roster_menu` (FUN_59e0, wpcmk file 0x59e0) builds a 6-entry
 * enabled[] array on the stack and selectively zeroes entries based on roster state.
 * The rules (confirmed by disassembly at 0x5a6e–0x5ad1 + 3 save-state memory reads):
 *
 *   CREATE PC: shown only when roster has room (rosterCount < MAX_ROSTER_SLOTS)
 *   REVIEW/DELETE/RENAME/PORTRAIT: shown only when roster has ≥1 character
 *   EXIT: always shown
 *
 * Three observable states:
 *   EMPTY   (rosterCount == 0):              [CREATE PC, EXIT]
 *   PARTIAL (0 < rosterCount < 16):          [CREATE PC, REVIEW PC, DELETE PC, RENAME PC, PORTRAIT, EXIT]
 *   FULL    (rosterCount == MAX_ROSTER_SLOTS): [REVIEW PC, DELETE PC, RENAME PC, PORTRAIT, EXIT]
 *
 * RE reference: docs/re/findings/wpcmk-character-menu-options.json
 * Source: `wpcmk_entry_and_roster_menu` (FUN_59e0) @ wpcmk file 0x59e0.
 *
 * ## Layout
 *
 * 6 options (PARTIAL): 2 rows × 3 columns in bottomBar
 *   Row 0:  CREATE PC  |  DELETE PC  |  PORTRAIT
 *   Row 1:  REVIEW PC  |  RENAME PC  |  EXIT
 *
 * 5 options (FULL):    3-column layout, left col has only EXIT
 *   Row 0:  EXIT       |  REVIEW PC  |  RENAME PC
 *   Row 1:  —          |  DELETE PC  |  PORTRAIT
 *
 * 2 options (EMPTY):   single-column centered layout
 *   Row 0:  CREATE PC
 *   Row 1:  EXIT
 *
 * ## Grid navigation
 *
 * Cursor navigates over the grid of VISIBLE options only. Options absent in
 * the current state are not reachable (no "skip" logic needed — the grid
 * collapses to only include visible cells).
 *
 *   ArrowLeft  → prev col (clamp at 0)
 *   ArrowRight → next col (clamp at maxCol)
 *   ArrowUp    → prev row (clamp at 0)
 *   ArrowDown  → next row (clamp at maxRow)
 *   Enter      → dispatch selected option's event
 *   ESC        → silently ignored (§8)
 *
 * Spec: docs/re/wpcmk-screens.md §7 (grid nav), §8 (key model), §1a (option rules).
 */

import { useState, useEffect, useCallback } from 'react';
import { setCursor, puts } from '@wiz6/parser';
import { WIZ6_MAIN } from '@wiz6/data';
import type { Palette } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../state.js';
import { createPersistentWindows } from '../ega/windows.js';
import { CreationCanvas } from '../ega/CreationCanvas.js';
import { creationString } from '../messages.js';
import { mapKey } from './ScreenProps.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum number of roster slots. Confirmed from pcfile.dbs header +0x02
 * (value 0x0010 = 16) and live save-state memory reads at DGROUP 0x4fd2.
 * RE source: docs/re/findings/wpcmk-character-menu-options.json
 */
export const MAX_ROSTER_SLOTS = 16;

// ---------------------------------------------------------------------------
// Menu option definitions
// ---------------------------------------------------------------------------

/**
 * Msg IDs for the 5 roster-picker strings (docs/re/findings/wpcmk-msg-strings.json).
 * EXIT has no msg ID — resolved to literal "EXIT".
 */
const MENU_MSG_IDS = {
  createPc:  0x046a,
  reviewPc:  0x046b,
  deletePc:  0x046c,
  renamePc:  0x046d,
  portrait:  0x046e,
} as const;

/** Single option entry: display label + dispatch event. */
interface MenuOption {
  label: string;
  event: CreationEvent;
}

/**
 * Build the full 6-option list (all states merged).
 * Returns all 6 regardless of roster state — the grid builder selects from this.
 */
function buildAllOptions(db: MessageDb): MenuOption[] {
  const resolve = (id: number, fallback: string): string => {
    const s = creationString(db, id);
    return s !== '' ? s : fallback;
  };

  return [
    { label: resolve(MENU_MSG_IDS.createPc, 'CREATE PC'), event: { type: 'MENU_CREATE' }   },
    { label: resolve(MENU_MSG_IDS.reviewPc, 'REVIEW PC'), event: { type: 'MENU_REVIEW' }   },
    { label: resolve(MENU_MSG_IDS.deletePc, 'DELETE PC'), event: { type: 'MENU_DELETE' }   },
    { label: resolve(MENU_MSG_IDS.renamePc, 'RENAME PC'), event: { type: 'MENU_RENAME' }   },
    { label: resolve(MENU_MSG_IDS.portrait, 'PORTRAIT'),  event: { type: 'MENU_PORTRAIT' } },
    { label: 'EXIT',                                       event: { type: 'MENU_EXIT' }     },
  ];
}

// ---------------------------------------------------------------------------
// Grid cells — position + option
// ---------------------------------------------------------------------------

/**
 * A cell in the visible menu grid. Row and col are 0-based indices into
 * the rendered 2D layout. x is the cell x position in bottomBar cells.
 */
interface GridCell {
  row: number;
  col: number;
  /** X offset in bottomBar cells (for rendering). */
  x: number;
  option: MenuOption;
}

// Column X offsets in bottomBar-local cells, in fill order (center, right, left).
// Verified pixel-exact against the engine fixtures: options fill column-major,
// 2 rows per column, and column N's text starts at COL_X[N]. The visual order
// is center→right→left, which keeps the option list sequential (see buildGrid).
//   docs/re/findings/wpcmk-character-menu-options.json
const COL_X = [18, 30, 2] as const;

// Row Y offsets in bottomBar-local cells. The bottomBar window is at screen
// row 20 (y=160); the two option rows are screen rows 23 & 24 → local 3 & 4.
const ROW_Y = [3, 4] as const;

/**
 * The ordered list of options visible in each roster state. Drives the
 * column-major grid placement below.
 *
 *   EMPTY   (rosterCount == 0):  [CREATE PC, EXIT]
 *   PARTIAL (0 < count < MAX):   [CREATE, REVIEW, DELETE, RENAME, PORTRAIT, EXIT]
 *   FULL    (count == MAX):      [REVIEW, DELETE, RENAME, PORTRAIT, EXIT]  (no CREATE)
 */
function buildVisibleOptions(allOptions: MenuOption[], rosterCount: number): MenuOption[] {
  const hasRoom  = rosterCount < MAX_ROSTER_SLOTS;
  const hasChars = rosterCount > 0;

  const [createPc, reviewPc, deletePc, renamePc, portrait, exit] = allOptions as [
    MenuOption, MenuOption, MenuOption, MenuOption, MenuOption, MenuOption
  ];

  if (!hasChars && hasRoom) return [createPc, exit];
  if (!hasRoom && hasChars) return [reviewPc, deletePc, renamePc, portrait, exit];
  return [createPc, reviewPc, deletePc, renamePc, portrait, exit];
}

/**
 * Place the visible options into the bottomBar via column-major fill:
 * option index i → column = ⌊i/2⌋, row-within-column = i mod 2, with the
 * column's screen x taken from COL_X (fill order = center, right, left).
 *
 * EMPTY   → both options in the center column (col 0 = x18), rows 0 & 1.
 * PARTIAL → CREATE/REVIEW @ x18, DELETE/RENAME @ x30, PORTRAIT/EXIT @ x2.
 *
 * Grid (row,col) indices used for navigation match this fill order, so
 * ArrowRight steps through columns center→right→left (engine column-index nav).
 */
function buildGrid(visible: MenuOption[]): GridCell[] {
  return visible.map((option, i) => {
    const col = Math.floor(i / 2);
    const row = i % 2;
    return { row, col, x: COL_X[col] ?? COL_X[0], option };
  });
}

/** Find the cell at (row, col), or undefined if absent. */
function cellAt(grid: GridCell[], row: number, col: number): GridCell | undefined {
  return grid.find((c) => c.row === row && c.col === col);
}

/** The max row index present in the grid. */
function maxRow(grid: GridCell[]): number {
  return grid.reduce((m, c) => Math.max(m, c.row), 0);
}

/** The max col index present in the grid. */
function maxCol(grid: GridCell[]): number {
  return grid.reduce((m, c) => Math.max(m, c.col), 0);
}

/**
 * Clamp the cursor to a valid (row, col) that has a cell.
 * If the exact cell doesn't exist, scan right then down for the nearest.
 * This handles the FULL layout's missing (1,0) cell gracefully.
 */
function clampCursor(
  grid: GridCell[],
  row: number,
  col: number,
): { row: number; col: number } {
  // Direct hit
  if (cellAt(grid, row, col)) return { row, col };

  // Try scanning cols in current row
  const mCol = maxCol(grid);
  for (let c = col; c <= mCol; c++) {
    if (cellAt(grid, row, c)) return { row, col: c };
  }
  // Back-scan in current row
  for (let c = col - 1; c >= 0; c--) {
    if (cellAt(grid, row, c)) return { row, col: c };
  }
  // Fall back to first cell in grid
  const first = grid[0];
  return first ? { row: first.row, col: first.col } : { row: 0, col: 0 };
}

// ---------------------------------------------------------------------------
// CharacterMenuScreen component
// ---------------------------------------------------------------------------

export interface CharacterMenuScreenProps {
  state: CreationState;
  dispatch: (e: CreationEvent) => void;
  fontSet: FontSet;
  palette: Palette;
  db: MessageDb;
  /**
   * Number of characters currently in the roster. Drives which options are shown.
   *
   * Rules (RE-confirmed from wpcmk_entry_and_roster_menu disassembly):
   *   0     → EMPTY: only CREATE PC + EXIT
   *   1..15 → PARTIAL: all 6 options
   *   16    → FULL: no CREATE PC (5 options)
   *
   * Defaults to 0 (empty roster) when omitted, matching the first-visit experience.
   */
  rosterCount?: number;
}

/**
 * CharacterMenuScreen — renders the roster-state-dependent CHARACTER MENU.
 *
 * Cursor starts at (0,0) (the top-left visible cell). Arrow keys navigate
 * within the current grid; Enter dispatches the selected option's event.
 */
export function CharacterMenuScreen({
  state,
  dispatch,
  fontSet,
  palette,
  db,
  rosterCount = 0,
}: CharacterMenuScreenProps) {
  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);

  // Build the option set and grid for the current roster state.
  // These are stable per render (db is stable; rosterCount changes only when
  // the roster changes between creations, which causes a re-render).
  const allOptions = buildAllOptions(db);
  const grid = buildGrid(buildVisibleOptions(allOptions, rosterCount));

  // Ensure cursor is on a valid cell whenever the grid changes.
  // (e.g. if rosterCount changes from partial to full, (0,0) might shift)
  const clamped = clampCursor(grid, row, col);
  const cursorRow = clamped.row;
  const cursorCol = clamped.col;

  // -------------------------------------------------------------------------
  // Key handler
  // -------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const code = mapKey(e);
      if (code === null) return;

      switch (code) {
        case 1: { // ArrowLeft — prev col (clamp)
          const next = clampCursor(grid, cursorRow, Math.max(0, cursorCol - 1));
          setRow(next.row);
          setCol(next.col);
          break;
        }
        case 3: { // ArrowRight — next col (clamp)
          const next = clampCursor(grid, cursorRow, Math.min(maxCol(grid), cursorCol + 1));
          setRow(next.row);
          setCol(next.col);
          break;
        }
        case 2: { // ArrowUp — prev row (clamp)
          const next = clampCursor(grid, Math.max(0, cursorRow - 1), cursorCol);
          setRow(next.row);
          setCol(next.col);
          break;
        }
        case 4: { // ArrowDown — next row (clamp)
          const next = clampCursor(grid, Math.min(maxRow(grid), cursorRow + 1), cursorCol);
          setRow(next.row);
          setCol(next.col);
          break;
        }
        case 5: { // Enter — confirm
          const cell = cellAt(grid, cursorRow, cursorCol);
          if (!cell) break;
          dispatch(cell.option.event);
          break;
        }
      }
    },
    [grid, cursorRow, cursorCol, dispatch],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const { top, bottomBar, menuPanel } = createPersistentWindows();

  // Write each visible option into the bottomBar at its grid position.
  // The bottom option list renders as plain white text (attr 0x13) — verified
  // against all three engine fixtures. The engine does NOT highlight the
  // selected option in this bottom list; selection is reflected in the top
  // status bar (the black-on-yellow string at screen rows 1-2). That top-bar
  // reflection is not yet ported, so the cursor is tracked for Enter dispatch
  // and navigation but not yet drawn. See docs/re/findings/menu-cursor-render-path.json.
  const normalAttr = 0x13;
  for (const cell of grid) {
    const y = ROW_Y[cell.row] ?? ROW_Y[0];
    setCursor(bottomBar, cell.x, y);
    puts(bottomBar, cell.option.label, normalAttr);
  }

  const pal = palette ?? WIZ6_MAIN;
  const windows = [top, bottomBar, menuPanel];

  // Suppress "state is declared but not used" warning — it's in props for
  // ScreenProps contract compliance (all screens receive state for context).
  void state;

  return <CreationCanvas windows={windows} fontSet={fontSet} palette={pal} />;
}
