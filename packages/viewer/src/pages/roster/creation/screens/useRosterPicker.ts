/**
 * useRosterPicker — shared input handling for the REVIEW / DELETE / RENAME /
 * PORTRAIT roster pickers.
 *
 * Implements the engine-correct two-state cursor from
 * `wpcmk_show_roster_picker` (wpcmk file 0x56a0). See
 * `docs/re/findings/wpcmk-roster-picker-input.json` for the full RE.
 *
 *   ArrowUp / ArrowDown → if on CANCEL, return to roster; else move cursor
 *                         (clamped at ends, no wrap)
 *   ArrowLeft           → jump cursor to CANCEL row
 *   ArrowRight          → if on CANCEL, return to roster; else no-op
 *   Enter               → if on CANCEL, dispatch onCancel(); else dispatch
 *                         onPick(cursorIdx)
 *   Escape              → dispatch onCancel() (port-only quick-cancel;
 *                         engine ignores Escape in this picker)
 *
 * Returns `{ cursorIdx, onCancel }` so the screen can pass them into
 * `composeReviewPickerFrame`.
 */

import { useState, useEffect, useCallback } from 'react';

export interface RosterPickerHandlers {
  onPick: (index: number) => void;
  onCancel: () => void;
}

export interface RosterPickerView {
  /** Current cursor index in the roster. */
  cursorIdx: number;
  /** True when the cursor is on the CANCEL row (not a roster entry). */
  onCancel: boolean;
}

/**
 * Two-state picker key handling. Pass roster length and dispatch callbacks;
 * receive cursor state for rendering.
 */
export function useRosterPicker(
  rosterLength: number,
  handlers: RosterPickerHandlers,
): RosterPickerView {
  const [cursorIdx, setCursorIdx] = useState<number>(0);
  const [onCancelState, setOnCancelState] = useState<boolean>(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          if (onCancelState) setOnCancelState(false);
          else setCursorIdx((prev) => Math.max(0, prev - 1));
          break;
        case 'ArrowDown':
          if (onCancelState) setOnCancelState(false);
          else setCursorIdx((prev) => Math.min(rosterLength - 1, prev + 1));
          break;
        case 'ArrowLeft':
          setOnCancelState(true);
          break;
        case 'ArrowRight':
          if (onCancelState) setOnCancelState(false);
          // else no-op (engine binding — Right is a roster-side no-op)
          break;
        case 'Enter':
          if (onCancelState) {
            handlers.onCancel();
          } else if (cursorIdx >= 0 && cursorIdx < rosterLength) {
            handlers.onPick(cursorIdx);
          }
          break;
        case 'Escape':
          handlers.onCancel();
          break;
        default:
          break;
      }
    },
    [cursorIdx, onCancelState, rosterLength, handlers],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { cursorIdx, onCancel: onCancelState };
}
