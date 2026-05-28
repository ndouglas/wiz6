/**
 * ReviewScreen — REVIEW PC: render the selected roster character's char sheet.
 *
 * Engine: `wpcmk_view_character` (wpcmk file 0x545c) → `wpcmk_load_and_draw_character`
 * (0x51c6). The render is the SAME 8-call sequence as the post-portrait creation
 * screens, with one gate flipped: `*0x56ac = -1` hides the BONUS row. The
 * character's portrait is loaded into wfont2 glyphs 0x48..0x50 via
 * `portrait_load_from_disk(*0x560c)` and rendered as the 3×3 tile grid at top
 * (1..3, 1..3) attr 0x02.
 *
 * Behavior: Enter dispatches EXIT_REVIEW → reducer returns to characterMenu.
 *
 * Spec: docs/re/findings/wpcmk-review-character.json
 */

import { useEffect, useCallback, useMemo } from 'react';
import { setCursor, puts } from '@wiz6/parser';
import { WIZ6_MAIN } from '@wiz6/data';
import type { Palette, PortraitSet } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../state.js';
import { createPersistentWindows } from '../ega/windows.js';
import { drawCharSheet } from '../ega/char-sheet.js';
import { CreationCanvas } from '../ega/CreationCanvas.js';
import { patchFontSetWithPortrait } from '../ega/skill-train-frame.js';
import { MSG, creationString } from '../messages.js';
import { draftFromCharacter } from '../lib/draft-from-character.js';
import { readRoster } from '../../../../lib/roster-store.js';

export interface ReviewScreenProps {
  state: CreationState;
  dispatch: (e: CreationEvent) => void;
  fontSet: FontSet;
  palette: Palette;
  db: MessageDb;
  portraits?: PortraitSet[];
}

export function ReviewScreen({
  state,
  dispatch,
  fontSet,
  palette,
  db,
  portraits = [],
}: ReviewScreenProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Engine: any "enter / exit" key returns. Match Enter; let Escape also
      // exit (engine's `ui_wait_for_enter_or_click` polls for any of these).
      if (e.key === 'Enter' || e.key === 'Escape') {
        dispatch({ type: 'EXIT_REVIEW' });
      }
    },
    [dispatch],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Resolve the character being reviewed ────────────────────────────────

  const character = useMemo(() => {
    if (state.rosterIndex === null) return null;
    try {
      const roster = readRoster();
      return roster.characters[state.rosterIndex] ?? null;
    } catch {
      return null;
    }
  }, [state.rosterIndex]);

  // ── Render ───────────────────────────────────────────────────────────────

  const pal = palette ?? WIZ6_MAIN;

  // If the index is bogus (e.g. character was deleted between picker and
  // review), bail out by dispatching EXIT_REVIEW on next tick. Render an
  // empty frame in the meantime.
  useEffect(() => {
    if (state.rosterIndex !== null && character === null) {
      dispatch({ type: 'EXIT_REVIEW' });
    }
  }, [character, state.rosterIndex, dispatch]);

  const portraitIdx = character?.portraitIndex ?? 0;
  const fontSetWithPortrait = useMemo(
    () => patchFontSetWithPortrait(fontSet, portraits, portraitIdx),
    [fontSet, portraits, portraitIdx],
  );

  const { top, bottomBar, menuPanel } = createPersistentWindows();
  if (character) {
    const draft = draftFromCharacter(character);
    // Engine: no title text in the row-5 status slot for the review screen
    // (the persistent windows clear it to gray spaces, and ui_redraw_character_sheet
    // doesn't overwrite). Pass undefined.
    drawCharSheet(top, draft, db);
    // Portrait tiles HIJ/KLM/NOP at (1..3, 1..3) attr 0x02 (wfont2). The
    // engine calls `ui_draw_portrait_frame(top, 1, 1)` — verified at wpcmk
    // file 0x0c12 as a plain 3×3 tile-grid placement, no chrome.
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

  // bottomBar: "PRESS ▶ TO EXIT" centered at row 1 (verified vs slot 2 cells:
  // text starts at col 12, 15 chars → floor((40-15)/2) = 12). NOTE: the
  // skill-train EXIT prompt is at row 3; the review-screen EXIT is at row 1.
  const exitPrompt = creationString(db, MSG.skillExit);
  setCursor(bottomBar, Math.floor((bottomBar.widthCells - exitPrompt.length) / 2), 1);
  puts(bottomBar, exitPrompt, 0x03);

  return (
    <CreationCanvas
      windows={[top, bottomBar, menuPanel]}
      fontSet={fontSetWithPortrait}
      palette={pal}
    />
  );
}
