/**
 * ReviewPickerScreen — REVIEW WHO? roster picker.
 *
 * Layout: composeReviewPickerFrame. Input via useRosterPicker
 * (engine-correct two-state cursor — see
 * findings/wpcmk-roster-picker-input.json).
 */

import { useCallback, useEffect, useMemo } from 'react';
import { WIZ6_MAIN } from '@wiz6/data';
import type { Palette } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../state.js';
import { CreationCanvas } from '../ega/CreationCanvas.js';
import { composeReviewPickerFrame } from '../ega/review-picker-frame.js';
import { useRosterPicker } from './useRosterPicker.js';
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

  const onPick = useCallback(
    (index: number) => dispatch({ type: 'PICK_REVIEW', index }),
    [dispatch],
  );
  const onCancel = useCallback(
    () => dispatch({ type: 'CANCEL_REVIEW' }),
    [dispatch],
  );

  const { cursorIdx, onCancel: cancelState } = useRosterPicker(roster.length, {
    onPick,
    onCancel,
  });

  // Empty-roster guard (CharacterMenuScreen hides REVIEW PC when count==0).
  useEffect(() => {
    if (roster.length === 0) onCancel();
  }, [roster.length, onCancel]);

  const pal = palette ?? WIZ6_MAIN;
  const windows = composeReviewPickerFrame(
    { roster, cursorIdx, onCancel: cancelState },
    db,
  );

  return <CreationCanvas windows={windows} fontSet={fontSet} palette={pal} />;
}
