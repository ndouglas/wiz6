/**
 * SkillTrainScreen — screen-13: ASSIGN INITIAL SKILL BONUS.
 *
 * Layout: `composeSkillTrainFrame` (ega/skill-train-frame.ts) — verified
 * pixel-exact against the engine's slot-1 framebuffer in
 * `tools/parity/screen-parity.test.ts → creation-skill-train` (floor 100%).
 *
 * Behavior per docs/re/wpcmk-screens.md §5 + bottomBar prompts dumped from
 * save 1:
 *   - ArrowUp (key 2)    → cursor prev (clamp; no wrap)
 *   - ArrowDown (key 4)  → cursor next (clamp; no wrap)
 *   - ArrowRight (key 3) → spend 1 point on the cursor skill (dispatch
 *                          TRAIN_SKILL). Reducer auto-advances when budget=0.
 *   - Enter (key 5)      → "PRESS ▶ FOR NEXT CATEGORY" — advance category.
 *                          Skips empty categories. Wraps WEAPONRY → PHYSICAL
 *                          → PERSONAL → ACADEMIA → WEAPONRY.
 *   - ArrowLeft / Escape → no-op (no untrain).
 *
 * The portrait chosen in the previous screen is permanently baked into wfont2
 * at glyphs 0x48..0x50 — `patchFontSetWithPortrait` clones font2 with the
 * portrait's 9 tiles. Memoized by portrait index so the patch only recomputes
 * on actual portrait change (never, in this screen).
 *
 * Reducer interface: dispatches `TRAIN_SKILL { slot }`. The "next category"
 * advance is screen-local (no reducer event) since the engine treats it as a
 * UI cycle, not a state machine transition.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
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

export interface SkillTrainScreenProps {
  state: CreationState;
  dispatch: (e: CreationEvent) => void;
  fontSet: FontSet;
  palette: Palette;
  db: MessageDb;
  /** [wport1, wport2, wport3] — 14 portraits each. Falls back gracefully if empty. */
  portraits?: PortraitSet[];
}

/**
 * Derive trainable skill slots in a given category for the given class.
 *
 * Filters `availableSkillSlots(classIdx)` by the slot range belonging to the
 * category (e.g. WEAPONRY = slots 0..9). Returns the slots in slot-index order
 * (matches the engine's rendering order).
 */
function trainableInCategory(classIdx: number, categoryIdx: number): number[] {
  const cat = SKILL_CATEGORIES[categoryIdx]!;
  return availableSkillSlots(classIdx).filter(
    (slot) => slot >= cat.startSlot && slot <= cat.endSlot,
  );
}

export function SkillTrainScreen({
  state,
  dispatch,
  fontSet,
  palette,
  db,
  portraits = [],
}: SkillTrainScreenProps) {
  const classIdx = state.draft.class ?? 0;

  // Category cycle is screen-local. Start at WEAPONRY; if it has no trainable
  // slots for this class (unusual), advance until we find one. This keeps the
  // cursor + render in a valid state on mount.
  const [categoryIdx, setCategoryIdx] = useState<number>(() => {
    for (let i = 0; i < SKILL_CATEGORIES.length; i++) {
      if (trainableInCategory(classIdx, i).length > 0) return i;
    }
    return 0;
  });

  const [cursorIdx, setCursorIdx] = useState<number>(0);

  // Filter trainable slots for the current category.
  const trainable = useMemo(
    () => trainableInCategory(classIdx, categoryIdx),
    [classIdx, categoryIdx],
  );

  // Reset cursor if it falls off after a category change.
  useEffect(() => {
    if (cursorIdx >= trainable.length) {
      setCursorIdx(Math.max(0, trainable.length - 1));
    }
  }, [trainable.length, cursorIdx]);

  // ── Key handler ────────────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          setCursorIdx((prev) => Math.max(0, prev - 1));
          break;
        case 'ArrowDown':
          setCursorIdx((prev) => Math.min(trainable.length - 1, prev + 1));
          break;
        case 'ArrowRight': {
          const slot = trainable[cursorIdx];
          if (slot !== undefined && state.draft.skillBudget > 0) {
            dispatch({ type: 'TRAIN_SKILL', slot });
          }
          break;
        }
        case 'Enter': {
          // Engine bottomBar toggles row 3 by budget:
          //   - budget > 0  → "PRESS ▶ FOR NEXT CATEGORY" — Enter cycles category
          //   - budget == 0 → "PRESS ▶ TO EXIT"           — Enter exits the screen
          // The engine does NOT auto-advance on budget reaching 0; the player
          // must press Enter to leave (verified vs slot 1).
          if (state.draft.skillBudget <= 0) {
            dispatch({ type: 'SKILLS_DONE' });
          } else {
            for (let step = 1; step <= SKILL_CATEGORIES.length; step++) {
              const next = (categoryIdx + step) % SKILL_CATEGORIES.length;
              if (trainableInCategory(classIdx, next).length > 0) {
                setCategoryIdx(next);
                setCursorIdx(0);
                break;
              }
            }
          }
          break;
        }
        default:
          break;
      }
    },
    [trainable, cursorIdx, categoryIdx, classIdx, state.draft.skillBudget, dispatch],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const pal = palette ?? WIZ6_MAIN;
  const portraitIdx = state.draft.portrait;

  // Persistent portrait font2 patch — cloned once per portrait change.
  const fontSetWithPortrait = useMemo(
    () => patchFontSetWithPortrait(fontSet, portraits, portraitIdx),
    [fontSet, portraits, portraitIdx],
  );

  const windows = composeSkillTrainFrame(
    {
      draft: state.draft,
      categoryIdx,
      trainableInCategory: trainable,
      cursorIdx,
      skillPoints: state.draft.skillBudget,
    },
    db,
  );

  return <CreationCanvas windows={windows} fontSet={fontSetWithPortrait} palette={pal} />;
}
