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

// Banner background tile. The banner strip is filled with wfont3 char 0x5f (the
// "banner-bar" tile: black top row + gray middle + black bottom row), the same
// fill composeCastleFrame uses for the MASTER OPTIONS banner. (NOT a plain space
// 0x20 — that renders solid gray and lacks the black top/bottom borders.)
const BANNER_FILL_CHAR = 0x5f;

// --- Right-of-picker fill (cols 19..39, rows 19..23) -------------------------
// The engine's picker window covers only cols 0..18; when it opens, the engine's
// window manager DIMS the still-painted MASTER OPTIONS menu in cols 19..39 with
// a 50% checkerboard stipple (the unfocused-window "dim" raster pass). We can't
// reach for the raster op in the tile model, but wfont3 char 0x1a at attr 0x03
// renders as exactly that [gray,black] checkerboard tile — verified by rendering
// every wfont1/wfont3 glyph and pixel-matching against the engine fixture.
const DITHER_CELL_X = 20;
const DITHER_CELL_Y = 19;
const DITHER_W = 20; // cols 20..39
const DITHER_H = 5; // rows 19..23
const DITHER_CHAR = 0x1a; // wfont3 checkerboard tile
const DITHER_ATTR = 0x03;

// Right-edge vertical line at cell 19, picker rows 19..23. wfont1 char 0x1c (a
// tile whose cols 0..6 are gray and col 7 is black) — the picker window's right
// border, between the solid-gray panel and the dithered menu region. Same tile
// the ADD picker uses for its middle strip.
const MIDDLE_CELL_X = 19;
const MIDDLE_CELL_Y = 19;
const MIDDLE_H = 5;
const MIDDLE_CHAR = 0x1c;
const MIDDLE_ATTR = 0x01;

// Corner tile at cell (19, 24) — wfont1 0x1f closes the L: col 7 black
// (continuing the col-19 right-edge line) + row 7 black (joining the status
// row's baseline at y=199). Without it the menu-dim region's left edge has no
// bottom-corner and col 19 row 24 shows solid gray instead of the edge line.
const CORNER_CELL_X = 19;
const CORNER_CELL_Y = 24;
const CORNER_CHAR = 0x1f;
const CORNER_ATTR = 0x01;

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
  return [
    composeBanner(view),
    composeDither(),
    composeMiddleStrip(),
    composeCorner(),
    composePicker(view),
  ];
}

/** Bottom-left corner of the dimmed menu region: cell (19, 24), wfont1 0x1f. */
function composeCorner(): TileWindow {
  const w = createTileWindow({
    screenX: CORNER_CELL_X * CELL_PX,
    screenY: CORNER_CELL_Y * CELL_PX,
    widthCells: 1,
    heightCells: 1,
  });
  clearWindow(w, CORNER_CHAR, CORNER_ATTR);
  return w;
}

/** 50% checkerboard dither covering cols 20..39, rows 19..23 — reproduces the
 *  engine's unfocused-menu dimming (the MASTER OPTIONS menu stays painted behind
 *  the picker but the window manager stipples it). wfont3 char 0x1a @ attr 3. */
function composeDither(): TileWindow {
  const w = createTileWindow({
    screenX: DITHER_CELL_X * CELL_PX,
    screenY: DITHER_CELL_Y * CELL_PX,
    widthCells: DITHER_W,
    heightCells: DITHER_H,
  });
  clearWindow(w, DITHER_CHAR, DITHER_ATTR);
  return w;
}

/** Right-edge vertical line at cell 19, picker rows 19..23. wfont1 char 0x1c. */
function composeMiddleStrip(): TileWindow {
  const w = createTileWindow({
    screenX: MIDDLE_CELL_X * CELL_PX,
    screenY: MIDDLE_CELL_Y * CELL_PX,
    widthCells: 1,
    heightCells: MIDDLE_H,
  });
  clearWindow(w, MIDDLE_CHAR, MIDDLE_ATTR);
  return w;
}

/**
 * Map a banner string to wfont3's bordered-bar tile codepoints.
 *
 * The banner row renders text in the "bordered-bar" tile style (a black top +
 * bottom border row with idx-9 light strokes between), so the title visually
 * sits inside the gray banner bar. In wfont3 those bordered glyphs live in the
 * LOWERCASE letter range — the UPPERCASE glyphs are the plain idx-1 (red) stroke
 * variants with no border. Punctuation is remapped too: '?' → '}' (0x7d) is the
 * bordered '?'. Spaces become 0x5f (the banner-bar tile itself) so the bar's
 * border runs unbroken across word gaps. (composeCastleFrame uses the identical
 * trick for "master\x5foptions".)
 */
function bannerStyle(text: string): string {
  let out = '';
  for (const ch of text) {
    if (ch === ' ') out += '\x5f';
    else if (ch === '?') out += '\x7d';
    else out += ch.toLowerCase();
  }
  return out;
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
  clearWindow(w, BANNER_FILL_CHAR, ATTR_BG);

  // Engine centering: center_x = 10 - (strlen + 6) / 2 (the +6 padding is
  // specific to this picker; see picker-title-banner-render finding).
  const title = view.title;
  const titleCol = Math.max(0, 10 - Math.floor((title.length + 6) / 2));
  // The banner title renders in the bordered-bar tile style (black top/bottom
  // border row + idx-9 light strokes), same as composeCastleFrame's MASTER
  // OPTIONS. wfont3's bordered-bar sprites live in the LOWERCASE/extended range
  // (uppercase glyphs are the plain idx-1 red-stroke variants with no border).
  // bannerStyle() maps each title char to its bordered-bar codepoint; inter-word
  // spaces become 0x5f (the banner-bar tile) so the border runs unbroken.
  setCursor(w, titleCol, 0);
  puts(w, bannerStyle(title), ATTR_BG);

  // EXIT sits one cell to the right of the title. When highlighted (cursor==-1)
  // it renders inverse via the font0 highlight path (uppercase OK). When PLAIN
  // it must use the SAME bordered-bar style as the title, not uppercase.
  const exitCol = titleCol + title.length + 1;
  setCursor(w, exitCol, 0);
  if (view.cursor === PICKER_CURSOR_EXIT) {
    puts(w, EXIT_LABEL, ATTR_HIGHLIGHT);
  } else {
    puts(w, bannerStyle(EXIT_LABEL), ATTR_BG);
  }

  // Cell 19 closes the banner bar with the picker window's right-edge line:
  // wfont3 0x1d (banner-bar tile PLUS a black right-edge column), continuing the
  // col-19 vertical line down into the picker rows below.
  setCursor(w, 19, 0);
  puts(w, String.fromCharCode(0x1d), ATTR_BG);

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
