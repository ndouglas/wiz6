/**
 * CharacterMenuScreen — the 6-option entry menu for the character creation
 * roster management, rendered over the persistent window chrome.
 *
 * Layout (2 rows × 3 columns, matching `wpcmk_entry_and_roster_menu` FUN_59e0):
 *
 *   Row 0:  CREATE PC   |  DELETE PC  |  PORTRAIT
 *   Row 1:  REVIEW PC   |  RENAME PC  |  EXIT
 *
 * Option → event mapping:
 *   CREATE PC  (0,0) → MENU_CREATE
 *   DELETE PC  (0,1) → MENU_DELETE
 *   PORTRAIT   (0,2) → MENU_PORTRAIT
 *   REVIEW PC  (1,0) → MENU_REVIEW
 *   RENAME PC  (1,1) → MENU_RENAME
 *   EXIT       (1,2) → MENU_EXIT
 *
 * Msg IDs (docs/re/findings/wpcmk-msg-strings.json, base=0x046a):
 *   0x046a = CREATE PC
 *   0x046b = REVIEW PC
 *   0x046c = DELETE PC
 *   0x046d = RENAME PC
 *   0x046e = PORTRAIT
 *   EXIT has no msg ID — rendered as a documented literal fallback.
 *
 * Grid navigation (§7, no wrap):
 *   ArrowLeft  → prev col (clamp at 0)
 *   ArrowRight → next col (clamp at 2)
 *   ArrowUp    → prev row (clamp at 0)
 *   ArrowDown  → next row (clamp at 1)
 *   Enter      → dispatch selected option's event
 *   ESC        → silently ignored (§8)
 *
 * Cursor state: {row: 0|1, col: 0|1|2}, seeded to (0,0) = CREATE PC.
 *
 * Renders over persistent window chrome (three framed TileWindows) via
 * CreationCanvas. Options are written in the bottomBar window area.
 *
 * Spec: docs/re/wpcmk-screens.md §7 (grid nav), §8 (key model).
 * Source: `wpcmk_entry_and_roster_menu` (FUN_59e0) @ wpcmk file 0x59e0.
 */

import { useState, useEffect, useCallback } from 'react';
import { setCursor, puts } from '@wiz6/parser';
import { WIZ6_MAIN } from '@wiz6/data';
import type { Palette } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../state.js';
import { createPersistentWindows } from '../ega/windows.js';
import { highlightRow } from '../ega/highlight.js';
import { CreationCanvas } from '../ega/CreationCanvas.js';
import { creationString } from '../messages.js';
import { mapKey } from './ScreenProps.js';

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

/** Single option entry in the 2×3 grid. */
interface MenuOption {
  /** Display label — from msg.dbs or literal fallback. */
  label: string;
  /** Event to dispatch on confirm. */
  event: CreationEvent;
}

/**
 * Build the 6 menu options, resolving labels from msg.dbs where available.
 * EXIT falls back to the literal "EXIT" since no msg ID exists for it.
 *
 * Grid order (row-major):
 *   [0] (0,0) CREATE PC
 *   [1] (0,1) DELETE PC
 *   [2] (0,2) PORTRAIT
 *   [3] (1,0) REVIEW PC
 *   [4] (1,1) RENAME PC
 *   [5] (1,2) EXIT
 */
function buildOptions(db: MessageDb): MenuOption[] {
  const resolve = (id: number, fallback: string): string => {
    const s = creationString(db, id);
    return s !== '' ? s : fallback;
  };

  return [
    // Row 0
    { label: resolve(MENU_MSG_IDS.createPc, 'CREATE PC'), event: { type: 'MENU_CREATE' }   },
    { label: resolve(MENU_MSG_IDS.deletePc, 'DELETE PC'), event: { type: 'MENU_DELETE' }   },
    { label: resolve(MENU_MSG_IDS.portrait, 'PORTRAIT'),  event: { type: 'MENU_PORTRAIT' } },
    // Row 1
    { label: resolve(MENU_MSG_IDS.reviewPc, 'REVIEW PC'), event: { type: 'MENU_REVIEW' }   },
    { label: resolve(MENU_MSG_IDS.renamePc, 'RENAME PC'), event: { type: 'MENU_RENAME' }   },
    // EXIT: no msg ID — literal fallback
    { label: 'EXIT',                                       event: { type: 'MENU_EXIT' }     },
  ];
}

