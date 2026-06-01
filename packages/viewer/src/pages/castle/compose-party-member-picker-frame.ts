/**
 * composePartyMemberPickerFrame — pure cell-grid composer for the wbase
 * pick_party_member widget (used by REVIEW MEMBER and DISMISS MEMBER).
 *
 * Engine reference: docs/re/findings/wbase-party-pickers-and-dismiss.json
 * findings picker-grid-layout-and-coordinate-math, picker-window-chrome-and-attr-style,
 * picker-title-banner-render, picker-highlight-render-on-current-cursor.
 *
 * Cursor model:
 *   The engine's picker has a selectable "EXIT" word in the banner strip and a
 *   2×3 member grid. The cursor (`view.cursor`) is:
 *     -1  → EXIT (banner highlighted; no member highlighted)
 *     0..N-1 → that member highlighted (EXIT plain)
 *
 * Geometry:
 *   - Banner: persistent 40×1 strip at screen (x=0, y=18*8=144). The title is
 *     centered with the engine's +6 padding (`center_x = 10 - (strlen+6)/2`),
 *     then the EXIT label is drawn just to its right.
 *   - Picker window: 19w × 5h at screen (x=0, y=19*8=152). Cleared to
 *     (char=0x20, attr=0x03). Member grid: slot s renders at
 *     cell_x = (s%2)*9 + 2; cell_y = s/2 + 1 (rows y=1,2,3).
 *   - Highlight attr is 0x50; both windows render it INVERSE (black text on a
 *     coloured bar) via `invertHighlight = true` — the menu-cursor convention
 *     (see compose-action-menu.ts for the canonical example).
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

/** The selectable EXIT word rendered to the right of the title in the banner.
 *  Engine: msg 0x7ec ("EXIT") — the highlight-state banner-text variant. */
const EXIT_LABEL = 'EXIT';

/** Sentinel cursor value meaning "EXIT is selected" (no member highlighted). */
export const PICKER_CURSOR_EXIT = -1;

export interface PartyMemberPickerView {
  /** Resolved title string (e.g. "REVIEW WHO?"). Already looked up from MessageDb. */
  title: string;
  members: ReadonlyArray<ActivePartyMember>;
  /**
   * Cursor position: -1 = EXIT (banner highlighted), 0..members.length-1 =
   * that member highlighted.
   */
  cursor: number;
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
  // EXIT highlight renders inverse (black text on a coloured bar) — the
  // menu-cursor convention shared with compose-action-menu.ts.
  w.invertHighlight = true;
  clearWindow(w, 0x20, ATTR_BG);

  // Engine centering: center_x = 10 - (strlen + 6) / 2 (the +6 padding is
  // specific to this picker; see picker-title-banner-render finding).
  const title = view.title;
  const titleCol = Math.max(0, 10 - Math.floor((title.length + 6) / 2));
  setCursor(w, titleCol, 0);
  puts(w, title, ATTR_BG);

  // EXIT sits one cell to the right of the title; highlighted when cursor==-1.
  const exitCol = titleCol + title.length + 1;
  setCursor(w, exitCol, 0);
  puts(w, EXIT_LABEL, view.cursor === PICKER_CURSOR_EXIT ? ATTR_HIGHLIGHT : ATTR_BG);

  return w;
}

function composePicker(view: PartyMemberPickerView): TileWindow {
  const w = createTileWindow({
    screenX: PICKER_SCREEN_X,
    screenY: PICKER_SCREEN_Y,
    widthCells: PICKER_W,
    heightCells: PICKER_H,
  });
  // Selected member renders inverse, same convention as the banner.
  w.invertHighlight = true;
  clearWindow(w, 0x20, ATTR_BG);

  for (let s = 0; s < view.members.length; s++) {
    const cellX = (s % 2) * 9 + 2;
    const cellY = Math.floor(s / 2) + 1;
    const member = view.members[s]!;
    const name = member.name.slice(0, NAME_WIDTH);
    setCursor(w, cellX, cellY);
    puts(w, name, s === view.cursor ? ATTR_HIGHLIGHT : ATTR_BG);
  }

  return w;
}
