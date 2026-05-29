/**
 * NameInputScreen — screen-00 name entry for wpcmk character creation.
 *
 * Raw-key text entry (NOT the §8 arrow-picker model):
 *   - Printable ASCII (single char, charCode 0x20..0x7e) appends to buffer
 *   - Buffer is capped at NAME_MAX_LENGTH = 7 (CharacterSchema name max)
 *   - Backspace removes the last character
 *   - Enter with non-empty buffer dispatches SET_NAME { name }
 *   - Enter on empty buffer → no-op (reducer treats empty name as no-op too)
 *   - Escape → no-op (no cancel path at name entry per §1)
 *   - All other keys → ignored
 *
 * Renders the prompt (MSG.namePrompt = 0x044c, "CHARACTER NAME >") and the
 * typed buffer (with a block-cursor "_") into the bottomBar window.
 *
 * Spec: docs/re/wpcmk-screens.md §1 (screen-00)
 */

import { useState, useEffect, useCallback } from 'react';
import { setCursor, puts } from '@wiz6/parser';
import { WIZ6_MAIN } from '@wiz6/data';
import type { Palette } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../state.js';
import { createPersistentWindows } from '../ega/windows.js';
import { CreationCanvas } from '../ega/CreationCanvas.js';
import { MSG, creationString } from '../messages.js';
import { findDuplicateName } from '../../../../lib/roster-store.js';
import { playInvalidActionBeep } from '../../../../lib/audio.js';
import { composeModalFrame } from '../ega/modal-frame.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum name length per CharacterSchema: z.string().min(1).max(7)
 */
const NAME_MAX_LENGTH = 7;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if `key` represents a single printable ASCII character
 * (charCode 0x20 ' ' through 0x7e '~').
 *
 * `key` is the DOM KeyboardEvent.key string. For single printable chars,
 * `key.length === 1`. Multi-character values like 'ArrowUp', 'Enter',
 * 'Backspace', 'Tab', etc. have length > 1, and are excluded by that check.
 * Space (0x20) and chars up to '~' (0x7e) are accepted.
 */
function isPrintableAscii(key: string): boolean {
  if (key.length !== 1) return false;
  const code = key.charCodeAt(0);
  return code >= 0x20 && code <= 0x7e;
}

// ---------------------------------------------------------------------------
// NameInputScreen component
// ---------------------------------------------------------------------------

export interface NameInputScreenProps {
  state: CreationState;
  dispatch: (e: CreationEvent) => void;
  fontSet: FontSet;
  palette: Palette;
  db: MessageDb;
}

/**
 * NameInputScreen — raw-key text entry for the character name.
 *
 * Local `useState` holds the typed buffer. Key events are handled via
 * window keydown listener. Business logic (transition to race screen) is
 * in the reducer — this component only dispatches SET_NAME.
 */
export function NameInputScreen({
  state,
  dispatch,
  fontSet,
  palette,
  db,
}: NameInputScreenProps) {
  // Local buffer — the name typed so far
  const [buffer, setBuffer] = useState<string>('');

  // -------------------------------------------------------------------------
  // Key handler
  // -------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const { key } = e;

      // Modal-active path: any key dismisses; nothing else happens.
      if (state.modalErrorMsgId !== undefined) {
        dispatch({ type: 'MODAL_DISMISS' });
        return;
      }

      if (key === 'Enter') {
        // Submit only if buffer is non-empty
        if (buffer.length === 0) return;
        const name = buffer;
        if (findDuplicateName(name)) {
          playInvalidActionBeep();
          dispatch({ type: 'SHOW_DUP_NAME_MODAL' });
          return;
        }
        dispatch({ type: 'SET_NAME', name });
        return;
      }

      if (key === 'Backspace') {
        setBuffer((prev) => prev.slice(0, -1));
        return;
      }

      if (key === 'Escape') {
        // No-op at name entry (spec: "Escape does nothing/cancels" — per §1
        // the name screen has no cancel path; just ignore)
        return;
      }

      if (isPrintableAscii(key)) {
        setBuffer((prev) => {
          if (prev.length >= NAME_MAX_LENGTH) return prev; // cap at 7
          return prev + key;
        });
        return;
      }

      // All other keys (arrows, Tab, F-keys, etc.) → ignored
    },
    [buffer, dispatch, state.modalErrorMsgId],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Auto-dismiss the modal after 5 seconds (engine: wait_for_key_or_timeout).
  useEffect(() => {
    if (state.modalErrorMsgId === undefined) return;
    const id = window.setTimeout(() => dispatch({ type: 'MODAL_DISMISS' }), 5000);
    return () => window.clearTimeout(id);
  }, [state.modalErrorMsgId, dispatch]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Build windows for this frame (same persistent set as the menu: top
  // char-sheet template + gray bottomBar + gray menuPanel).
  const { top, bottomBar, menuPanel } = createPersistentWindows();

  // Byte-exact against the engine name screen — confirmed by dumping the
  // bottomBar cells from a "NATHAN"-typed save:
  //   col 1 .. 16:   "CHARACTER NAME >" at attr 0x03 (plain wfont3).
  //   col 17 .. 16+N: the typed letters UPPERCASED at attr 0x50 (highlight
  //                   path, color 5 = yellow). wfont0 only carries uppercase
  //                   letter glyphs at codes 65-90; lowercase ASCII 97-122
  //                   point at symbol/cursor sprites (the "2 rows lower in
  //                   font0" bug Nate caught).
  //   col 17+N:      char 'a' (97) at attr 0x10 — wfont0 glyph 97 is the
  //                   solid-block CURSOR sprite (not a lowercase 'a').
  //   col 17+N+1..:  spaces at attr 0x00 (empty input field).
  // Override bottomBar.invertHighlight to false — name-input renders typed
  // letters + the cursor block in COLORED mode (stroke=palette[colorIdx],
  // bg=black: yellow NATHAN on black; white cursor block on black). The
  // character-menu selection cursor uses INVERSE mode (black-on-yellow) via
  // the default invertHighlight=true; that's a per-screen call, not a per-cell
  // flag, so screens override as needed.
  bottomBar.invertHighlight = false;
  const promptText = creationString(db, MSG.namePrompt); // "CHARACTER NAME >"
  setCursor(bottomBar, 1, 1);
  puts(bottomBar, promptText, 0x03);
  setCursor(bottomBar, 1 + promptText.length, 1);
  if (buffer.length > 0) puts(bottomBar, buffer.toUpperCase(), 0x50);
  puts(bottomBar, 'a', 0x10);
  const fieldPad = NAME_MAX_LENGTH - buffer.length;
  if (fieldPad > 0) puts(bottomBar, ' '.repeat(fieldPad), 0x00);

  const pal = palette ?? WIZ6_MAIN;
  const windows = [top, bottomBar, menuPanel];
  if (state.modalErrorMsgId !== undefined) {
    windows.push(composeModalFrame(db, state.modalErrorMsgId));
  }

  return <CreationCanvas windows={windows} fontSet={fontSet} palette={pal} />;
}
