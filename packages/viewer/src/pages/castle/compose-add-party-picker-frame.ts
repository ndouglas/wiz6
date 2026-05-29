/**
 * composeAddPartyPickerFrame — pure cell-grid composer for the wbase ADD PARTY
 * picker. Byte-exact against tools/parity/fixtures/cells/add-party-picker-1char.json
 * (the engine's cells from save/1.sav).
 *
 * The picker draws two dynamically-allocated TileWindows side-by-side at the
 * bottom of the screen:
 *
 *   leftPanel  — 19×5 @ (0, 19)  attr 0x0a  — "ADD WHO?" prompt + CANCEL button
 *   rightPanel — 20×5 @ (20, 19) attr 0x14  — roster list + right-edge scrollbar
 *
 * Both panels are filled with (space, attr 0x03) background; the per-cell attrs
 * carry the colour (highlight = attr low-nibble 0, with the high nibble selecting
 * the palette colour).
 *
 * Cursor model (2-state, mirrors REVIEW PC):
 *   - onCancel=false: cursor sits on candidates[cursorIdx], rendered as a single
 *     highlighted row in the right panel (center row of the 5-row window).
 *   - onCancel=true:  cursor sits on CANCEL in the left panel, which is rendered
 *     at attr 0x50 instead of 0x03.
 *
 * Engine references:
 *   - docs/re/findings/wbase-window-struct.json (window struct + geometry)
 *   - docs/re/findings/wbase-add-party-member.json (picker behaviour)
 *   - docs/re/wbase-main-menu.md §"Slot 0 — ADD PARTY MEMBER"
 */
