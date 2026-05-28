/**
 * ConfirmScreen — screen-15: SAVE THIS CHARACTER?
 *
 * Engine layout (verified vs slot 1 cell dump):
 *   - top + skillTrain panels remain visible exactly as they were on
 *     skill-train screen exit: char-sheet with persistent portrait, age
 *     fields, WEAPONRY (or last-active) category, final skill values, and
 *     SKILL POINTS = 0. The selection cursor is cleared but a gray-space
 *     RESIDUAL marker remains at (15, 3+lastCursorIdx) at attr 0x70.
 *   - bottomBar row 1 (single row): "SAVE THIS CHARACTER? YES NO" centered at
 *     col 6 (floor((40-27)/2) = 6). YES rendered at attr 0x50 when selected
 *     (cursor 0); NO at attr 0x50 when selected (cursor 1). The unselected
 *     option is attr 0x03.
 *
 * Behavior per docs/re/wpcmk-screens.md §10, §3, §8:
 *   - Cursor starts at YES (0).
 *   - ArrowLeft/ArrowUp  → YES (0); ArrowRight/ArrowDown → NO (1). Clamp.
 *   - Enter → dispatch CONFIRM { keep: cursor === 0 }.
 *   - Escape: silently ignored.
 *
 * Implementation: delegates the top + skillTrain panel rendering to
 * `composeSkillTrainFrame` with cursorState='residual' and a custom
 * `renderBottomBar` callback that draws the confirm prompt instead of the
 * skill-train prompts.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { setCursor, puts } from '@wiz6/parser';
import type { TileWindow } from '@wiz6/parser';
import { WIZ6_MAIN, availableSkillSlots } from '@wiz6/data';
import type { Palette, PortraitSet } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../state.js';
import { CreationCanvas } from '../ega/CreationCanvas.js';
import {
  composeSkillTrainFrame,
  patchFontSetWithPortrait,
  SKILL_CATEGORIES,
} from '../ega/skill-train-frame.js';
import { MSG, creationString } from '../messages.js';

export interface ConfirmScreenProps {
  state: CreationState;
  dispatch: (e: CreationEvent) => void;
  fontSet: FontSet;
  palette: Palette;
  db: MessageDb;
  /** [wport1, wport2, wport3] — for the persistent portrait font2 patch. */
  portraits?: PortraitSet[];
}

/**
 * For the confirm screen, the skillTrain panel persists from the player's last
 * skill-train category (engine doesn't repaint it). We default to the first
 * non-empty category for the character's class — close enough for the engine's
 * behavior, since the screen layout is identical regardless of which category
 * is shown (only the names + final skill values change).
 */
function lastSkillCategoryForClass(classIdx: number): {
  categoryIdx: number;
  trainable: number[];
} {
  const allSlots = availableSkillSlots(classIdx);
  for (let i = 0; i < SKILL_CATEGORIES.length; i++) {
    const cat = SKILL_CATEGORIES[i]!;
    const trainable = allSlots.filter((s) => s >= cat.startSlot && s <= cat.endSlot);
    if (trainable.length > 0) return { categoryIdx: i, trainable };
  }
  return { categoryIdx: 0, trainable: [] };
}

export function ConfirmScreen({
  state,
  dispatch,
  fontSet,
  palette,
  db,
  portraits = [],
}: ConfirmScreenProps) {
  const [cursorIdx, setCursorIdx] = useState<number>(0);

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
        case 'Enter':
          dispatch({ type: 'CONFIRM', keep: cursorIdx === 0 });
          break;
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

  // ── Render ───────────────────────────────────────────────────────────────

  const pal = palette ?? WIZ6_MAIN;
  const classIdx = state.draft.class ?? 0;
  const { categoryIdx, trainable } = lastSkillCategoryForClass(classIdx);

  const fontSetWithPortrait = useMemo(
    () => patchFontSetWithPortrait(fontSet, portraits, state.draft.portrait),
    [fontSet, portraits, state.draft.portrait],
  );

  // bottomBar renderer: "SAVE THIS CHARACTER? YES NO" centered at col 6 (floor
  // padding for a 27-cell string in 40 cells). YES/NO at attr 0x50 when
  // selected, attr 0x03 when not.
  const renderBottomBar = (bb: TileWindow): void => {
    const prompt = creationString(db, MSG.confirmPrompt); // "SAVE THIS CHARACTER?"
    const yes = creationString(db, MSG.confirmYes);       // "YES"
    const no = creationString(db, MSG.confirmNo);         // "NO"
    const full = `${prompt} ${yes} ${no}`;
    const startCol = Math.floor((bb.widthCells - full.length) / 2);

    // Write the prompt + spaces as plain attr 0x03 first, then overwrite the
    // YES/NO cells based on the cursor selection.
    setCursor(bb, startCol, 1);
    puts(bb, full, 0x03);

    // Highlight the selected option at attr 0x50.
    const yesCol = startCol + prompt.length + 1;
    const noCol = yesCol + yes.length + 1;
    if (cursorIdx === 0) {
      setCursor(bb, yesCol, 1);
      puts(bb, yes, 0x50);
    } else {
      setCursor(bb, noCol, 1);
      puts(bb, no, 0x50);
    }
  };

  const windows = composeSkillTrainFrame(
    {
      draft: state.draft,
      categoryIdx,
      trainableInCategory: trainable,
      // The engine doesn't track which row the cursor was last on at the
      // confirm screen — it just keeps a residual at row 3 (the first trainable
      // slot — see slot-1 cell dump). Match that.
      cursorIdx: 0,
      cursorState: 'residual',
      skillPoints: state.draft.skillBudget,
    },
    db,
    renderBottomBar,
  );

  return <CreationCanvas windows={windows} fontSet={fontSetWithPortrait} palette={pal} />;
}
