/**
 * DeleteConfirmScreen — DELETE PC confirm modal.
 *
 * Layout (verified vs slot 4):
 *   - top + skillTrain + menuPanel: same review-style char sheet as
 *     ReviewScreen (drawCharSheet + persistent portrait + BONUS row hidden).
 *   - bottomBar row 1: "DELETE THIS CHARACTER? YES NO" centered at col 5
 *     (29-char string, floor((40-29)/2) = 5).
 *   - **NO is selected by default** (attr 0x50 on NO, attr 0x03 on YES) —
 *     matches the engine's safer-default policy for destructive actions.
 *
 * Behavior:
 *   ArrowLeft / ArrowUp   → cursor toward YES (idx 0), clamp
 *   ArrowRight / ArrowDown → cursor toward NO  (idx 1), clamp
 *   Enter on YES (cursor 0) → removeCharacter(id) + CONFIRM_DELETE { delete: true }
 *   Enter on NO  (cursor 1) → CONFIRM_DELETE { delete: false } (no I/O)
 *   Escape                  → dispatch CANCEL_DELETE (no I/O)
 *
 * The screen owns the localStorage write — the reducer just transitions
 * back to characterMenu. Keeping I/O out of the reducer matches how
 * `buildCharacterFromDraft` / `addCharacter` work on the commit path.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { setCursor, puts } from '@wiz6/parser';
import { WIZ6_MAIN } from '@wiz6/data';
import type { Palette, PortraitSet } from '@wiz6/data';
import type { FontSet, TileWindow } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../state.js';
import { createPersistentWindows } from '../ega/windows.js';
import { drawCharSheet } from '../ega/char-sheet.js';
import { CreationCanvas } from '../ega/CreationCanvas.js';
import { patchFontSetWithPortrait } from '../ega/skill-train-frame.js';
import { MSG, creationString } from '../messages.js';
import { draftFromCharacter } from '../lib/draft-from-character.js';
import { readRoster, removeCharacter } from '../../../../lib/roster-store.js';

export interface DeleteConfirmScreenProps {
  state: CreationState;
  dispatch: (e: CreationEvent) => void;
  fontSet: FontSet;
  palette: Palette;
  db: MessageDb;
  portraits?: PortraitSet[];
}

/**
 * Draw the bottomBar prompt "DELETE THIS CHARACTER? YES NO" centered at row 1.
 * The selected option (cursorIdx 0=YES, 1=NO) is highlighted at attr 0x50;
 * the other at attr 0x03.
 */
function drawDeleteConfirmBar(
  bb: TileWindow,
  db: MessageDb,
  cursorIdx: number,
): void {
  const prompt = creationString(db, MSG.deleteThisCharacter);
  const yes = creationString(db, MSG.confirmYes);
  const no = creationString(db, MSG.confirmNo);
  const full = `${prompt} ${yes} ${no}`;
  const startCol = Math.floor((bb.widthCells - full.length) / 2);

  // Base pass: write the entire string at attr 0x03.
  setCursor(bb, startCol, 1);
  puts(bb, full, 0x03);

  // Overwrite the selected option's cells at attr 0x50 (highlight).
  const yesCol = startCol + prompt.length + 1;
  const noCol = yesCol + yes.length + 1;
  if (cursorIdx === 0) {
    setCursor(bb, yesCol, 1);
    puts(bb, yes, 0x50);
  } else {
    setCursor(bb, noCol, 1);
    puts(bb, no, 0x50);
  }
}

export function DeleteConfirmScreen({
  state,
  dispatch,
  fontSet,
  palette,
  db,
  portraits = [],
}: DeleteConfirmScreenProps) {
  // Default cursor on NO (1) — safer default for a destructive action.
  // Matches engine slot 4 cells where NO is highlighted, YES is not.
  const [cursorIdx, setCursorIdx] = useState<number>(1);

  const character = useMemo(() => {
    if (state.rosterIndex === null) return null;
    try {
      return readRoster().characters[state.rosterIndex] ?? null;
    } catch {
      return null;
    }
  }, [state.rosterIndex]);

  // Bail if the character disappeared between picker and confirm.
  useEffect(() => {
    if (state.rosterIndex !== null && character === null) {
      dispatch({ type: 'CANCEL_DELETE' });
    }
  }, [character, state.rosterIndex, dispatch]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          setCursorIdx((prev) => Math.max(0, prev - 1));
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          setCursorIdx((prev) => Math.min(1, prev + 1));
          break;
        case 'Enter': {
          if (cursorIdx === 0 && character) {
            removeCharacter(character.id);
            dispatch({ type: 'CONFIRM_DELETE', delete: true });
          } else {
            dispatch({ type: 'CONFIRM_DELETE', delete: false });
          }
          break;
        }
        case 'Escape':
          dispatch({ type: 'CANCEL_DELETE' });
          break;
        default:
          break;
      }
    },
    [cursorIdx, character, dispatch],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Render ───────────────────────────────────────────────────────────────

  const pal = palette ?? WIZ6_MAIN;
  const portraitIdx = character?.portraitIndex ?? 0;
  const fontSetWithPortrait = useMemo(
    () => patchFontSetWithPortrait(fontSet, portraits, portraitIdx),
    [fontSet, portraits, portraitIdx],
  );

  const { top, bottomBar, menuPanel } = createPersistentWindows();
  if (character) {
    const draft = draftFromCharacter(character);
    drawCharSheet(top, draft, db);
    // Persistent portrait tiles at top (1..3, 1..3) attr 0x02.
    for (let r = 0; r < 3; r++) {
      setCursor(top, 1, 1 + r);
      puts(
        top,
        String.fromCharCode(0x48 + r * 3) +
          String.fromCharCode(0x48 + r * 3 + 1) +
          String.fromCharCode(0x48 + r * 3 + 2),
        0x02,
      );
    }
  }

  drawDeleteConfirmBar(bottomBar, db, cursorIdx);

  return (
    <CreationCanvas
      windows={[top, bottomBar, menuPanel]}
      fontSet={fontSetWithPortrait}
      palette={pal}
    />
  );
}
