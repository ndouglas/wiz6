/**
 * PersonalityScreen — screen-08: karma roll loop.
 *
 * The engine continuously rolls a karma value (uniform 0..18) while displaying
 * it in the char-sheet KAR slot, waiting for the player to press RETURN. The
 * displayed value changes pseudorandomly during the animation; on RETURN, the
 * current roll is frozen and (per `rollKarmaWith`) +1 personality bonus is
 * added. Nate confirmed: "the karma score is changing pseudorandomly when the
 * state is saved" — engine rolls in real time.
 *
 * Our model:
 *   - Local `displayKarma` ticks every ~80ms via a cosmetic RNG (Math.random) —
 *     this drives only the visual; it does NOT advance `state.rng`.
 *   - drawCharSheet renders a synthetic draft where `attributes.kar = displayKarma`.
 *   - "CASTING KARMA - PRESS ►" (MSG 0x0457) centered in the bottomBar.
 *   - RETURN → dispatch ACCEPT_PERSONALITY; the reducer fires a single
 *     authoritative `rollKarmaWith(state.rng, true)` and transitions to portrait.
 *   - All other keys are no-ops (spec §8: screen-08 is CR-only).
 *
 * The reducer's roll is the AUTHORITATIVE karma (saved to the character); the
 * on-screen animation is purely visual. Faithful to engine UX without the
 * complication of running the engine RNG through every animation frame.
 *
 * Spec: docs/re/wpcmk-screens.md §1, §3, §8
 */

import { useEffect, useCallback, useState } from 'react';
import { clearWindow, setCursor, puts } from '@wiz6/parser';
import { WIZ6_MAIN } from '@wiz6/data';
import type { Palette } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../state.js';
import { createPersistentWindows } from '../ega/windows.js';
import { drawCharSheet } from '../ega/char-sheet.js';
import { CreationCanvas } from '../ega/CreationCanvas.js';
import { MSG, creationString } from '../messages.js';

// ---------------------------------------------------------------------------
// PersonalityScreen component
// ---------------------------------------------------------------------------

export interface PersonalityScreenProps {
  state: CreationState;
  dispatch: (e: CreationEvent) => void;
  fontSet: FontSet;
  palette: Palette;
  db: MessageDb;
}

/**
 * PersonalityScreen — renders screen-08: karma display + accept.
 *
 * Dumb component. The karma roll fires in the reducer on ACCEPT_PERSONALITY.
 * This screen just displays the current kar value and waits for Enter.
 */
export function PersonalityScreen({
  state,
  dispatch,
  fontSet,
  palette,
  db,
}: PersonalityScreenProps) {
  // -------------------------------------------------------------------------
  // Rolling karma animation — cosmetic only (decoupled from state.rng).
  // -------------------------------------------------------------------------

  const [displayKarma, setDisplayKarma] = useState<number>(() =>
    Math.floor(Math.random() * 19),
  );

  useEffect(() => {
    // Engine cadence: ~20 Hz wpcmk loop tick (busy-wait calibrated to 486DX/33).
    // 80ms ≈ 12.5 Hz — slow enough to read each number, fast enough to feel
    // animated. The exact wall-clock isn't engine-byte-faithful (the engine
    // calibrates to CPU speed); we tune by feel per the CLAUDE.md wall-clock-
    // parity note.
    const id = window.setInterval(() => {
      setDisplayKarma(Math.floor(Math.random() * 19));
    }, 80);
    return () => window.clearInterval(id);
  }, []);

  // -------------------------------------------------------------------------
  // Key handler — Enter only; all other keys are no-ops
  // -------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        dispatch({ type: 'ACCEPT_PERSONALITY' });
      }
      // All other keys silently ignored — screen-08 is CR-only per §8
    },
    [dispatch],
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

  // top: the shared character sheet. Synthesise the draft with the rolling
  // displayKarma so the KAR slot animates per-tick. The authoritative karma
  // (saved to the character) is rolled by the reducer on ACCEPT_PERSONALITY.
  const animatedDraft = {
    ...state.draft,
    attributes: { ...state.draft.attributes, kar: displayKarma },
  };
  drawCharSheet(top, animatedDraft, db);

  // bottomBar: "CASTING KARMA - PRESS ►" (msg 0x0457) centered at row 1. This
  // screen's centering left-biases the pad (ceil), so a 23-char prompt starts
  // at col 9 — verified against the engine.
  clearWindow(bottomBar, 0x20, 0x03);
  const prompt = creationString(db, MSG.personality);
  const col = Math.max(0, Math.ceil((bottomBar.widthCells - prompt.length) / 2));
  setCursor(bottomBar, col, 1);
  puts(bottomBar, prompt, 0x03);

  const windows = [top, bottomBar];

  return <CreationCanvas windows={windows} fontSet={fontSet} palette={pal} />;
}
