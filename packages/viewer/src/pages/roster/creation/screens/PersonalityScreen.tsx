/**
 * PersonalityScreen — screen-08: karma roll accept.
 *
 * The engine animates a dice-roll in the bottom bar window and waits for the
 * player to press RETURN to accept whatever karma value was rolled.
 *
 * For the port: static display + Enter-to-accept.
 *   - Renders "CASTING KARMA - PRESS ►" (MSG 0x0457) in the bottomBar window.
 *   - Displays the current karma value (state.draft.attributes.kar) in the top window.
 *   - Enter (only) → dispatch ACCEPT_PERSONALITY; the reducer fires rollKarmaWith
 *     and transitions to 'portrait'.
 *   - All other keys are no-ops (spec §8 note: screen-08 uses CR-only path,
 *     bypassing the 1-5 action-code table used by other screens).
 *
 * Spec: docs/re/wpcmk-screens.md §1, §3, §8
 */

import { useEffect, useCallback } from 'react';
import { setCursor, puts } from '@wiz6/parser';
import { WIZ6_MAIN } from '@wiz6/data';
import type { Palette } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../state.js';
import { createPersistentWindows } from '../ega/windows.js';
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

  // --- top window: show current karma value ---
  const karValue = state.draft.attributes.kar;
  const karLine = `KAR  ${karValue}`;
  setCursor(top, 0, 0);
  puts(top, karLine, top.cells[1] ?? 0x14);

  // --- bottomBar window: "CASTING KARMA - PRESS ►" label ---
  const labelText = creationString(db, MSG.personality);
  if (labelText) {
    setCursor(bottomBar, 0, 0);
    puts(bottomBar, labelText, bottomBar.cells[1] ?? 0x13);
  }

  const windows = [top, bottomBar];

  return <CreationCanvas windows={windows} fontSet={fontSet} palette={pal} />;
}
