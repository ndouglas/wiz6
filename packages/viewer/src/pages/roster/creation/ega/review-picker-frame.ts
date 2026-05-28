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
   * DELETE PC reuses this picker layout with MSG.deleteWho instead.
   */
  titleMsgId?: number;
}

/** Draw one roster entry into the menuPanel at `row`. */
function drawRosterRow(
  panel: TileWindow,
  row: number,
  ch: Character,
  db: MessageDb,
): void {
  // Col 0 = scrollbar (drawn separately). Cols 1..(name.length) hold the NAME
  // chars at attr 0x50. The trailing padding to col 8 (inclusive) is spaces at
  // attr 0x10 — verified vs slot 1: NATHAN (6 chars at cols 1..6 attr 0x50)
  // followed by 2 spaces at cols 7..8 attr 0x10.
  const name = ch.name.slice(0, 7);
  setCursor(panel, 1, row);
  puts(panel, name, 0x50);
  for (let x = 1 + name.length; x <= 8; x++) {
    setCursor(panel, x, row);
    puts(panel, ' ', 0x10);
  }

  // SEX glyph @0x70, '-' @0x90, RACE abbrev @0x60.
  const sexStr = sexName(db, ch.sex ?? 0);
  setCursor(panel, 9, row);
  puts(panel, sexStr.charAt(0), 0x70);
  setCursor(panel, 10, row);
  puts(panel, '-', 0x90);
  const race = raceName(db, ch.race)
    .padEnd(RACE_ABBREV_LEN)
    .slice(0, RACE_ABBREV_LEN);
  setCursor(panel, 11, row);
  puts(panel, race, 0x60);

  // Space pad + CLASS abbrev @0x30.
  setCursor(panel, 14, row);
  puts(panel, ' ', 0x10);
  const cls = className(db, ch.class)
    .padEnd(CLASS_ABBREV_LEN)
    .slice(0, CLASS_ABBREV_LEN);
  setCursor(panel, 15, row);
  puts(panel, cls, 0x30);
}

/** First roster entry sits at menuPanel row 3 (after the 3 scrollbar arrows). */
const ENTRY_ROW_OFFSET = 3;

/**
 * Build the four TileWindows for the REVIEW WHO? picker in paint order.
 *
 * - top: persistent windows + char-sheet template chrome (createPersistentWindows
 *   already does this; we don't write anything else into top — no character is
 *   loaded yet).
 * - bottomBar row 1: "REVIEW WHO?" centered (MSG.reviewWho).
 * - bottomBar row 3: "CANCEL"     centered (MSG.cancelOption).
 * - menuPanel col 0: scrollbar — 'E' top, 'G' track, 'F' bottom; all attr 0x02.
 * - menuPanel rows 3..(3+N-1): roster entries; cols 1..17.
 *
 * Scrollbar geometry: for a roster of N ≤ 13 entries we draw arrows from row 0
 * (top) to row (N+1) (bottom), occupying rows 0..N+1. Beyond N=13 we'd need to
 * page; that's a follow-up.
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

  // Roster entries.
  for (let i = 0; i < roster.length; i++) {
    const row = ENTRY_ROW_OFFSET + i;
    if (row >= menuPanel.heightCells) break;
    drawRosterRow(menuPanel, row, roster[i]!, db);
  }

  // bottomBar prompts. Header msg defaults to MSG.reviewWho; DELETE picker
  // passes MSG.deleteWho via the `titleMsgId` field.
  const title = creationString(db, view.titleMsgId ?? MSG.reviewWho);
  setCursor(bottomBar, Math.floor((bottomBar.widthCells - title.length) / 2), 1);
  puts(bottomBar, title, 0x03);
  const cancel = creationString(db, MSG.cancelOption);
  setCursor(bottomBar, Math.floor((bottomBar.widthCells - cancel.length) / 2), 3);
  puts(bottomBar, cancel, 0x03);

  return [top, bottomBar, menuPanel];
}