import { createTileWindow, clearWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { Character, MessageDb } from '@wiz6/data';
import { raceName, className, sexName } from '../roster/creation/messages.js';

export interface AddPartyPickerView {
  /** Roster candidates available for adding (not already in the active party). */
  candidates: ReadonlyArray<Character>;
  /** Index into `candidates` for the highlighted row (when `onCancel` is false). */
  cursorIdx: number;
  /** When true, the cursor is on the CANCEL button in the left panel. */
  onCancel: boolean;
}

// --- Geometry constants -------------------------------------------------------
// Cell-grid positions come from the Task 1 fixture
// (tools/parity/fixtures/cells/add-party-picker-1char.json) where the engine
// stores x/y in CELL coordinates (40×25 grid). `createTileWindow` takes
// screenX/screenY in PIXELS, so we multiply by 8 (one cell = 8×8 px).
const CELL_PX = 8;

const LEFT_CELL_X = 0;
const LEFT_CELL_Y = 19;
const LEFT_W = 19;
const LEFT_H = 5;

// Note: the engine renders the right panel shifted 2 cells right from where
// the cell-grid fixture's struct (x=20) would place it — empirically NATHAN
// highlight lands at global cells 22-27, not 20-25. The struct in memory says
// x=20 but the engine adjusts at render time (mechanism unclear; possibly an
// overlapping struct we haven't found). Using x=22 here to match engine pixel
// output. The cells_off issue noted in wbase-window-struct.json findings is
// also part of this — see TODO #027.
const RIGHT_CELL_X = 22;
const RIGHT_CELL_Y = 19;
const RIGHT_W = 20;
const RIGHT_H = 5;

// Banner replacement at cell row 18. The engine fills the entire row with
// the underscore tile (0x5f at wfont3, attr 0x03) and overlays the picker
// title using **wfont2** (attr 0x12 — styled-with-border tile sprites,
// same font that composeCastleFrame uses for "MASTER OPTIONS"). Text is
// 'add\x5fmember' (lowercase 'add' + underscore separator + 'member') —
// wfont2's lowercase glyphs render as the engine's bordered-tile letter
// style. Positioned at cells 5-14 (verified against engine pixel data).
const BANNER_CELL_X = 0;
const BANNER_CELL_Y = 18;
const BANNER_W = 40;
const BANNER_H = 1;
// Lowercase chars 'a','d','d', '\x5f' (underscore separator), 'm','e','m','b','e','r'
// — these are the styled-with-border tile sprites in wfont3 (the same path
// composeCastleFrame uses for "master\x5foptions"). centeredPuts internally
// converts attr 0x12 → 0x03 (wfont3); we pass attr 0x03 directly here.
const BANNER_TITLE = 'add\x5fmember';
const BANNER_TITLE_COL = 5;
const BANNER_TITLE_ATTR = 0x03;
const BANNER_FILL_CHAR = 0x5f;
const BANNER_FILL_ATTR = 0x03;

// Right-edge vertical line at cell 19 across picker rows 19-23. Engine
// renders wfont1 char 0x1c (a tile whose cols 0-6 are gray and col 7 is
// black — produces a vertical black line at the right edge of cell 19).
const MIDDLE_CELL_X = 19;
const MIDDLE_CELL_Y = 19;
const MIDDLE_W = 1; // just cell 19
const MIDDLE_H = 5;
const MIDDLE_CHAR = 0x1c;
const MIDDLE_ATTR = 0x01; // wfont1 chrome

// Corner tile at cell (19, 24) — wfont1 char 0x1f closes the L: col 7 all
// black (continuing the right-edge line) + row 7 all black (joining the
// status row's bottom-line at y=199).
const CORNER_CELL_X = 19;
const CORNER_CELL_Y = 24;
const CORNER_CHAR = 0x1f;
const CORNER_ATTR = 0x01;

// Scrollbar column at cell 21 — engine renders ▲ at row 0 (red), track in
// rows 1-3, ▼ at row 4 (red). Chars in wfont2: 'E'=▲, 'G'=track, 'F'=▼.
const SCROLLBAR_CELL_X = 21;
const SCROLLBAR_CELL_Y = 19;
const SCROLLBAR_W = 1;
const SCROLLBAR_H = 5;
const SCROLLBAR_TOP = 0x45; // 'E'
const SCROLLBAR_TRACK = 0x47; // 'G'
const SCROLLBAR_BOTTOM = 0x46; // 'F'
const SCROLLBAR_ARROW_ATTR = 0x02; // wfont2 (the engine font for the scrollbar tiles)


/** Background fill attr for blank cells in both panels. */
const ATTR_BG = 0x03;
/** Highlight attr (selected row / button) — wfont0 path, palette[5] background. */
const ATTR_HIGHLIGHT = 0x50;

// Per-field attrs for a candidate row when highlighted (matching the fixture's
// NATHAN row exactly). The engine writes each field separately with its own
// attr; the highlight (attr 0x50) covers the NAME chars only — the SEX, dash,
// RACE, and CLASS fields keep their per-field colour attrs even on the cursor row.
const ATTR_NAME_HIGHLIGHT = 0x50;
const ATTR_NAME_PAD = 0x10;
const ATTR_SEX = 0x70;
const ATTR_DASH = 0x90;
const ATTR_RACE = 0x60;
const ATTR_SEPARATOR = 0x10;
const ATTR_CLASS = 0x30;

// Scrollbar geometry (right panel, column 19).
const SCROLLBAR_COL = 19;
const SCROLLBAR_ATTR = 0x02;
const SCROLLBAR_FILL_CHAR = 0x47; // 'G' — up-arrow / fill glyph in wfont2
const SCROLLBAR_END_CHAR = 0x46; // 'F' — down-arrow glyph in wfont2

// Roster-row layout (within the right panel; col 19 is the scrollbar).
// Name field: 6 chars + 2 trailing padding cells = 8 cells total (SEX_COL = 8).
const NAME_WIDTH = 6;
const SEX_COL = 8;
const DASH_COL = 9;
const RACE_COL = 10;
const RACE_WIDTH = 3; // also used as CLASS abbrev width — both truncate to 3 chars.
const SEPARATOR_COL = 13;
const CLASS_COL = 14;

/** Center row of the 5-row right panel — where the highlighted candidate is drawn. */
const CENTER_ROW = Math.floor(RIGHT_H / 2);

// "ADD WHO?" and "CANCEL" labels in the left panel. Their column positions in
// the fixture match `ceil((LEFT_W - len) / 2)`: 19-8 = 11 / 2 → 5.5 → 6 for
// "ADD WHO?" (8 chars), and 19-6 = 13 / 2 → 6.5 → 7 for "CANCEL" (6 chars).
const ADD_WHO_LABEL = 'ADD WHO?';
const ADD_WHO_ROW = 1;
const CANCEL_LABEL = 'CANCEL';
const CANCEL_ROW = 3;

/** Centered column for a label of length `len` in a panel of width `w` (ceil-divided pad). */
function centeredCol(w: number, len: number): number {
  return Math.ceil((w - len) / 2);
}

/** Truncate a candidate's race/class to its 3-char abbreviation, padded with spaces if shorter. */
function abbrev3(name: string): string {
  return (name + '   ').slice(0, RACE_WIDTH);
}

function composeLeftPanel(view: AddPartyPickerView): TileWindow {
  const w = createTileWindow({
    screenX: LEFT_CELL_X * CELL_PX,
    screenY: LEFT_CELL_Y * CELL_PX,
    widthCells: LEFT_W,
    heightCells: LEFT_H,
  });
  clearWindow(w, 0x20, ATTR_BG);

  // "ADD WHO?" — always at attr 0x03 (never highlighted).
  setCursor(w, centeredCol(LEFT_W, ADD_WHO_LABEL.length), ADD_WHO_ROW);
  puts(w, ADD_WHO_LABEL, ATTR_BG);

  // "CANCEL" — attr 0x50 when cursor on cancel, otherwise 0x03.
  setCursor(w, centeredCol(LEFT_W, CANCEL_LABEL.length), CANCEL_ROW);
  puts(w, CANCEL_LABEL, view.onCancel ? ATTR_HIGHLIGHT : ATTR_BG);

  return w;
}

/**
 * Draw a candidate row at the given panel row. The name is rendered with
 * highlight attrs when `highlighted` is true, padding attr otherwise.
 */
function drawCandidateRow(
  w: TileWindow,
  row: number,
  character: Character,
  db: MessageDb,
  highlighted: boolean,
): void {
  // NAME — padded to NAME_WIDTH chars. Highlighted cells use attr 0x50; the
  // remaining padding cells (out to NAME_WIDTH + NAME_PAD = 8) use attr 0x10.
  const nameAttr = highlighted ? ATTR_NAME_HIGHLIGHT : ATTR_NAME_PAD;
  const name = character.name.slice(0, NAME_WIDTH);
  setCursor(w, 0, row);
  puts(w, name, nameAttr);
  // Pad out to col SEX_COL with attr ATTR_NAME_PAD (engine: empty cells after a
  // shorter name carry the padding-attr, not the highlight-attr).
  const padCount = SEX_COL - name.length;
  if (padCount > 0) {
    setCursor(w, name.length, row);
    puts(w, ' '.repeat(padCount), ATTR_NAME_PAD);
  }

  // SEX — first letter of the sex name (M/F).
  const sexLetter = (sexName(db, character.sex) || ' ').charAt(0);
  setCursor(w, SEX_COL, row);
  puts(w, sexLetter, ATTR_SEX);

  // Dash separator between sex and race.
  setCursor(w, DASH_COL, row);
  puts(w, '-', ATTR_DASH);

  // RACE — 3-char abbreviation (e.g. RAWULF -> "RAW").
  setCursor(w, RACE_COL, row);
  puts(w, abbrev3(raceName(db, character.race)), ATTR_RACE);

  // Separator space between race and class.
  setCursor(w, SEPARATOR_COL, row);
  puts(w, ' ', ATTR_SEPARATOR);

  // CLASS — 3-char abbreviation (e.g. FIGHTER -> "FIG").
  setCursor(w, CLASS_COL, row);
  puts(w, abbrev3(className(db, character.class)), ATTR_CLASS);
}

function composeRightPanel(view: AddPartyPickerView, db: MessageDb): TileWindow {
  const w = createTileWindow({
    screenX: RIGHT_CELL_X * CELL_PX,
    screenY: RIGHT_CELL_Y * CELL_PX,
    widthCells: RIGHT_W,
    heightCells: RIGHT_H,
  });
  clearWindow(w, 0x20, ATTR_BG);

  // Scrollbar at col 19: 'G' rows 0..3-from-bottom, 'F' at row 3.
  // (The fifth row's scrollbar cell is left blank — the fixture has engine
  // residual bytes there which we ignore; the test masks them.)
  for (let r = 0; r < RIGHT_H - 2; r++) {
    setCursor(w, SCROLLBAR_COL, r);
    puts(w, String.fromCharCode(SCROLLBAR_FILL_CHAR), SCROLLBAR_ATTR);
  }
  setCursor(w, SCROLLBAR_COL, RIGHT_H - 2);
  puts(w, String.fromCharCode(SCROLLBAR_END_CHAR), SCROLLBAR_ATTR);

  // Candidates — always render the highlighted candidate at the CENTER_ROW.
  // Other visible rows (above / below) show neighbouring candidates if any;
  // when there's only one candidate, only the center row carries content.
  if (view.candidates.length > 0) {
    const cursor = Math.max(0, Math.min(view.candidates.length - 1, view.cursorIdx));
    for (let offset = -CENTER_ROW; offset <= RIGHT_H - 1 - CENTER_ROW; offset++) {
      const idx = cursor + offset;
      if (idx < 0 || idx >= view.candidates.length) continue;
      const row = CENTER_ROW + offset;
      const isHighlighted = offset === 0 && !view.onCancel;
      drawCandidateRow(w, row, view.candidates[idx]!, db, isHighlighted);
    }
  }

  return w;
}

/** "ADD MEMBER" banner that replaces composeCastleFrame's "MASTER OPTIONS"
 *  at cell row 18.
 *
 *  Engine layout when picker is open:
 *   - Cells 0-19 (left half): 0x5f underscore tile fill (matches the
 *     castle-frame banner's underscore-bar style) with the title overlaid.
 *   - Cells 20-39 (right half): plain gray (0x20 space at attr 0x03) — the
 *     picker erases the underscore fill on the right half of the row.
 */
function composeBanner(): TileWindow {
  const w = createTileWindow({
    screenX: BANNER_CELL_X * CELL_PX,
    screenY: BANNER_CELL_Y * CELL_PX,
    widthCells: BANNER_W,
    heightCells: BANNER_H,
  });
  // Cells 0-18: 0x5f tile at wfont3 (black top + black bottom + gray middle) —
  // same banner-bar tile that composeCastleFrame uses for MASTER OPTIONS.
  // Cell 19: 0x1d tile at wfont3 (banner bar PLUS right-edge vertical line) —
  // joins the row's underscore-bar style with the middleStrip's vertical line
  // at cell 19.
  // Cells 20-39: 0x23 tile at wfont1 (black top + gray rest, no bottom-line) —
  // the chrome frame tile the engine uses on the right half of the banner row
  // to clip the underscore bar's bottom-line where the picker takes over.
  for (let cx = 0; cx < 19; cx++) {
    setCursor(w, cx, 0);
    puts(w, String.fromCharCode(0x5f), 0x03); // wfont3 underscore
  }
  setCursor(w, 19, 0);
  puts(w, String.fromCharCode(0x1d), 0x03); // wfont3 underscore + right edge
  for (let cx = 20; cx < BANNER_W; cx++) {
    setCursor(w, cx, 0);
    puts(w, String.fromCharCode(0x23), 0x01); // wfont1 top-edge chrome tile
  }
  // Title overlay (cells 5-14).
  setCursor(w, BANNER_TITLE_COL, 0);
  puts(w, BANNER_TITLE, BANNER_TITLE_ATTR);
  return w;
}

/** Right-edge vertical line at cell 19, picker rows 19-23. wfont1 char 0x1c. */
function composeMiddleStrip(): TileWindow {
  const w = createTileWindow({
    screenX: MIDDLE_CELL_X * CELL_PX,
    screenY: MIDDLE_CELL_Y * CELL_PX,
    widthCells: MIDDLE_W,
    heightCells: MIDDLE_H,
  });
  clearWindow(w, MIDDLE_CHAR, MIDDLE_ATTR);
  return w;
}

/** Corner tile at cell (19, 24) — wfont1 0x1f. Closes the L by adding the
 *  bottom-row black line under the status-row's bottom edge. */
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

/** Scrollbar column at cell 21 with ▲ / track / ▼ glyphs.
 *  Per engine: top row = 'E' (red ▲), middle rows = 'G' (track), bottom = 'F' (red ▼). */
function composeScrollbar(): TileWindow {
  const w = createTileWindow({
    screenX: SCROLLBAR_CELL_X * CELL_PX,
    screenY: SCROLLBAR_CELL_Y * CELL_PX,
    widthCells: SCROLLBAR_W,
    heightCells: SCROLLBAR_H,
  });
  clearWindow(w, SCROLLBAR_TRACK, SCROLLBAR_ARROW_ATTR);
  setCursor(w, 0, 0);
  puts(w, String.fromCharCode(SCROLLBAR_TOP), SCROLLBAR_ARROW_ATTR);
  setCursor(w, 0, 4);
  puts(w, String.fromCharCode(SCROLLBAR_BOTTOM), SCROLLBAR_ARROW_ATTR);
  return w;
}

/**
 * Build the TileWindows that make up the ADD PARTY picker frame.
 * Pure function: no I/O, no DOM.
 *
 * Paint order (first → last, bottom → top):
 *   banner       — replaces composeCastleFrame's "MASTER OPTIONS" at row 18
 *   leftPanel    — "ADD WHO?" + CANCEL prompt
 *   middleStrip  — right-edge vertical line at cell 19 (wfont1 0x1c)
 *   scrollbar    — ▲ track ▼ glyphs at cell 21
 *   rightPanel   — candidate list (starts at cell 22)
 *   corner       — bottom-right L-tile at cell (19, 24) (wfont1 0x1f)
 */
export function composeAddPartyPickerFrame(
  view: AddPartyPickerView,
  db: MessageDb,
): TileWindow[] {
  return [
    composeBanner(),
    composeLeftPanel(view),
    composeMiddleStrip(),
    composeScrollbar(),
    composeRightPanel(view, db),
    composeCorner(),
  ];
}
