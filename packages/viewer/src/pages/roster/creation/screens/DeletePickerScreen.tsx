/**
 * DeletePickerScreen — DELETE WHO? roster picker.
 *
 * Identical layout to ReviewPickerScreen — same scrollbar / entry rows /
 * bottomBar CANCEL. The only difference is the row-1 title (msg 0x0461
 * "DELETE WHO?" instead of msg 0x0469 "REVIEW WHO?").
 *
 * Behavior:
 *   ArrowUp / ArrowDown → move cursor (no wrap)
 *   Enter               → dispatch PICK_DELETE { index } → deleteConfirm
 *   Escape              → dispatch CANCEL_DELETE
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { WIZ6_MAIN } from '@wiz6/data';
import type { Palette } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../state.js';
import { CreationCanvas } from '../ega/CreationCanvas.js';
import { composeReviewPickerFrame } from '../ega/review-picker-frame.js';
import { MSG } from '../messages.js';
import { readRoster } from '../../../../lib/roster-store.js';

export interface DeletePickerScreenProps {
  state: CreationState;
  dispatch: (e: CreationEvent) => void;
  fontSet: FontSet;
  palette: Palette;
  db: MessageDb;
}

export function DeletePickerScreen({
  dispatch,
  fontSet,
  palette,
  db,
}: DeletePickerScreenProps) {
  const roster = useMemo(() => {
    try {
      return readRoster().characters;
    } catch {
      return [];
    }
  }, []);

  const [cursorIdx, setCursorIdx] = useState<number>(0);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          setCursorIdx((prev) => Math.max(0, prev - 1));
          break;
        case 'ArrowDown':
          setCursorIdx((prev) => Math.min(roster.length - 1, prev + 1));
          break;
        case 'Enter':
          if (cursorIdx >= 0 && cursorIdx < roster.length) {
            dispatch({ type: 'PICK_DELETE', index: cursorIdx });
          }
          break;
        case 'Escape':
          dispatch({ type: 'CANCEL_DELETE' });
          break;
        default:
          break;
      }
    },
    [cursorIdx, roster.length, dispatch],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Empty-roster guard (CharacterMenuScreen hides DELETE PC at count==0).
  useEffect(() => {
    if (roster.length === 0) {
      dispatch({ type: 'CANCEL_DELETE' });
    }
  }, [roster.length, dispatch]);

  const pal = palette ?? WIZ6_MAIN;
  const windows = composeReviewPickerFrame(
    { roster, cursorIdx, titleMsgId: MSG.deleteWho },
    db,
  );

  return <CreationCanvas windows={windows} fontSet={fontSet} palette={pal} />;
}
