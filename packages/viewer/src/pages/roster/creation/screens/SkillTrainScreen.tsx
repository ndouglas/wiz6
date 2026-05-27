/**
 * SkillTrainScreen — screen-13: skill training.
 *
 * The player spends `state.draft.skillBudget` points across the trainable skill
 * slots for their class (from CLASS_SKILL_AVAILABILITY[classIdx]). The screen
 * loops until the budget hits 0.
 *
 * Key handlers per §5/§8:
 *   ArrowUp    (code 2) → cursor = prev trainable slot (clamp at start, no wrap)
 *   ArrowDown  (code 4) → cursor = next trainable slot (clamp at end, no wrap)
 *   ArrowRight (code 3) → dispatch TRAIN_SKILL { slot: <cursor slot> }
 *   Enter      (code 5) → dispatch TRAIN_SKILL { slot: <cursor slot> }
 *   ArrowLeft  (code 1) → no-op (no decrease for skill points)
 *   Escape     (code 0) → silently ignored per §8
 *
 * Budget enforcement:
 *   - The REDUCER owns budget decrement, skills[] increment, and auto-advance
 *     when budget reaches 0 (TRAIN_SKILL sets screen → spellPick|confirm
 *     when newBudget <= 0). The screen dispatches TRAIN_SKILL unconditionally.
 *   - No SKILLS_DONE dispatch needed: the reducer auto-advances on budget 0.
 *   - No double-enforcement in the screen.
 *
 * Render:
 *   - Uses the temporary `skillTrain` window (20×16 @ (160,32) attr 0x19) per §2.
 *   - Shows skill-category headers (WEAPONRY/PHYSICAL/PERSONAL/ACADEMIA per §5).
 *   - Lists trainable skill names within each category.
 *   - Highlights the cursor row via highlightRow (bgPaletteIdx=5).
 *   - Shows "SKILL POINTS: N" budget counter via MSG.skillPoints (0x159a).
 *
 * Spec: docs/re/wpcmk-screens.md §5, §8
 */

import { useState, useEffect, useCallback } from 'react';
import { clearWindow, setCursor, puts } from '@wiz6/parser';
import { WIZ6_MAIN, availableSkillSlots } from '@wiz6/data';
import type { Palette } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../state.js';
import { createPersistentWindows, createSkillTrainWindow } from '../ega/windows.js';
import { highlightRow } from '../ega/highlight.js';
import { CreationCanvas } from '../ega/CreationCanvas.js';
import {
  MSG,
  creationString,
  skillName,
  skillCatName,
} from '../messages.js';
import { mapKey } from './ScreenProps.js';

// ---------------------------------------------------------------------------
// Category groupings — match the engine's 4-pillar cycle per §5
// ---------------------------------------------------------------------------

/**
 * Skill-category definitions matching the wpcmk §5 "4-pillar cycle":
 * WEAPONRY → PHYSICAL → PERSONAL → ACADEMIA.
 *
 * The engine groups the 30 skill slots into 4 categories by the bit-block
 * sizes [10, 7, 5, 8]:
 *   WEAPONRY  = slots  0.. 9 (10 slots)
 *   PHYSICAL  = slots 10..16 (7 slots)
 *   PERSONAL  = slots 17..21 (5 slots)
 *   ACADEMIA  = slots 22..29 (8 slots)
 */
const SKILL_CATEGORIES: readonly { msgOffset: number; startSlot: number; endSlot: number }[] = [
  { msgOffset: 0, startSlot: 0, endSlot: 9 },   // WEAPONRY (0x258)
  { msgOffset: 1, startSlot: 10, endSlot: 16 },  // PHYSICAL (0x259)
  { msgOffset: 2, startSlot: 17, endSlot: 21 },  // PERSONAL (0x25a)
  { msgOffset: 3, startSlot: 22, endSlot: 29 },  // ACADEMIA (0x25b)
] as const;

// ---------------------------------------------------------------------------
// SkillTrainScreen component
// ---------------------------------------------------------------------------

