/**
 * PartyMemberPicker — shared picker for the active party. Used by
 * DismissMemberPage and ReviewMemberPage. Mirrors wbase_pick_party_member
 * @ wbase.ovr 0x26c7.
 *
 * Engine refs: docs/re/findings/wbase-party-pickers-and-dismiss.json
 * findings picker-input-loop-keymap, picker-grid-layout-and-coordinate-math,
 * picker-highlight-render-on-current-cursor.
 *
 * Single-member shortcut (engine `party_size < 2` bypass) is NOT handled
 * here — the caller (page) checks `members.length < 2` and bypasses the
 * picker before mounting. This component assumes >= 1 member.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivePartyMember, Palette } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import { renderTileWindow } from '@wiz6/parser';
import { CanvasPresenter } from '../lib/presenter.js';
import {
  composePartyMemberPickerFrame,
  type PartyMemberPickerView,
} from '../pages/castle/compose-party-member-picker-frame.js';

const ENGINE_W = 320;
const ENGINE_H = 200;
const SCALE = 3;

export interface PartyMemberPickerProps {
  title: string;
  members: ReadonlyArray<ActivePartyMember>;
  fontSet: FontSet;
  palette: Palette;
  onCommit: (slotIndex: number) => void;
  onCancel: () => void;
  /** TEST ONLY: skip canvas mount. */
  skipCanvas?: boolean;
}

export function PartyMemberPicker({
  title,
  members,
  fontSet,
  palette,
  onCommit,
  onCancel,
  skipCanvas = false,
}: PartyMemberPickerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cursorIdx, setCursorIdx] = useState(0);
  const [onCancelState, setOnCancelState] = useState(false);

  // Move cursor within 2-column × 3-row grid.
  const moveCursor = useCallback(
    (dx: number, dy: number) => {
      setCursorIdx((cur) => {
        const col = cur % 2;
        const row = Math.floor(cur / 2);
        const newCol = Math.max(0, Math.min(1, col + dx));
        const newRow = Math.max(0, Math.min(2, row + dy));
        const candidate = newRow * 2 + newCol;
        return candidate < members.length ? candidate : cur;
      });
    },
    [members.length],
  );

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          if (onCancelState) {
            // Already on cancel — left stays on cancel (engine no-op).
            return;
          }
          // From grid: left when at col 0 goes to CANCEL; otherwise moves left within row.
          if (cursorIdx % 2 === 0) {
            setOnCancelState(true);
          } else {
            moveCursor(-1, 0);
          }
          break;
        case 'ArrowRight':
          if (onCancelState) {
            setOnCancelState(false);
            setCursorIdx(0);
          } else {
            moveCursor(1, 0);
          }
          break;
        case 'ArrowUp':
          if (onCancelState) {
            setOnCancelState(false);
            setCursorIdx(0);
          } else {
            moveCursor(0, -1);
          }
          break;
        case 'ArrowDown':
          if (onCancelState) {
            setOnCancelState(false);
            setCursorIdx(0);
          } else {
            moveCursor(0, 1);
          }
          break;
        case 'Enter':
          if (onCancelState) {
            onCancel();
          } else {
            onCommit(cursorIdx);
          }
          break;
        case 'Escape':
          onCancel();
          break;
      }
    },
    [cursorIdx, onCancelState, onCommit, onCancel, moveCursor],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  useEffect(() => {
    if (skipCanvas) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const presenter = new CanvasPresenter(canvas);
    const view: PartyMemberPickerView = {
      title,
      members,
      cursorIdx,
      onCancel: onCancelState,
    };
    const windows = composePartyMemberPickerFrame(view);
    const buf = new Uint8ClampedArray(ENGINE_W * ENGINE_H * 4);
    buf.fill(0);
    for (const w of windows) {
      renderTileWindow(w, buf, ENGINE_W, ENGINE_H, fontSet, palette);
    }
    presenter.present(buf, ENGINE_W, ENGINE_H);
  }, [skipCanvas, title, members, cursorIdx, onCancelState, fontSet, palette]);

  if (skipCanvas) return <div data-testid="party-member-picker-stub" />;
  return (
    <canvas
      ref={canvasRef}
      width={ENGINE_W}
      height={ENGINE_H}
      style={{
        width: ENGINE_W * SCALE,
        height: ENGINE_H * SCALE,
        imageRendering: 'pixelated',
        background: '#000',
      }}
      aria-label="Pick a party member"
    />
  );
}
