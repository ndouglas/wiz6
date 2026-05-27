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
  state: _state,
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

      if (key === 'Enter') {
        // Submit only if buffer is non-empty
        if (buffer.length > 0) {
          dispatch({ type: 'SET_NAME', name: buffer });
        }
        // Empty buffer → no-op (spec: "empty+Enter does nothing")
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
    [buffer, dispatch],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Build windows for this frame (same persistent set as the menu: top
  // char-sheet template + gray bottomBar + gray menuPanel).
  const { top, bottomBar, menuPanel } = createPersistentWindows();

  // Byte-exact against the engine name screen (save 1):
  //   bottomBar row 1, col 1: "CHARACTER NAME >" at attr 0x03 (plain wfont3).
  //   then at col 1+len: the typed name + a trailing cursor cell, all at
  //   attr 0x10 — the highlight path (black-on-palette[1]), an inverse-video
  //   input field. The cursor is just the highlighted space after the text.
  // The field is a fixed NAME_MAX_LENGTH+1 cells (7 name chars + 1 cursor):
  // the typed text and cursor are highlighted (attr 0x10); the remainder is
  // cleared to attr 0x00 (transparent), matching the engine byte-for-byte.
  const promptText = creationString(db, MSG.namePrompt); // "CHARACTER NAME >"
  setCursor(bottomBar, 1, 1);
  puts(bottomBar, promptText, 0x03);
  setCursor(bottomBar, 1 + promptText.length, 1);
  puts(bottomBar, `${buffer} `, 0x10);
  const fieldPad = NAME_MAX_LENGTH + 1 - (buffer.length + 1);
  if (fieldPad > 0) puts(bottomBar, ' '.repeat(fieldPad), 0x00);

  const pal = palette ?? WIZ6_MAIN;
  const windows = [top, bottomBar, menuPanel];

  return <CreationCanvas windows={windows} fontSet={fontSet} palette={pal} />;
}
