/**
 * MenuPickerScreen — parametric menu-picker for race (02), sex (03), class (05).
 *
 * Drives `ui_menu_picker_vertical` (wpcmk file 0x029c) per §7:
 *   - Renders prompt+title in the bottomBar window (via creationString)
 *   - Lists entries in the menuPanel window (race: 11, sex: 2, class: 14)
 *   - Highlights the cursor row (highlightRow, bgPaletteIdx=5 = bright yellow)
 *   - Handles key codes per §7/§8:
 *       ArrowUp (code 2)   = prev row (no wrap)
 *       ArrowDown (code 4) = next row (no wrap)
 *       ArrowLeft (code 1) = prev column (no-op for single-column list)
 *       ArrowRight (code 3) = next column (no-op for single-column list)
 *       Enter (code 5)     = confirm → dispatch PICK_RACE/PICK_SEX/PICK_CLASS
 *   - ESC → silently ignored (no cancel path per §7)
 *   - No letter shortcuts (§7)
 *
 * Cursor seeded to the first ENABLED entry on mount. For race/sex all entries
 * are enabled. For class, entries failing meetsClassRequirements are skipped;
 * the cursor never lands on a disabled entry.
 *
 * §7: "Disabled entries are skipped during the init loop and never assigned a
 * cursor slot — the cursor can only land on enabled entries."
 * §7: "The ORIGINAL index into the caller's full option array is returned."
 *
 * Spec: docs/re/wpcmk-screens.md §7, §8
 */

import { useState, useEffect, useCallback } from 'react';
import { clearWindow, setCursor, puts } from '@wiz6/parser';
import { meetsClassRequirements, WIZ6_MAIN } from '@wiz6/data';
import type { Palette } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../state.js';
import { createPersistentWindows } from '../ega/windows.js';
import { highlightRange } from '../ega/highlight.js';
import { CreationCanvas } from '../ega/CreationCanvas.js';
import {
  MSG,
  creationString,
  raceName,
  sexName,
  className,
} from '../messages.js';
import { mapKey } from './ScreenProps.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What kind of pick this screen is performing — derived from state.screen. */
type PickKind = 'race' | 'sex' | 'class';

