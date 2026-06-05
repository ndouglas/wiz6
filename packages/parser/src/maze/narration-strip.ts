/**
 * narration-strip.ts — pure layout + draw for the START-NEW-GAME entry narration.
 *
 * The engine draws the 3 entry-narration lines (msg 10010/10011/10012) directly
 * into the bottom BLACK message strip (no window border): foreground = palette
 * INDEX 5, background = palette index 0, left margin x=8, line pitch 8px starting
 * at y=153. RE: docs/re/findings/maze-entry-sequence.json (modal_geometry).
 *
 * NOTE on the palette index: the RE prose calls index 5 "white", but in BOTH the
 * engine's COMPOSED_PALETTE and the port's, index 5 is the bright yellow
 * [255,255,85] you see in maze-entry-narration.png — the text is yellow, not
 * white (white is index 1). The INDEX (5) is the ground truth the parity fixture
 * stores; this module emits index 5 so the gate matches byte-exact.
 *
 * This is the SINGLE source of truth for the narration draw: both MazeView (live
 * render) and the parity gate (maze-entry-narration-parity.test.ts) call
 * drawNarrationStrip, so the gate can never drift from what the app draws.
 *
 * Pure — no I/O. Operates on a caller-supplied RGBA buffer.
 */

import type { Font, Palette } from '@wiz6/data';
import { renderTextRun } from '../formats/wfont-render.js';

/** Foreground palette index the engine uses for the narration text (yellow). */
export const NARRATION_FG_IDX = 5;
/** Background palette index (the black message strip). */
export const NARRATION_BG_IDX = 0;
/** Left margin (px) for all three lines. */
export const NARRATION_X = 8;
/**
 * Top y at which each glyph is DRAWN (8px pitch). The RE doc records the lines'
 * VISIBLE pixel bands as y153-158 / y161-166 / y169-174, but wfont0's glyph row 0
 * is blank for these caps (e.g. 'A' = blank top row), so the engine's glyph ORIGIN
 * sits one row HIGHER than the first lit pixel. Drawing at 152/160/168 reproduces
 * the engine's lit rows y153.. byte-exact (confirmed by the index-parity gate).
 */
export const NARRATION_LINE_Y: readonly number[] = [152, 160, 168];

/**
 * Draw the narration lines onto an RGBA destination buffer, exactly as the
 * engine lays them out (index 5 glyphs on index 0 background, x=8, the
 * NARRATION_LINE_Y rows). `palette` maps the indices to RGB — pass the same
 * COMPOSED_PALETTE the rest of the frame is composed with.
 *
 * Only up to NARRATION_LINE_Y.length lines are drawn; extras are ignored.
 */
export function drawNarrationStrip(
  destRgba: Uint8ClampedArray,
  destW: number,
  destH: number,
  lines: readonly string[],
  font: Font,
  palette: Palette,
): void {
  for (let i = 0; i < lines.length && i < NARRATION_LINE_Y.length; i++) {
    renderTextRun(
      destRgba,
      destW,
      destH,
      NARRATION_X,
      NARRATION_LINE_Y[i]!,
      lines[i]!,
      font,
      NARRATION_FG_IDX,
      palette,
      NARRATION_BG_IDX,
    );
  }
}
