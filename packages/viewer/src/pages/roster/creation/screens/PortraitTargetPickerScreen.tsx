/**
 * PortraitTargetPickerScreen — "PORTRAIT FOR WHOM?" roster picker.
 *
 * Fourth consumer of composeReviewPickerFrame (after Review/Delete/Rename
 * pickers). Title is msg 0x0463 "PORTRAIT FOR WHOM?".
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

export interface PortraitTargetPickerScreenProps {
  state: CreationState;
  dispatch: (e: CreationEvent) => void;
  fontSet: FontSet;
  palette: Palette;
  db: MessageDb;
}

export function PortraitTargetPickerScreen({
  dispatch,
  fontSet,
  palette,
  db,
}: PortraitTargetPickerScreenProps) {
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
            dispatch({ type: 'PICK_PORTRAIT_FOR', index: cursorIdx });
          }
          break;
        case 'Escape':
          dispatch({ type: 'CANCEL_PORTRAIT_CHANGE' });
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

  useEffect(() => {
    if (roster.length === 0) {
      dispatch({ type: 'CANCEL_PORTRAIT_CHANGE' });
    }
  }, [roster.length, dispatch]);

  const pal = palette ?? WIZ6_MAIN;
  const windows = composeReviewPickerFrame(
    { roster, cursorIdx, titleMsgId: MSG.portraitForWhom },
    db,
  );

  return <CreationCanvas windows={windows} fontSet={fontSet} palette={pal} />;
}
