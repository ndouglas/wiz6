/**
 * composeReviewPickerFrame — pure layout for the REVIEW WHO? roster picker.
 *
 * Shared by `ReviewPickerScreen.tsx` (live viewer) and the parity test in
 * `tools/parity/screen-parity.test.ts`. Verified pixel-exact against the
 * engine slot-1 cell dump (1-character roster: NATHAN Rawulf Fighter).
 *
 * Engine equivalent: `wpcmk_show_roster_picker` (wpcmk file 0x56a0).
 */

import { setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { MessageDb, Character } from '@wiz6/data';
import { createPersistentWindows } from './windows.js';
import { MSG, creationString, raceName, className, sexName } from '../messages.js';

const RACE_ABBREV_LEN = 3;
const CLASS_ABBREV_LEN = 3;

export interface ReviewPickerView {
  roster: ReadonlyArray<Character>;
  cursorIdx: number;
  /**
   * Optional header msg ID for bottomBar row 1 — defaults to MSG.reviewWho.
   * DELETE / RENAME / PORTRAIT pickers reuse this layout with different titles.
   */
  titleMsgId?: number;
  /**
   * Two-state cursor model from `wpcmk_show_roster_picker` (wpcmk file 0x56a0):
   * the picker has a separate "on CANCEL" state. When `onCancel === true`, the
   * CANCEL option at bottomBar row 3 is highlighted (attr 0x50) and the
   * cursorIdx roster row is rendered without highlight (attr 0x03). When
   * `onCancel === false`, the highlight flips. See
   * findings/wpcmk-roster-picker-input.json.
   */
  onCancel?: boolean;
}

/**
 * Draw one roster entry into the menuPanel at `row`.
 *
 * The engine (`wpcmk_show_roster_picker`, wpcmk file 0x56a0) renders rows TWO
 * different ways depending on whether the row is the cursor row:
 *
 *   - CURSOR row (`selected === true`): NAME on a palette-5 highlight bar
 *     (attr 0x50) with the SEX / dash / RACE / CLASS fields each in their own
 *     colour (0x70 / 0x90 / 0x60 / 0x30). The wfont0 highlight path.
 *   - NON-cursor rows (`selected === false`): EVERY field — name, sex, dash,
 *     race, class, and all padding — is drawn at attr 0x03 (palette-1 text).
 *     No per-field colour. Verified pixel-by-pixel against the 6-char
 *     legendary-squad PORTRAIT FOR WHOM? fixture (`portrait-picker-squad`):
 *     non-cursor scanlines carry only palette-1; only the VEXA cursor row
 *     carries palette {3,5,6,7}. (Mirrors `composeAddPartyPickerFrame`, the
 *     wpcvw sibling picker.)
 *
 * All four 1-char NATHAN picker fixtures only ever render the cursor row, so
 * this non-cursor uniformity was invisible until a multi-char roster.
 */
function drawRosterRow(
  panel: TileWindow,
  row: number,
  ch: Character,
  db: MessageDb,
  selected: boolean,
): void {
  // Per-field attrs: cursor row uses the wfont0 highlight colours; non-cursor
  // rows draw EVERY field at attr 0x03 (uniform palette-1, no colour).
  const nameAttr = selected ? 0x50 : 0x03;
  const padAttr = selected ? 0x10 : 0x03;
  const sexAttr = selected ? 0x70 : 0x03;
  const dashAttr = selected ? 0x90 : 0x03;
  const raceAttr = selected ? 0x60 : 0x03;
  const sepAttr = selected ? 0x10 : 0x03;
  const classAttr = selected ? 0x30 : 0x03;

  // Col 0 = scrollbar (drawn separately). Cols 1..(name.length) hold the NAME
  // chars. Trailing pad to col 8.
  const name = ch.name.slice(0, 7);
  setCursor(panel, 1, row);
  puts(panel, name, nameAttr);
  for (let x = 1 + name.length; x <= 8; x++) {
    setCursor(panel, x, row);
    puts(panel, ' ', padAttr);
  }

  // SEX glyph, '-' separator, RACE abbrev.
  const sexStr = sexName(db, ch.sex ?? 0);
  setCursor(panel, 9, row);
  puts(panel, sexStr.charAt(0), sexAttr);
  setCursor(panel, 10, row);
  puts(panel, '-', dashAttr);
  const race = raceName(db, ch.race)
    .padEnd(RACE_ABBREV_LEN)
    .slice(0, RACE_ABBREV_LEN);
  setCursor(panel, 11, row);
  puts(panel, race, raceAttr);

  // Space pad + CLASS abbrev.
  setCursor(panel, 14, row);
  puts(panel, ' ', sepAttr);
  const cls = className(db, ch.class)
    .padEnd(CLASS_ABBREV_LEN)
    .slice(0, CLASS_ABBREV_LEN);
  setCursor(panel, 15, row);
  puts(panel, cls, classAttr);
}

/**
 * The CURSOR (selected) entry is always drawn at menuPanel cell row 3 (the
 * fixed cursor position). The engine SCROLLS the list around this pin: entry
 * `i` is drawn at `CURSOR_ROW + (i - cursorIdx)`, so the highlighted entry
 * stays at row 3 regardless of which roster index it is. Verified against both
 * the 1-char NATHAN fixture (cursor at row 3, nothing above) and the 6-char
 * legendary-squad fixture (cursor VEXA at row 3, two entries above + three
 * below). The old `ENTRY_ROW_OFFSET + i` (absolute) model only happened to
 * match when cursorIdx === 0 — which every 1-char fixture is — hiding the bug.
 */
const CURSOR_ROW = 3;

/**
 * Build the four TileWindows for the REVIEW WHO? picker in paint order.
 *
 * - top: persistent windows + char-sheet template chrome (createPersistentWindows
 *   already does this; we don't write anything else into top — no character is
 *   loaded yet).
 * - bottomBar row 1: "REVIEW WHO?" centered (MSG.reviewWho).
 * - bottomBar row 3: "CANCEL"     centered (MSG.cancelOption).
 * - menuPanel col 0: scrollbar — 'E' top, 'G' track, 'F' bottom; all attr 0x02.
 * - menuPanel roster entries: the cursor entry pins to row `CURSOR_ROW` (3);
 *   entry `i` lands at `CURSOR_ROW + (i - cursorIdx)`, scrolling the list around
 *   the fixed cursor. Cols 1..17.
 *
 * Scrollbar geometry: the scrollbar is FIXED at rows 0..6 regardless of roster
 * size (verified vs the 1-char + 6-char fixtures). Beyond a full window the
 * engine pages; not yet RE'd.
 */
export function composeReviewPickerFrame(
  view: ReviewPickerView,
  db: MessageDb,
): TileWindow[] {
  const { top, bottomBar, menuPanel } = createPersistentWindows();
  // The roster list renders names + race + class in COLORED highlight mode
  // (yellow on black, etc.) — verified vs slot 1. createPersistentWindows
  // defaults menuPanel.invertHighlight to true (right for race/class pickers
  // where the selected entry is a yellow BAR with black text); the review
  // picker needs the opposite.
  menuPanel.invertHighlight = false;
  const { roster } = view;

  // menuPanel col 0 scrollbar — verified vs slot 1 (1-character roster): the
  // scrollbar is FIXED at rows 0..6 regardless of roster size. 'E' (0x45) at
  // row 0 (top arrow), 'F' (0x46) at row 6 (bottom arrow), 'G' (0x47) on the
  // rows between. All attr 0x02 (wfont2 scrollbar glyphs). Rows 7..12 remain
  // as default gray fill. For larger rosters the engine pages; not yet RE'd.
  const SCROLLBAR_END = 6;
  for (let r = 0; r <= SCROLLBAR_END; r++) {
    setCursor(menuPanel, 0, r);
    const glyph = r === 0 ? 'E' : r === SCROLLBAR_END ? 'F' : 'G';
    puts(menuPanel, glyph, 0x02);
  }

  // Roster entries. The current roster cursor row is highlighted iff the
  // picker is in the 'roster' state (i.e. NOT on CANCEL). Engine's two-state
  // cursor: highlight flips between the roster row and the CANCEL bottomBar
  // row as the user navigates between them via ArrowLeft / ArrowRight/Up/Down.
  const onCancel = view.onCancel === true;
  for (let i = 0; i < roster.length; i++) {
    // Cursor-relative placement: the selected entry pins to CURSOR_ROW; the
    // list scrolls around it. Rows above row 1 (the scrollbar top-arrow) or at
    // or past the window bottom are off-screen and skipped.
    const row = CURSOR_ROW + (i - view.cursorIdx);
    if (row < 1 || row >= menuPanel.heightCells) continue;
    drawRosterRow(menuPanel, row, roster[i]!, db, !onCancel && i === view.cursorIdx);
  }

  // bottomBar prompts. Header msg defaults to MSG.reviewWho; DELETE/RENAME/
  // PORTRAIT pickers pass their own via `titleMsgId`. CANCEL row attr flips
  // 0x03 ↔ 0x50 with the two-state cursor.
  const title = creationString(db, view.titleMsgId ?? MSG.reviewWho);
  setCursor(bottomBar, Math.floor((bottomBar.widthCells - title.length) / 2), 1);
  puts(bottomBar, title, 0x03);
  const cancel = creationString(db, MSG.cancelOption);
  setCursor(bottomBar, Math.floor((bottomBar.widthCells - cancel.length) / 2), 3);
  puts(bottomBar, cancel, onCancel ? 0x50 : 0x03);

  return [top, bottomBar, menuPanel];
}
