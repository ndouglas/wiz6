/**
 * ReviewPickerScreen — REVIEW WHO? roster picker.
 *
 * Layout: composeReviewPickerFrame (ega/review-picker-frame.ts) — verified
 * pixel-exact against engine slot 1 (single-character roster).
 *
 * Behavior:
 *   ArrowUp / ArrowDown → move cursor (no wrap)
 *   Enter               → dispatch PICK_REVIEW { index: cursor }
 *   Escape              → dispatch CANCEL_REVIEW
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { WIZ6_MAIN } from '@wiz6/data';
import type { Palette } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../state.js';
import { CreationCanvas } from '../ega/CreationCanvas.js';
import { composeReviewPickerFrame } from '../ega/review-picker-frame.js';
import { readRoster } from '../../../../lib/roster-store.js';

export interface ReviewPickerScreenProps {
  state: CreationState;
  dispatch: (e: CreationEvent) => void;
  fontSet: FontSet;
  palette: Palette;
  db: MessageDb;
}

export function ReviewPickerScreen({
  dispatch,
  fontSet,
  palette,
  db,
}: ReviewPickerScreenProps) {
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
            dispatch({ type: 'PICK_REVIEW', index: cursorIdx });
          }
          break;
        case 'Escape':
          dispatch({ type: 'CANCEL_REVIEW' });
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

  // Empty-roster guard (shouldn't normally fire since CharacterMenuScreen
  // hides REVIEW PC when count==0).
  useEffect(() => {
    if (roster.length === 0) {
      dispatch({ type: 'CANCEL_REVIEW' });
    }
  }, [roster.length, dispatch]);

  const pal = palette ?? WIZ6_MAIN;
  const windows = composeReviewPickerFrame({ roster, cursorIdx }, db);

  return <CreationCanvas windows={windows} fontSet={fontSet} palette={pal} />;
}