export interface SkillTrainScreenProps {
  state: CreationState;
  dispatch: (e: CreationEvent) => void;
  fontSet: FontSet;
  palette: Palette;
  db: MessageDb;
}

/**
 * SkillTrainScreen — renders screen-13: class-specific skill training.
 *
 * Dumb component. Budget decrement + skills[] increment live in the reducer.
 * Local state tracks only the cursor position (index into the trainable-slots array).
 */
export function SkillTrainScreen({
  state,
  dispatch,
  fontSet,
  palette,
  db,
}: SkillTrainScreenProps) {
  // Derive trainable slots for this character's class
  const classIdx = state.draft.class ?? 0;
  const trainableSlots = availableSkillSlots(classIdx);

  // Cursor: index into trainableSlots array (not a slot number directly).
  // Seeded to 0 (first trainable slot).
  const [cursorIdx, setCursorIdx] = useState<number>(0);

  // -------------------------------------------------------------------------
  // Key handler
  // -------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const code = mapKey(e);
      if (code === null) return;

      switch (code) {
        case 2: // ArrowUp — prev trainable slot (clamp at start, no wrap)
          setCursorIdx((prev) => Math.max(0, prev - 1));
          break;
        case 4: // ArrowDown — next trainable slot (clamp at end, no wrap)
          setCursorIdx((prev) => Math.min(trainableSlots.length - 1, prev + 1));
          break;
        case 3: // ArrowRight — allocate point to current cursor skill
        case 5: { // Enter — same as ArrowRight per §5/§8
          const slot = trainableSlots[cursorIdx];
          if (slot !== undefined) {
            dispatch({ type: 'TRAIN_SKILL', slot });
          }
          break;
        }
        case 1: // ArrowLeft — no-op for skill training (no decrease)
        default:
          break;
      }
    },
    [cursorIdx, trainableSlots, dispatch],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const { top, bottomBar } = createPersistentWindows();
  const skillWin = createSkillTrainWindow();
  const pal = palette ?? WIZ6_MAIN;

  // --- skillTrain window: show category headers + trainable skill names ---

  clearWindow(skillWin, 0x20 /* space */, 0x19);
  let row = 0;

  for (const cat of SKILL_CATEGORIES) {
    // Only render categories that have at least one trainable slot for this class
    const trainableInCat = trainableSlots.filter(
      (s) => s >= cat.startSlot && s <= cat.endSlot,
    );
    if (trainableInCat.length === 0) continue;

    // Category header
    const catLabel = skillCatName(db, cat.msgOffset);
    if (catLabel && row < skillWin.heightCells) {
      setCursor(skillWin, 0, row);
      puts(skillWin, catLabel, skillWin.cells[1] ?? 0x19);
      row++;
    }

    // Skill entries in this category
    for (const slot of trainableInCat) {
      if (row >= skillWin.heightCells) break;
      const name = skillName(db, slot);
      const displayName = name || `SKILL ${slot}`;
      // Find the cursor position for this slot
      const slotCursorIdx = trainableSlots.indexOf(slot);

      setCursor(skillWin, 1, row); // indent by 1 column under the category header
      puts(skillWin, displayName, skillWin.cells[1] ?? 0x19);

      if (slotCursorIdx === cursorIdx) {
        highlightRow(skillWin, row, 5);
      }

      row++;
    }
  }

  // --- bottomBar: "SKILL POINTS: N" ---
  const skillPtsLabel = creationString(db, MSG.skillPoints);
  const budgetLine = skillPtsLabel
    ? `${skillPtsLabel}: ${state.draft.skillBudget}`
    : `SKILL POINTS: ${state.draft.skillBudget}`;
  setCursor(bottomBar, 0, 0);
  puts(bottomBar, budgetLine, bottomBar.cells[1] ?? 0x13);

  // --- top: show a brief status header ---
  setCursor(top, 0, 0);
  puts(top, 'SKILL TRAINING', top.cells[1] ?? 0x14);

  const windows = [top, bottomBar, skillWin];

  return <CreationCanvas windows={windows} fontSet={fontSet} palette={pal} />;
}
