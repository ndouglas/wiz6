/**
 * PortraitPickerScreen — screen-10: portrait picker.
 *
 * `wpcmk_pick_portrait_loop` (0x4bad) + `portrait_load_from_disk` (0x4a9a).
 *
 * Per docs/re/wpcmk-screens.md §6:
 *   - 42 portraits (0..41), NO race/sex/class filter — all available unconditionally.
 *   - Default starting index: 0 (new-character default per §6).
 *   - ArrowLeft  (key 1) cycles left:  (idx + 41) % 42
 *   - ArrowRight (key 3) cycles right: (idx + 1)  % 42
 *   - Enter      (key 5) → dispatch PICK_PORTRAIT { index }
 *   - ArrowUp / ArrowDown are no-ops per §6 (only Left/Right/Return defined).
 *   - Labels (§3): MSG 0x0458 "↑↓ TO REVIEW PORTRAITS" in bottomBar,
 *                  MSG 0x0459 "PRESS ► TO SELECT"        in bottomBar (row 1).
 *   - Window: `*0x56cc` (menuPanel) for image area, `*0x56ca` (bottomBar) for prompt.
 *
 * Portrait pixel rendering: placeholder (index number + framed box) is rendered in
 * the menuPanel window. Actual WPORT*.EGA pixels are not yet wired into the creation
 * flow — a portrait loader would need to be loaded and made available here.
 *
 * // TODO(stage-C/portrait): wire actual WPORT*.EGA pixels once a portrait-asset
 * // loader is available in the creation data pipeline.
 *
 * Spec: docs/re/wpcmk-screens.md §6, §8
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
import { MSG, creationString } from '../messages.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Total portrait count — 42 portraits (0..41), per §6 "42-cycle portrait picker". */
const PORTRAIT_COUNT = 42;

// ---------------------------------------------------------------------------
// PortraitPickerScreen component
// ---------------------------------------------------------------------------

export interface PortraitPickerScreenProps {
  state: CreationState;
  dispatch: (e: CreationEvent) => void;
  fontSet: FontSet;
  palette: Palette;
  db: MessageDb;
}

/**
 * PortraitPickerScreen — renders screen-10: portrait-cycle picker.
 *
 * Dumb component. Local state tracks the current portrait index.
 * On Enter, dispatches PICK_PORTRAIT { index } to the reducer.
 */
export function PortraitPickerScreen({
  state,
  dispatch,
  fontSet,
  palette,
  db,
}: PortraitPickerScreenProps) {
  // Local portrait index — defaults to 0 per §6.
  // The engine writes 0 to DGROUP 0x560c just before the loop starts.
  const [portraitIdx, setPortraitIdx] = useState<number>(0);

  // -------------------------------------------------------------------------
  // Key handler
  // -------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          // Key 1 — cycle left: (idx + 41) % 42  (wraps 0 → 41)
          setPortraitIdx((prev) => (prev + PORTRAIT_COUNT - 1) % PORTRAIT_COUNT);
          break;
        case 'ArrowRight':
          // Key 3 — cycle right: (idx + 1) % 42  (wraps 41 → 0)
          setPortraitIdx((prev) => (prev + 1) % PORTRAIT_COUNT);
          break;
        case 'Enter':
          // Key 5 — confirm selection → dispatch PICK_PORTRAIT
          dispatch({ type: 'PICK_PORTRAIT', index: portraitIdx });
          break;
        // ArrowUp (key 2) and ArrowDown (key 4) are no-ops for this screen (§6).
        // Escape (key 0) is silently ignored per §8.
        default:
          break;
      }
    },
    [dispatch, portraitIdx],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const { top, bottomBar, menuPanel } = createPersistentWindows();
  const pal = palette ?? WIZ6_MAIN;

  // --- bottomBar: row 0 = "↑↓ TO REVIEW PORTRAITS" (MSG 0x0458) ---
  const reviewText = creationString(db, MSG.portraitReview);
  if (reviewText) {
    setCursor(bottomBar, 0, 0);
    puts(bottomBar, reviewText, bottomBar.cells[1] ?? 0x13);
  }

  // --- bottomBar: row 1 = "PRESS ► TO SELECT" (MSG 0x0459) ---
  const selectText = creationString(db, MSG.portraitSelect);
  if (selectText) {
    setCursor(bottomBar, 0, 1);
    puts(bottomBar, selectText, bottomBar.cells[1] ?? 0x13);
  }

  // --- menuPanel: placeholder portrait display ---
  // TODO(stage-C/portrait): wire actual WPORT*.EGA pixels once a portrait-asset
  // loader is available in the creation data pipeline.
  const placeholderLabel = `PORTRAIT ${portraitIdx}`;
  setCursor(menuPanel, 0, 0);
  puts(menuPanel, placeholderLabel, menuPanel.cells[1] ?? 0x15);

  // --- top: show current portrait index for context ---
  const topLabel = `PORTRAIT: ${portraitIdx + 1} / ${PORTRAIT_COUNT}`;
  setCursor(top, 0, 0);
  puts(top, topLabel, top.cells[1] ?? 0x14);

  const windows = [top, bottomBar, menuPanel];

  return <CreationCanvas windows={windows} fontSet={fontSet} palette={pal} />;
}
