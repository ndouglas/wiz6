/**
 * RenameInputScreen — RENAME PC text-entry screen.
 *
 * Layout (verified vs slot 6):
 *   - top + menuPanel: same review-style char-sheet as ReviewScreen (the
 *     OLD name is shown — engine doesn't update the row-1 name as the user
 *     types; only after CONFIRM does the renamed char re-render).
 *   - bottomBar row 1: " NEW NAME >a       " — prompt at col 1 attr 0x03,
 *     cursor block 'a' (wfont0 glyph 0x61) at attr 0x10, 7-char buffer
 *     of spaces at attr 0x00. Typed letters are uppercased at attr 0x50
 *     (same as creation NameInputScreen).
 *
 * Behavior — matches creation name-entry exactly except for the prompt msg
 * and the commit target (updateCharacter instead of SET_NAME):
 *   - Printable ASCII → append (cap NAME_MAX_LENGTH = 7)
 *   - Backspace → pop last char
 *   - Enter (non-empty) → updateCharacter({ ...c, name: buffer }) +
 *                         dispatch CONFIRM_RENAME { name: buffer }
 *   - Enter (empty)    → no-op
 *   - Escape           → dispatch CANCEL_RENAME (back to characterMenu)
 *   - Other keys       → ignored
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
import { patchFontSetWithPortrait } from '../ega/skill-train-frame.js';
import { MSG, creationString } from '../messages.js';
import { draftFromCharacter } from '../lib/draft-from-character.js';
import { readRoster, updateCharacter, findDuplicateName } from '../../../../lib/roster-store.js';
import { playInvalidActionBeep } from '../../../../lib/audio.js';
import { composeModalFrame } from '../ega/modal-frame.js';

const NAME_MAX_LENGTH = 7;

function isPrintableAscii(key: string): boolean {
  if (key.length !== 1) return false;
  const code = key.charCodeAt(0);
  return code >= 0x20 && code <= 0x7e;
}

export interface RenameInputScreenProps {
  state: CreationState;
  dispatch: (e: CreationEvent) => void;
  fontSet: FontSet;
  palette: Palette;
  db: MessageDb;
  portraits?: PortraitSet[];
}

export function RenameInputScreen({
  state,
  dispatch,
  fontSet,
  palette,
  db,
  portraits = [],
}: RenameInputScreenProps) {
  const character = useMemo(() => {
    if (state.rosterIndex === null) return null;
    try {
      return readRoster().characters[state.rosterIndex] ?? null;
    } catch {
      return null;
    }
  }, [state.rosterIndex]);

  // Bail if the character disappeared between picker and rename input.
  useEffect(() => {
    if (state.rosterIndex !== null && character === null) {
      dispatch({ type: 'CANCEL_RENAME' });
    }
  }, [character, state.rosterIndex, dispatch]);

  // Local typing buffer (empty at entry — engine starts with a clear field).
  const [buffer, setBuffer] = useState<string>('');

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const { key } = e;
      // Modal-active path: any key dismisses; nothing else happens.
      if (state.modalErrorMsgId !== undefined) {
        dispatch({ type: 'MODAL_DISMISS' });
        return;
      }
      if (key === 'Enter') {
        if (buffer.length === 0 || !character) return;
        // Uppercase to match engine name storage + creation flow's SET_NAME.
        const newName = buffer.toUpperCase();
        if (findDuplicateName(newName, character.id)) {
          playInvalidActionBeep();
          dispatch({ type: 'SHOW_DUP_NAME_MODAL' });
          return;
        }
        updateCharacter({ ...character, name: newName });
        dispatch({ type: 'CONFIRM_RENAME', name: newName });
        return;
      }
      if (key === 'Backspace') {
        setBuffer((prev) => prev.slice(0, -1));
        return;
      }
      if (key === 'Escape') {
        dispatch({ type: 'CANCEL_RENAME' });
        return;
      }
      if (isPrintableAscii(key)) {
        setBuffer((prev) => (prev.length >= NAME_MAX_LENGTH ? prev : prev + key));
      }
    },
    [buffer, character, dispatch, state.modalErrorMsgId],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Auto-dismiss the modal after ~500ms (engine's wait_for_key_or_timeout).
  useEffect(() => {
    if (state.modalErrorMsgId === undefined) return;
    const id = window.setTimeout(() => dispatch({ type: 'MODAL_DISMISS' }), 500);
    return () => window.clearTimeout(id);
  }, [state.modalErrorMsgId, dispatch]);

  // ── Render ───────────────────────────────────────────────────────────────

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
    // Persistent portrait tiles at top (1..3, 1..3).
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

  // bottomBar — see header comment. Same colored highlight as creation
  // NameInputScreen (override invertHighlight=false for the cursor block).
  bottomBar.invertHighlight = false;
  const promptText = creationString(db, MSG.newNamePrompt); // "NEW NAME >"
  setCursor(bottomBar, 1, 1);
  puts(bottomBar, promptText, 0x03);
  setCursor(bottomBar, 1 + promptText.length, 1);
  if (buffer.length > 0) puts(bottomBar, buffer.toUpperCase(), 0x50);
  puts(bottomBar, 'a', 0x10);
  const fieldPad = NAME_MAX_LENGTH - buffer.length;
  if (fieldPad > 0) puts(bottomBar, ' '.repeat(fieldPad), 0x00);

  const windows = [top, bottomBar, menuPanel];
  if (state.modalErrorMsgId !== undefined) {
    windows.push(composeModalFrame(db, state.modalErrorMsgId));
  }

  return (
    <CreationCanvas
      windows={windows}
      fontSet={fontSetWithPortrait}
      palette={pal}
    />
  );
}
