/**
 * PortraitChangeScreen — PORTRAIT PC active portrait cycle.
 *
 * Engine: `wpcmk_change_portrait` (wpcmk file 0x5422). The character's
 * existing portrait is loaded into wfont2 at entry, then the picker loop
 * cycles wfont2 as the player presses ◄/►. Layout (verified vs slot 8):
 *
 *   - top: review-style char sheet (drawCharSheet + BONUS hidden). The
 *     small portrait tiles at (1..3, 1..3) attr 0x02 are LOCKED to the
 *     character's stored portrait — written at chars 0x70..0x78, which
 *     wfont2 has patched with the stored portrait's tiles.
 *   - menuPanel: same "CHARACTER PORTRAIT" header + 3×3 big-portrait tile
 *     grid at chars 0x48..0x50. wfont2 has those patched with the
 *     CURRENTLY-CYCLED portrait — this preview is what changes live.
 *
 * Engine mechanism (for context): the engine achieves the same visual
 * result via incremental rendering rather than dual glyph ranges.
 * `wpcmk_load_and_draw_character` paints the small portrait into VRAM
 * before entering `wpcmk_pick_portrait_loop`; the loop only redraws the
 * menuPanel area as wfont2 cycles, leaving the top window's VRAM pixels
 * intact. Our viewer is immediate-mode (every frame re-renders all
 * windows), so we use the dual-glyph-range trick to decouple instead.
 * See `patchFontSetWithTwoPortraits` in skill-train-frame.ts.
 *   - bottomBar row 1: "◄► TO REVIEW PORTRAITS" (msg 0x0458).
 *   - bottomBar row 2: "PRESS ▶ TO SELECT"      (msg 0x0459).
 *
 * Picker starts at the character's CURRENT portrait index (not 0). On
 * Enter, if the index changed, we updateCharacter() and dispatch
 * CONFIRM_PORTRAIT_CHANGE → portraitDone; if unchanged, dispatch
 * CANCEL_PORTRAIT_CHANGE → characterMenu (engine skips the preview).
 *
 * Spec: docs/re/findings/wpcmk-review-character.json + creation portrait
 * picker findings.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { setCursor, puts } from '@wiz6/parser';
import { WIZ6_MAIN } from '@wiz6/data';
import type { Palette, PortraitSet } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../state.js';
import { createPersistentWindows } from '../ega/windows.js';
import { drawCharSheet } from '../ega/char-sheet.js';
import { CreationCanvas } from '../ega/CreationCanvas.js';
import { patchFontSetWithTwoPortraits, STORED_PORTRAIT_GLYPH_BASE } from '../ega/skill-train-frame.js';
import { MSG, creationString } from '../messages.js';
import { draftFromCharacter } from '../lib/draft-from-character.js';
import { readRoster, updateCharacter } from '../../../../lib/roster-store.js';

const PORTRAIT_COUNT = 42;
const PORTRAIT_GLYPH_BASE = 0x48;
const PORTRAIT_CELL_X = 8;
const PORTRAIT_CELL_Y = 3;

export interface PortraitChangeScreenProps {
  state: CreationState;
  dispatch: (e: CreationEvent) => void;
  fontSet: FontSet;
  palette: Palette;
  db: MessageDb;
  portraits?: PortraitSet[];
}

export function PortraitChangeScreen({
  state,
  dispatch,
  fontSet,
  palette,
  db,
  portraits = [],
}: PortraitChangeScreenProps) {
  const character = useMemo(() => {
    if (state.rosterIndex === null) return null;
    try {
      return readRoster().characters[state.rosterIndex] ?? null;
    } catch {
      return null;
    }
  }, [state.rosterIndex]);

  // Original portrait index, captured at mount via useState initializer.
  // Used to decide whether the user actually changed anything on Enter.
  const [originalIdx] = useState<number>(() => character?.portraitIndex ?? 0);
  // Live cursor — engine starts the picker at the character's current portrait,
  // NOT at 0. Cycles 0..41 via ◄/►.
  const [portraitIdx, setPortraitIdx] = useState<number>(() =>
    character?.portraitIndex ?? 0,
  );

  // Bail if the character disappeared.
  useEffect(() => {
    if (state.rosterIndex !== null && character === null) {
      dispatch({ type: 'CANCEL_PORTRAIT_CHANGE' });
    }
  }, [character, state.rosterIndex, dispatch]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          setPortraitIdx((prev) => (prev + PORTRAIT_COUNT - 1) % PORTRAIT_COUNT);
          break;
        case 'ArrowRight':
          setPortraitIdx((prev) => (prev + 1) % PORTRAIT_COUNT);
          break;
        case 'Enter': {
          if (!character) return;
          if (portraitIdx === originalIdx) {
            dispatch({ type: 'CANCEL_PORTRAIT_CHANGE' });
          } else {
            updateCharacter({ ...character, portraitIndex: portraitIdx });
            dispatch({ type: 'CONFIRM_PORTRAIT_CHANGE' });
          }
          break;
        }
        case 'Escape':
          dispatch({ type: 'CANCEL_PORTRAIT_CHANGE' });
          break;
        default:
          break;
      }
    },
    [portraitIdx, originalIdx, character, dispatch],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Render ───────────────────────────────────────────────────────────────

  const pal = palette ?? WIZ6_MAIN;
  // Patch font2 with BOTH portraits — the cycling preview at the standard
  // 0x48..0x50 slots (used by the menuPanel) AND the LOCKED stored portrait
  // at 0x70..0x78 (used by the small char-sheet portrait). This decouples
  // the two areas so cycling only changes the big preview.
  const fontSetWithPortraits = useMemo(
    () => patchFontSetWithTwoPortraits(fontSet, portraits, portraitIdx, originalIdx),
    [fontSet, portraits, portraitIdx, originalIdx],
  );

  const { top, bottomBar, menuPanel } = createPersistentWindows();
  if (character) {
    const draft = draftFromCharacter(character);
    // Engine puts "CHARACTER PORTRAIT" (msg 0x045f) in the status-row title
    // slot — same as the creation portrait-picker screen.
    drawCharSheet(top, draft, db, creationString(db, MSG.portraitTitle));
    // Small portrait tiles at top (1..3, 1..3) attr 0x02 — write at the
    // STORED-PORTRAIT char range (0x70..0x78) so this area always renders the
    // character's actual current portrait, regardless of where the picker is.
    for (let r = 0; r < 3; r++) {
      setCursor(top, 1, 1 + r);
      puts(
        top,
        String.fromCharCode(STORED_PORTRAIT_GLYPH_BASE + r * 3) +
          String.fromCharCode(STORED_PORTRAIT_GLYPH_BASE + r * 3 + 1) +
          String.fromCharCode(STORED_PORTRAIT_GLYPH_BASE + r * 3 + 2),
        0x02,
      );
    }
  }

  // menuPanel: 3×3 big-portrait tile grid at (8,3)..(10,5) attr 0x02.
  for (let r = 0; r < 3; r++) {
    setCursor(menuPanel, PORTRAIT_CELL_X, PORTRAIT_CELL_Y + r);
    for (let c = 0; c < 3; c++) {
      puts(
        menuPanel,
        String.fromCharCode(PORTRAIT_GLYPH_BASE + r * 3 + c),
        0x02,
      );
    }
  }

  // bottomBar: "◄► TO REVIEW PORTRAITS" row 1, "PRESS ▶ TO SELECT" row 2.
  // Both attr 0x03, ceil centering (matches creation PortraitPickerScreen).
  const review = creationString(db, MSG.portraitReview);
  setCursor(bottomBar, Math.ceil((bottomBar.widthCells - review.length) / 2), 1);
  puts(bottomBar, review, 0x03);
  const select = creationString(db, MSG.portraitSelect);
  setCursor(bottomBar, Math.ceil((bottomBar.widthCells - select.length) / 2), 2);
  puts(bottomBar, select, 0x03);

  return (
    <CreationCanvas
      windows={[top, bottomBar, menuPanel]}
      fontSet={fontSetWithPortraits}
      palette={pal}
    />
  );
}
