/**
 * composeRenamePrompt — WPCVW EDIT/RENAME prompt screen.
 *
 * Engine reference: wpcvw_edit_name @ wpcvw.ovr 0x6674. Clears+borders the
 * main panel, prints msg 0x468 ("NEW NAME >") at (col=1, row=1) attr 0x03,
 * then calls ui_text_input_editor with max_chars=7. Buffer position is
 * immediately after the prompt — mirroring wpcmk's RenameInputScreen
 * (the finding's "cursor at (5, 7)" is a paraphrase of decompile arg
 * cursor_x=5 and max_chars=7; the buffer y coord matches the prompt row 1).
 *
 * Cursor block is wfont0 glyph 0x61 ('a') at attr 0x10 (same as
 * wpcmk RenameInputScreen). Typed letters at attr 0x50.
 *
 * Spec: docs/superpowers/specs/2026-05-29-wpcvw-edit-submenu-design.md
 */

import { createTileWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import { creationString } from '../roster/creation/messages.js';

const PANEL_W = 40;
const PANEL_H = 20;
const PROMPT_MSG = 0x468;
const PROMPT_COL = 1;
const PROMPT_ROW = 1;
const ATTR_PROMPT = 0x03;
const ATTR_TYPED = 0x50;
const ATTR_CURSOR_BLOCK = 0x10;
const ATTR_PAD = 0x00;
const CURSOR_BLOCK_CHAR = 'a';
const NAME_MAX_LENGTH = 7;

export interface RenamePromptView {
  /** Current typed buffer (lowercase preserved; rendered upper). */
  buffer: string;
  db: MessageDb;
}

export function composeRenamePrompt(view: RenamePromptView): TileWindow {
  const w = createTileWindow({
    screenX: 0,
    screenY: 0,
    widthCells: PANEL_W,
    heightCells: PANEL_H,
  });
  w.invertHighlight = false;

  const promptText = creationString(view.db, PROMPT_MSG);
  setCursor(w, PROMPT_COL, PROMPT_ROW);
  puts(w, promptText, ATTR_PROMPT);

  const bufferStartCol = PROMPT_COL + promptText.length;
  const visibleBuffer = view.buffer.slice(0, NAME_MAX_LENGTH).toUpperCase();
  if (visibleBuffer.length > 0) {
    setCursor(w, bufferStartCol, PROMPT_ROW);
    puts(w, visibleBuffer, ATTR_TYPED);
  }
  setCursor(w, bufferStartCol + visibleBuffer.length, PROMPT_ROW);
  puts(w, CURSOR_BLOCK_CHAR, ATTR_CURSOR_BLOCK);

  const padCount = NAME_MAX_LENGTH - visibleBuffer.length;
  if (padCount > 0) {
    setCursor(w, bufferStartCol + visibleBuffer.length + 1, PROMPT_ROW);
    puts(w, ' '.repeat(padCount), ATTR_PAD);
  }

  return w;
}
