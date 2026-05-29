/**
 * composePartyMemberPickerFrame — pure cell-grid composer for the wbase
 * pick_party_member widget (used by REVIEW MEMBER and DISMISS MEMBER).
 *
 * Engine reference: docs/re/findings/wbase-party-pickers-and-dismiss.json
 * findings picker-grid-layout-and-coordinate-math, picker-window-chrome-and-attr-style,
 * picker-title-banner-render, picker-highlight-render-on-current-cursor.
 *
 * Geometry:
 *   - Picker window: 19w × 5h at screen (x=0, y=19*8=152). Attr 0x19. Cleared
 *     to (char=0x20, attr=0x03) on entry.
 *   - Member grid: 2 cols × 3 rows. Slot s ∈ [0..5] renders at
 *     cell_x = (s%2)*9 + 2; cell_y = s/2 + 1.
 *   - Highlight: cursor's member name at attr 0x50; others at attr 0x03.
 *   - Banner: a separate 40w × 1h window at screen (x=0, y=18*8=144). The
 *     title string is centered (left-truncated to fit). When `onCancel`,
 *     the banner title renders at attr 0x50 (highlighted); otherwise 0x03.
 */

import { createTileWindow, clearWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { ActivePartyMember } from '@wiz6/data';

const CELL_PX = 8;

const PICKER_W = 19;
const PICKER_H = 5;
const PICKER_SCREEN_X = 0;
const PICKER_SCREEN_Y = 19 * CELL_PX; // 152

const BANNER_W = 40;
const BANNER_H = 1;
const BANNER_SCREEN_X = 0;
const BANNER_SCREEN_Y = 18 * CELL_PX; // 144

const NAME_WIDTH = 7;
const ATTR_BG = 0x03;
const ATTR_HIGHLIGHT = 0x50;

export interface PartyMemberPickerView {
  /** Resolved title string (e.g. "REVIEW WHO?"). Already looked up from MessageDb. */
  title: string;
  members: ReadonlyArray<ActivePartyMember>;
  /** 0..members.length-1. Ignored when `onCancel === true`. */
  cursorIdx: number;
  /** When true, the cursor is on the BANNER (cancel) row — banner highlights, grid rows are plain. */
  onCancel: boolean;
}

export function composePartyMemberPickerFrame(view: PartyMemberPickerView): TileWindow[] {
  return [composeBanner(view), composePicker(view)];
}

function composeBanner(view: PartyMemberPickerView): TileWindow {
  const w = createTileWindow({
    screenX: BANNER_SCREEN_X,
    screenY: BANNER_SCREEN_Y,
    widthCells: BANNER_W,
    heightCells: BANNER_H,
  });
  clearWindow(w, 0x20, ATTR_BG);
  const text = view.title.slice(0, BANNER_W);
  const col = Math.max(0, Math.floor((BANNER_W - text.length) / 2));
  setCursor(w, col, 0);
  puts(w, text, view.onCancel ? ATTR_HIGHLIGHT : ATTR_BG);
  return w;
}

function composePicker(view: PartyMemberPickerView): TileWindow {
  const w = createTileWindow({
    screenX: PICKER_SCREEN_X,
    screenY: PICKER_SCREEN_Y,
    widthCells: PICKER_W,
    heightCells: PICKER_H,
  });
  clearWindow(w, 0x20, ATTR_BG);

  for (let s = 0; s < view.members.length; s++) {
    const cellX = (s % 2) * 9 + 2;
    const cellY = Math.floor(s / 2) + 1;
    const member = view.members[s]!;
    const name = member.name.slice(0, NAME_WIDTH);
    const isHighlighted = !view.onCancel && s === view.cursorIdx;
    setCursor(w, cellX, cellY);
    puts(w, name, isHighlighted ? ATTR_HIGHLIGHT : ATTR_BG);
  }

  return w;
}
