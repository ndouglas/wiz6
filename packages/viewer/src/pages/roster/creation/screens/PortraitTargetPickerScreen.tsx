/**
 * PortraitTargetPickerScreen — PORTRAIT FOR WHOM? roster picker.
 *
 * Same engine layout + input model as ReviewPickerScreen with title
 * msg swapped to MSG.portraitForWhom (0x0463). See useRosterPicker for keys.
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

  const onPick = useCallback(
    (index: number) => dispatch({ type: 'PICK_PORTRAIT_FOR', index }),
    [dispatch],
  );
  const onCancel = useCallback(
    () => dispatch({ type: 'CANCEL_PORTRAIT_CHANGE' }),
    [dispatch],
  );

  const { cursorIdx, onCancel: cancelState } = useRosterPicker(roster.length, {
    onPick,
    onCancel,
  });

  useEffect(() => {
    if (roster.length === 0) onCancel();
  }, [roster.length, onCancel]);

  const pal = palette ?? WIZ6_MAIN;
  const windows = composeReviewPickerFrame(
    { roster, cursorIdx, onCancel: cancelState, titleMsgId: MSG.portraitForWhom },
    db,
  );

  return <CreationCanvas windows={windows} fontSet={fontSet} palette={pal} />;
}