/** An option entry in the picker list. */
interface PickerOption {
  /** Original index in the full option array (what gets dispatched). */
  originalIndex: number;
  /** Display label. */
  label: string;
  /** Whether this entry is enabled (cursor can land here). */
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Option builders
// ---------------------------------------------------------------------------

/** Build the 11-entry race option list. All entries are always enabled. */
function buildRaceOptions(db: MessageDb): PickerOption[] {
  const opts: PickerOption[] = [];
  for (let i = 0; i < 11; i++) {
    opts.push({ originalIndex: i, label: raceName(db, i), enabled: true });
  }
  return opts;
}

/** Build the 2-entry sex option list. All entries are always enabled. */
function buildSexOptions(db: MessageDb): PickerOption[] {
  return [
    { originalIndex: 0, label: sexName(db, 0), enabled: true },
    { originalIndex: 1, label: sexName(db, 1), enabled: true },
  ];
}

/**
 * Build the 14-entry class option list. Entries failing meetsClassRequirements
 * are marked disabled and will be skipped by the cursor.
 */
function buildClassOptions(db: MessageDb, state: CreationState): PickerOption[] {
  const opts: PickerOption[] = [];
  for (let i = 0; i < 14; i++) {
    const enabled = meetsClassRequirements(state.draft.attributes, i);
    opts.push({ originalIndex: i, label: className(db, i), enabled });
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Cursor helpers
// ---------------------------------------------------------------------------

/** Find the index (into opts array) of the first enabled entry. Returns 0 if none found. */
function firstEnabledIdx(opts: PickerOption[]): number {
  const idx = opts.findIndex((o) => o.enabled);
  return idx >= 0 ? idx : 0;
}

/** Return the index of the next enabled entry at or after `from`. Clamps at end. */
function nextEnabledIdx(opts: PickerOption[], from: number): number {
  for (let i = from + 1; i < opts.length; i++) {
    if (opts[i]!.enabled) return i;
  }
  return from; // at end — no-op
}

/** Return the index of the prev enabled entry at or before `from`. Clamps at start. */
function prevEnabledIdx(opts: PickerOption[], from: number): number {
  for (let i = from - 1; i >= 0; i--) {
    if (opts[i]!.enabled) return i;
  }
  return from; // at start — no-op
}

// ---------------------------------------------------------------------------
// MenuPickerScreen component
// ---------------------------------------------------------------------------

export interface MenuPickerScreenProps {
  state: CreationState;
  dispatch: (e: CreationEvent) => void;
  fontSet: FontSet;
  palette: Palette;
  db: MessageDb;
}

/**
 * MenuPickerScreen — renders the race, sex, or class picker based on
 * `state.screen` ('race' | 'sex' | 'class').
 *
 * All nav+confirm logic lives here. Business logic (attribute seeding,
 * bonus roll, etc.) is handled by the reducer on dispatch.
 */
export function MenuPickerScreen({
  state,
  dispatch,
  fontSet,
  palette,
  db,
}: MenuPickerScreenProps) {
  // Derive which picker to show from the current screen
  const kind: PickKind = state.screen === 'sex' ? 'sex'
    : state.screen === 'class' ? 'class'
    : 'race';

  // Build option list once per (kind, state.draft.attributes) combination.
  // For race/sex this is stable. For class it changes when attributes change.
  const options: PickerOption[] =
    kind === 'race' ? buildRaceOptions(db)
    : kind === 'sex' ? buildSexOptions(db)
    : buildClassOptions(db, state);

  // Cursor position in the options array (not original index).
  // Seeded to the first enabled entry.
  const [cursorIdx, setCursorIdx] = useState<number>(() => firstEnabledIdx(options));

  // If options change (e.g. attributes change while on class screen), re-seed
  // cursor to first enabled entry if current cursor is now on a disabled entry.
  useEffect(() => {
    if (!options[cursorIdx]?.enabled) {
      setCursorIdx(firstEnabledIdx(options));
    }
  }, [options, cursorIdx]);

  // -------------------------------------------------------------------------
  // Key handler
  // -------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const code = mapKey(e);
      if (code === null) return;

      switch (code) {
        case 2: // ArrowUp — prev row
          setCursorIdx((prev) => prevEnabledIdx(options, prev));
          break;
        case 4: // ArrowDown — next row
          setCursorIdx((prev) => nextEnabledIdx(options, prev));
          break;
        case 1: // ArrowLeft — prev column (single-column list: no-op)
        case 3: // ArrowRight — next column (single-column list: no-op)
          break;
        case 5: { // Enter — confirm
          const opt = options[cursorIdx];
          if (!opt || !opt.enabled) break;
          switch (kind) {
            case 'race':
              dispatch({ type: 'PICK_RACE', index: opt.originalIndex });
              break;
            case 'sex':
              dispatch({ type: 'PICK_SEX', index: opt.originalIndex });
              break;
            case 'class':
              dispatch({ type: 'PICK_CLASS', index: opt.originalIndex });
              break;
          }
          break;
        }
      }
    },
    [options, cursorIdx, kind, dispatch],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Build the windows for this frame (persistent set: top char-sheet template
  // + gray bottomBar + gray menuPanel). NOTE: the populated char-sheet (the
  // attribute labels/values drawn into `top` from the race screen onward) is a
  // separate shared component, not yet ported — `top` is the empty template.
  const { top, bottomBar, menuPanel } = createPersistentWindows();

  // Prompt: centered in the bottomBar at row 1, attr 0x03 (verified byte-exact
  // vs the engine race screen — "SELECT CHARACTER RACE" at col 9).
  const promptId = kind === 'race' ? MSG.racePrompt
    : kind === 'sex' ? MSG.sexPrompt
    : MSG.classPrompt;
  const promptText = creationString(db, promptId);
  if (promptText) {
    const col = Math.max(0, Math.floor((bottomBar.widthCells - promptText.length) / 2));
    setCursor(bottomBar, col, 1);
    puts(bottomBar, promptText, 0x03);
  }

  // Option list in the menuPanel: written at col 1, starting row 1 (a 1-cell
  // top/left margin), attr 0x03. The selected entry's label is highlighted
  // black-on-yellow (attr 0x50) via highlightRange. Verified vs the engine
  // race list (HUMAN highlighted, others plain).
  clearWindow(menuPanel, 0x20, 0x03);
  for (let i = 0; i < options.length; i++) {
    const opt = options[i]!;
    const row = i + 1;
    if (row >= menuPanel.heightCells) break;
    // Disabled (unqualified class) entries render dimmer; engine attr for those
    // is unverified pending a class-screen capture.
    const attr = opt.enabled ? 0x03 : 0x01;
    setCursor(menuPanel, 1, row);
    puts(menuPanel, opt.label, attr);
    if (i === cursorIdx) {
      highlightRange(menuPanel, 1, row, opt.label.length, 5);
    }
  }

  const pal = palette ?? WIZ6_MAIN;
  const windows = [top, bottomBar, menuPanel];

  return <CreationCanvas windows={windows} fontSet={fontSet} palette={pal} />;
}
