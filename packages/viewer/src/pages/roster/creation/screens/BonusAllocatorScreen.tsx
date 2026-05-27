/**
 * BonusAllocatorScreen — screen-06: Distribute bonus pool across 7 attributes.
 *
 * The player spends `state.draft.bonusPool` points across the 7 attribute slots
 * (STR/INT/PIE/VIT/DEX/SPD/PER). KAR (index 7) is NOT adjustable here.
 *
 * Key handlers per §4/§8:
 *   ArrowLeft  (code 1) → ALLOC_ADJUST {attr:cursor, delta:-1}
 *   ArrowUp    (code 2) → cursor = cursor<=0 ? 6 : cursor-1  (wraps)
 *   ArrowRight (code 3) → ALLOC_ADJUST {attr:cursor, delta:+1}
 *   ArrowDown  (code 4) → cursor = cursor>=6 ? 0 : cursor+1  (wraps)
 *   Enter      (code 5) → ALLOC_CONFIRM
 *
 * Enforcement:
 *   - Cap (18), floor (race base), pool guard: all live in the REDUCER (state.ts).
 *     This screen dispatches unconditionally — the reducer silently no-ops invalid moves.
 *   - Confirm gate (pool==0): also in the REDUCER (ALLOC_CONFIRM no-ops if pool > 0).
 *     Screen dispatches Enter → ALLOC_CONFIRM unconditionally.
 *   - No double-enforcement here.
 *
 * Render:
 *   - `top` window: title (MSG.bonusTitle 0x0460) + 7-row attr table + pool count
 *   - `bottomBar` window: control labels (MSG.bonusAdjust 0x0454, MSG.bonusSelect 0x0455,
 *     MSG.bonusLabel 0x0453)
 *   - Cursor attr highlighted via highlightRow on the `top` window
 *
 * §4: "Renders in the bottom status bar window *0x56ca" — but the stat panel
 * (attrs + pool count) is in the top window (*0x546e). Labels go in bottomBar.
 *
 * Spec: docs/re/wpcmk-screens.md §4, §8
 */

import { useState, useEffect, useCallback } from 'react';
import { clearWindow, setCursor, puts } from '@wiz6/parser';
import { WIZ6_MAIN } from '@wiz6/data';
import type { Palette } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../state.js';
import { createPersistentWindows } from '../ega/windows.js';
import { highlightRow } from '../ega/highlight.js';
import { CreationCanvas } from '../ega/CreationCanvas.js';
import { MSG, creationString } from '../messages.js';
import { mapKey } from './ScreenProps.js';

// ---------------------------------------------------------------------------
// Attribute labels
// ---------------------------------------------------------------------------

/** Display labels for the 7 allocatable attributes (STR..PER, indices 0..6). */
const ATTR_LABELS = ['STR', 'INT', 'PIE', 'VIT', 'DEX', 'SPD', 'PER'] as const;

// ---------------------------------------------------------------------------
// BonusAllocatorScreen component
// ---------------------------------------------------------------------------

export interface BonusAllocatorScreenProps {
  state: CreationState;
  dispatch: (e: CreationEvent) => void;
  fontSet: FontSet;
  palette: Palette;
  db: MessageDb;
}

/**
 * BonusAllocatorScreen — renders screen-06: attribute bonus allocation.
 *
 * Dumb component. All enforcement (cap/floor/pool) lives in the reducer.
 * This component tracks cursor position (local state) and maps keys to events.
 */
export function BonusAllocatorScreen({
  state,
  dispatch,
  fontSet,
  palette,
  db,
}: BonusAllocatorScreenProps) {
  // Local cursor (0..6 = STR..PER). Wraps in both directions.
  const [cursor, setCursorPos] = useState<number>(0);

  // -------------------------------------------------------------------------
  // Key handler
  // -------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const code = mapKey(e);
      if (code === null) return;

      switch (code) {
        case 2: // ArrowUp — prev attr, wraps 0→6
          setCursorPos((prev) => (prev <= 0 ? 6 : prev - 1));
          break;
        case 4: // ArrowDown — next attr, wraps 6→0
          setCursorPos((prev) => (prev >= 6 ? 0 : prev + 1));
          break;
        case 1: // ArrowLeft — decrease current attr
          dispatch({ type: 'ALLOC_ADJUST', attr: cursor, delta: -1 });
          break;
        case 3: // ArrowRight — increase current attr
          dispatch({ type: 'ALLOC_ADJUST', attr: cursor, delta: 1 });
          break;
        case 5: // Enter — confirm (reducer gates on pool==0)
          dispatch({ type: 'ALLOC_CONFIRM' });
          break;
      }
    },
    [cursor, dispatch],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const { top, bottomBar } = createPersistentWindows();
  const pal = palette ?? WIZ6_MAIN;

  // --- top window: title + attr table + pool ---

  const titleText = creationString(db, MSG.bonusTitle);
  if (titleText) {
    setCursor(top, 0, 0);
    puts(top, titleText, top.cells[1] ?? 0x14);
  }

  // Render 7-row attribute table: "STR  8" etc.
  const attrs = state.draft.attributes;
  const attrValues = [
    attrs.str, attrs.int, attrs.pie,
    attrs.vit, attrs.dex, attrs.spd, attrs.per,
  ];
  const normalAttr = top.cells[1] ?? 0x14;

  for (let i = 0; i < 7; i++) {
    const row = i + 2; // rows 2..8 (skip title at 0 and blank at 1)
    const label = ATTR_LABELS[i] ?? '';
    const value = attrValues[i] ?? 0;
    const line = `${label}  ${value}`;
    setCursor(top, 0, row);
    puts(top, line, normalAttr);

    if (i === cursor) {
      highlightRow(top, row, 5);
    }
  }

  // Render pool count below the attr table
  const poolText = `${creationString(db, MSG.bonusLabel)}  ${state.draft.bonusPool}`;
  setCursor(top, 0, 10);
  puts(top, poolText, normalAttr);

  // --- bottomBar window: control labels ---

  clearWindow(bottomBar, 0x20 /* space */, 0x13);
  const adjustText = creationString(db, MSG.bonusAdjust);
  if (adjustText) {
    setCursor(bottomBar, 0, 0);
    puts(bottomBar, adjustText, bottomBar.cells[1] ?? 0x13);
  }

  const selectText = creationString(db, MSG.bonusSelect);
  if (selectText) {
    setCursor(bottomBar, 0, 1);
    puts(bottomBar, selectText, bottomBar.cells[1] ?? 0x13);
  }

  const windows = [top, bottomBar];

  return <CreationCanvas windows={windows} fontSet={fontSet} palette={pal} />;
}
