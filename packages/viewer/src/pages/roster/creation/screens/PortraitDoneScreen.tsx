/**
 * PortraitDoneScreen — post-confirmation preview for PORTRAIT PC.
 *
 * Engine: the tail of `wpcmk_change_portrait` after the picker loop returns
 * with a CHANGED portrait — writes the record to disk, then
 * `ui_wait_for_enter_or_click()` to dismiss.
 *
 * Layout (verified vs slot 9): identical to ReviewScreen — char sheet with
 * the NEW portrait baked in + "PRESS ▶ TO EXIT" centered at bottomBar row 1.
 * The only difference is that the rosterIndex now refers to the just-
 * updated character (with the new portraitIndex already written).
 *
 * Behavior: Enter / Escape → dispatch EXIT_PORTRAIT_CHANGE.
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

export interface PortraitDoneScreenProps {
  state: CreationState;
  dispatch: (e: CreationEvent) => void;
  fontSet: FontSet;
  palette: Palette;
  db: MessageDb;
  portraits?: PortraitSet[];
}

export function PortraitDoneScreen({
  state,
  dispatch,
  fontSet,
  palette,
  db,
  portraits = [],
}: PortraitDoneScreenProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        dispatch({ type: 'EXIT_PORTRAIT_CHANGE' });
      }
    },
    [dispatch],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const character = useMemo(() => {
    if (state.rosterIndex === null) return null;
    try {
      return readRoster().characters[state.rosterIndex] ?? null;
    } catch {
      return null;
    }
  }, [state.rosterIndex]);

  useEffect(() => {
    if (state.rosterIndex !== null && character === null) {
      dispatch({ type: 'EXIT_PORTRAIT_CHANGE' });
    }
  }, [character, state.rosterIndex, dispatch]);

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

  // bottomBar row 1: "PRESS ▶ TO EXIT" — same as ReviewScreen.
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
