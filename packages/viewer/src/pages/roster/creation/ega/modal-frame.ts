/**
 * composeModalFrame — render an engine-style error-modal overlay.
 *
 * The engine renders status-bar modals via `FUN_505b(msg_id, row, col)`
 * (wpcmk.ovr 0x505b): set cursor → puts msg at attr style 0x12 →
 * play SOUND00 → wait_for_key_or_timeout. We mirror the visual half here;
 * audio + dismiss is wired by the caller.
 *
 * Position: the engine writes into `*0x56ca` (the bottomBar status window)
 * at (row 6, col 2) for the dup-name case. Our port renders the modal as a
 * dedicated overlay TileWindow at the same screen coordinates so it draws on
 * top of the underlying screen without mutating its window cells.
 *
 * Style: 0x12 in the engine's centeredPuts maps to wfont3 attr 0x03 (plain
 * highlighted text on default bg) — same style the bottomBar uses for its
 * regular prompts.
 *
 * Geometry: matches the 'bottomBar' entry in CREATION_WINDOW_GEOMETRY:
 *   40×5 @ (0, 160)  attr 0x13
 */

import { createTileWindow, clearWindow, setCursor, puts } from '@wiz6/parser';
import type { TileWindow } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import { creationString } from '../messages.js';

/** Engine status-bar dimensions — must match CREATION_WINDOW_GEOMETRY['bottomBar']. */
const STATUS_WIDTH_CELLS = 40;
const STATUS_HEIGHT_CELLS = 5;
const STATUS_SCREEN_X = 0;
const STATUS_SCREEN_Y = 160;

/**
 * Compose a TileWindow that mirrors the engine's error-modal display.
 *
 * The modal text is centered horizontally on row 2 (0-indexed) of the
 * bottomBar window, matching the engine's FUN_505b behavior which writes at
 * (row 6, col 2) in the full status window — row 6 in the engine's 0-indexed
 * bottomBar rows maps to row 2 in our 0-indexed 5-row window.
 *
 * @param db   — loaded MessageDb (msg.dbs)
 * @param msgId — message ID to display (e.g. MSG.dupNameError = 0x044e)
 */
export function composeModalFrame(db: MessageDb, msgId: number): TileWindow {
  const text = creationString(db, msgId);
  const win = createTileWindow({
    widthCells: STATUS_WIDTH_CELLS,
    heightCells: STATUS_HEIGHT_CELLS,
    screenX: STATUS_SCREEN_X,
    screenY: STATUS_SCREEN_Y,
  });
  // Fill with the bottomBar default fill (space, wfont3) so the background
  // matches the underlying status bar.
  clearWindow(win, 0x20, 0x03);
  // Center horizontally on row 2 (the modal text row).
  const col = Math.max(0, Math.floor((STATUS_WIDTH_CELLS - text.length) / 2));
  setCursor(win, col, 2);
  puts(win, text, 0x03);
  return win;
}
