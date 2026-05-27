/**
 * ConfirmScreen — screen-15: KEEP or DISCARD the created character.
 *
 * Per docs/re/wpcmk-screens.md §10, §3, §8:
 *   - Shows the assembled character sheet in the top window:
 *       name, race name, sex name, class name, STR/INT/PIE/VIT/DEX/SPD/PER/KAR,
 *       HP (derived.hpInitial), STM (derived.stamina), gold (derived.goldInitial).
 *   - Shows "SAVE THIS CHARACTER?" (MSG 0x044f) in the bottomBar window.
 *   - Shows a YES/NO 2-option picker (MSG 0x045a) in the bottomBar.
 *   - Cursor starts at YES (index 0).
 *   - ArrowLeft/ArrowRight or ArrowUp/ArrowDown toggle YES (0) / NO (1).
 *   - No wrap — cursor clamps at 0..1.
 *   - Enter → dispatch CONFIRM { keep: cursor===0 } (YES=true, NO=false).
 *   - Escape is silently ignored per §8.
 *
 * Confirmation menu strings (§10, §3):
 *   msg 0x44f = "SAVE THIS CHARACTER?" → header in bottomBar
 *   msg 0x45a = "YES" (the option string; "NO" is the second choice)
 *
 * §10: "Choice 0 = KEEP, any other choice = DISCARD (exit without writing)."
 *
 * Engine detail: `ui_menu_picker_vertical` drives this screen via the
 * bottomBar window (`*0x56ca`), with the char-sheet pre-rendered in top
 * (`*0x546e`). The port mirrors this: top shows the sheet, bottomBar shows
 * the prompt+picker.
 *
 * Render: uses the persistent windows (top + bottomBar). The menuPanel is
 * not used for this screen (no side panel).
 *
 * Spec: docs/re/wpcmk-screens.md §3, §8, §10
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
import {
  MSG,
  creationString,
  raceName,
  sexName,
  className,
} from '../messages.js';

// ---------------------------------------------------------------------------
// Option labels
// ---------------------------------------------------------------------------

/** The two YES/NO option labels for the confirm picker. */
const CONFIRM_OPTIONS = ['YES', 'NO'] as const;

// ---------------------------------------------------------------------------
// Character sheet rendering into the top window
// ---------------------------------------------------------------------------

/**
 * Render the assembled character sheet into the `top` window.
 *
 * Layout (8-cell rows × 40-cell width):
 *   Row 0: name
 *   Row 1: race + sex
 *   Row 2: class
 *   Row 3: (blank separator)
 *   Row 4: STR / INT / PIE / VIT
 *   Row 5: DEX / SPD / PER / KAR
 *   Row 6: (blank separator)
 *   Row 7: HP / STM / GOLD
 *
 * Missing derived values (derived is Partial<>) render as "?" gracefully.
 */
function renderCharSheet(
  top: ReturnType<typeof createPersistentWindows>['top'],
  state: CreationState,
  db: MessageDb,
): void {
  const { draft } = state;
  const attr = top.cells[1] ?? 0x14;

  // Row 0: character name
  setCursor(top, 0, 0);
  puts(top, draft.name || '(unnamed)', attr);

  // Row 1: race + sex
  const raceStr = draft.race !== null ? raceName(db, draft.race) : '?';
  const sexStr = draft.sex !== null ? sexName(db, draft.sex) : '?';
  setCursor(top, 0, 1);
  puts(top, `${raceStr} ${sexStr}`, attr);

  // Row 2: class
  const classStr = draft.class !== null ? className(db, draft.class) : '?';
  setCursor(top, 0, 2);
  puts(top, classStr, attr);

  // Row 4: STR / INT / PIE / VIT
  const { str, int: intVal, pie, vit, dex, spd, per, kar } = draft.attributes;
  setCursor(top, 0, 4);
  puts(top, `STR:${str}  INT:${intVal}  PIE:${pie}  VIT:${vit}`, attr);

  // Row 5: DEX / SPD / PER / KAR
  setCursor(top, 0, 5);
  puts(top, `DEX:${dex}  SPD:${spd}  PER:${per}  KAR:${kar}`, attr);

  // Row 7: HP / STM / GOLD
  const hp = draft.derived.hpInitial ?? '?';
  const stm = draft.derived.stamina ?? '?';
  const gold = draft.derived.goldInitial ?? '?';
  setCursor(top, 0, 7);
  puts(top, `HP:${hp}  STM:${stm}  GOLD:${gold}`, attr);
}

// ---------------------------------------------------------------------------
// ConfirmScreen component
// ---------------------------------------------------------------------------

export interface ConfirmScreenProps {
  state: CreationState;
  dispatch: (e: CreationEvent) => void;
  fontSet: FontSet;
  palette: Palette;
  db: MessageDb;
}

/**
 * ConfirmScreen — renders screen-15: KEEP or DISCARD.
 *
 * Dumb component. Cursor (0=YES, 1=NO) is local state. On Enter, dispatches
 * CONFIRM { keep: cursor===0 } to the reducer. Business logic (committing vs
 * cancelling) lives entirely in the reducer.
 */
export function ConfirmScreen({
  state,
  dispatch,
  fontSet,
  palette,
  db,
}: ConfirmScreenProps) {
  // Cursor position: 0=YES, 1=NO. Starts at YES (0) per engine behaviour.
  const [cursorIdx, setCursorIdx] = useState<number>(0);

  // -------------------------------------------------------------------------
  // Key handler
  // -------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          // Move cursor towards YES (index 0), clamping at 0
          setCursorIdx((prev) => Math.max(0, prev - 1));
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          // Move cursor towards NO (index 1), clamping at 1
          setCursorIdx((prev) => Math.min(CONFIRM_OPTIONS.length - 1, prev + 1));
          break;
        case 'Enter': {
          // Confirm: cursor===0 → KEEP (true), cursor===1 → DISCARD (false)
          dispatch({ type: 'CONFIRM', keep: cursorIdx === 0 });
          break;
        }
        // Escape is silently ignored per §8. All other keys are no-ops.
        default:
          break;
      }
    },
    [cursorIdx, dispatch],
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

  // --- top window: character sheet ---
  renderCharSheet(top, state, db);

  // --- bottomBar: prompt line ---
  const promptText = creationString(db, MSG.confirmPrompt);
  if (promptText) {
    setCursor(bottomBar, 0, 0);
    puts(bottomBar, promptText, bottomBar.cells[1] ?? 0x13);
  }

  // --- bottomBar: YES/NO picker (rows 1..2) ---
  // The engine renders the 2-option list via ui_menu_picker_vertical in bottomBar.
  // We render YES on row 1 and NO on row 2, highlighting the cursor row.
  const optionAttr = bottomBar.cells[1] ?? 0x13;
  for (let i = 0; i < CONFIRM_OPTIONS.length; i++) {
    // Use db to resolve the option text if possible; fall back to hardcoded labels.
    // msg 0x045a = "YES" (the first option); "NO" is the second entry in the picker.
    let label: string;
    if (i === 0) {
      label = creationString(db, MSG.confirmOptions) || CONFIRM_OPTIONS[i];
    } else {
      label = CONFIRM_OPTIONS[i]!;
    }

    setCursor(bottomBar, 0, 1 + i);
    puts(bottomBar, label, optionAttr);

    // Highlight the cursor row
    if (i === cursorIdx) {
      highlightRow(bottomBar, 1 + i, 5);
    }
  }

  // Render top + bottomBar (no menuPanel for this screen)
  const windows = [top, bottomBar];
  return <CreationCanvas windows={windows} fontSet={fontSet} palette={pal} />;
}