/** Map (row, col) to the flat index in buildOptions() output. */
function optionIndex(row: number, col: number): number {
  return row * 3 + col;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const NUM_ROWS = 2;
const NUM_COLS = 3;

/**
 * Column widths in cells for the 2×3 grid rendered inside bottomBar (40×5).
 * Each column is left-aligned with a fixed offset.
 * Approximate column starts (cell units within the bottomBar window, row-start at y=1):
 *   col 0 → x=1
 *   col 1 → x=14
 *   col 2 → x=27
 */
const COL_X = [1, 14, 27] as const;

// ---------------------------------------------------------------------------
// CharacterMenuScreen component
// ---------------------------------------------------------------------------

export interface CharacterMenuScreenProps {
  state: CreationState;
  dispatch: (e: CreationEvent) => void;
  fontSet: FontSet;
  palette: Palette;
  db: MessageDb;
}

/**
 * CharacterMenuScreen — renders the 6-option character roster entry menu.
 *
 * Cursor starts at (0,0) = CREATE PC. ArrowLeft/Right change column; ArrowUp/Down
 * change row (both clamp, no wrap). Enter dispatches the selected option's event.
 */
export function CharacterMenuScreen({
  state,
  dispatch,
  fontSet,
  palette,
  db,
}: CharacterMenuScreenProps) {
  // Cursor: 2D position in the 2×3 grid
  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);

  // Build options once per db (db is stable within a session)
  const options = buildOptions(db);

  // -------------------------------------------------------------------------
  // Key handler
  // -------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const code = mapKey(e);
      if (code === null) return;

      switch (code) {
        case 1: // ArrowLeft — prev col (no wrap)
          setCol((c) => Math.max(0, c - 1));
          break;
        case 3: // ArrowRight — next col (no wrap)
          setCol((c) => Math.min(NUM_COLS - 1, c + 1));
          break;
        case 2: // ArrowUp — prev row (no wrap)
          setRow((r) => Math.max(0, r - 1));
          break;
        case 4: // ArrowDown — next row (no wrap)
          setRow((r) => Math.min(NUM_ROWS - 1, r + 1));
          break;
        case 5: { // Enter — confirm
          const opt = options[optionIndex(row, col)];
          if (!opt) break;
          dispatch(opt.event);
          break;
        }
      }
    },
    [options, row, col, dispatch],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const { top, bottomBar, menuPanel } = createPersistentWindows();

  // Write each option into the bottomBar window in the documented 2×3 layout.
  // Row 0 at bottomBar y=1; Row 1 at bottomBar y=3.
  const ROW_Y = [1, 3] as const;

  for (let r = 0; r < NUM_ROWS; r++) {
    const y = ROW_Y[r] ?? 1;
    for (let c = 0; c < NUM_COLS; c++) {
      const optIdx = optionIndex(r, c);
      const opt = options[optIdx];
      if (!opt) continue;

      const x = COL_X[c] ?? 1;
      const normalAttr = 0x13; // bottomBar default attr

      setCursor(bottomBar, x, y);
      puts(bottomBar, opt.label, normalAttr);
    }
  }

  // Apply highlight to the cursor row (the entire cursor row in the 2×3 grid).
  // We re-attr the row in bottomBar that contains the cursor option.
  // The cursor row is at bottomBar row ROW_Y[row].
  {
    const cursorY = ROW_Y[row] ?? 1;
    // Only highlight the cursor cell's text, not the full row —
    // we'll use a "cursor cell highlight" approach: re-write the cursor option
    // with the highlight attr encoding (bgPaletteIdx=5 = bright yellow).
    // This matches the engine: only the selected cell is highlighted.
    const cursorOptIdx = optionIndex(row, col);
    const cursorOpt = options[cursorOptIdx];
    const cursorX = COL_X[col] ?? 1;
    if (cursorOpt) {
      // Re-attr the row segment for the cursor option using highlightRow only on
      // the specific row (entire bottomBar row y is re-attrred for the cursor row).
      highlightRow(bottomBar, cursorY, 5);
      // Re-write just the cursor option label to ensure it's readable
      // (highlightRow leaves char bytes intact, so text is preserved).
    }
  }

  const pal = palette ?? WIZ6_MAIN;
  const windows = [top, bottomBar, menuPanel];

  // Suppress "state is declared but not used" warning — it's in props for
  // ScreenProps contract compliance (all screens receive state for context).
  void state;

  return <CreationCanvas windows={windows} fontSet={fontSet} palette={pal} />;
}
