/**
 * narration-strip.ts — pure layout + draw for the START-NEW-GAME entry BOTTOM
 * STRIP (y144–199), the per-`entryMode` message band.
 *
 * This is the SINGLE source of truth for the bottom-strip draw: both MazeView
 * (live render) and the parity gates call `drawEntryStrip`, so the gate can never
 * drift from what the app draws. Pure — no I/O. Operates on a caller-supplied
 * RGBA buffer.
 *
 * ── PER-MODE STRIP (RE: docs/re/findings/maze-newgame-byteexact.json, verified
 *    against the committed fixtures tools/parity/fixtures/engine/newgame-seq-0N) ──
 *
 *   title      — GRAY widget background (idx 8) with two BLUE (idx 1) centered
 *                title lines ("ENTERING" y161, "BANE OF THE COSMIC FORGE" y169).
 *                Frame 02. (Fills the strip gray first, blanking any baked
 *                OPTIONS/TURN chrome glyphs, then draws the blue centered title.)
 *   narration  — CLEAN BLACK (idx 0) across the WHOLE strip y144–199 + three
 *                YELLOW (idx 5) left-aligned lines (x=8, y153/161/169). This
 *                BLANKS the gray widget — the fix for the shipped bug where the
 *                narration was drawn OVER the gray OPTIONS/TURN widget.
 *   bump       — CLEAN BLACK + one YELLOW CENTERED line ("HMMMM…" y153). Frame
 *                05/06.
 *   gate-walk  — CLEAN BLACK strip, no text. Frame 04. (The committed fixtures
 *                show the gate-walk strip as black, NOT the gray free-roam widget
 *                — see the note below.)
 *   free       — NOT handled here: the caller leaves the baked gray OPTIONS/TURN
 *                widget (the static chrome) untouched.
 *
 * ── PALETTE INDEX note ── In BOTH the engine's COMPOSED_PALETTE and the port's,
 * index 5 is bright yellow [255,255,85] (the entry text colour — the RE prose
 * calls it "white" but white is index 1), index 1 is blue [85,85,255], index 8
 * is gray [85,85,85], index 0 is black. The INDEX is the parity ground truth.
 *
 * ── gate-walk gray-vs-black caveat ── The plan/prose describe the gate-walk
 * strip as the gray OPTIONS/TURN widget, but the committed byte-exact fixture
 * (newgame-seq-04-walk-gy119) shows it as a CLEAN BLACK strip (histogram {0:17920}
 * — pure black, no gray, no text). The fixtures are the gate, so we match them:
 * gate-walk = clean black. (The engine keeps the borderless message window open
 * across the forced walk; the gray widget only returns at free-roam.)
 */

import type { Font, Palette } from '@wiz6/data';
import { renderTextRun } from '../formats/wfont-render.js';
import type { EntryMode } from './entry-sequence.js';

/** Foreground palette index the engine uses for the narration / bump text (yellow). */
export const NARRATION_FG_IDX = 5;
/** Foreground palette index for the ENTERING title text (blue). */
export const TITLE_FG_IDX = 1;
/** Background palette index for the narration / bump strip (black). */
export const NARRATION_BG_IDX = 0;
/** Background palette index for the title strip (the gray widget). */
export const TITLE_BG_IDX = 8;
/** Left margin (px) for the left-aligned narration lines. */
export const NARRATION_X = 8;

/** The bottom strip's pixel band (inclusive top, exclusive bottom). */
export const STRIP_Y0 = 144;
export const STRIP_Y1 = 200; // exclusive
const SCREEN_W = 320;

/**
 * Top y at which each glyph is DRAWN (8px pitch). The lines' VISIBLE pixel bands
 * are y153-158 / y161-166 / y169-174, but wfont0's glyph row 0 is blank for these
 * caps, so the engine's glyph ORIGIN sits one row HIGHER than the first lit pixel.
 * Drawing at 152/160/168 reproduces the engine's lit rows y153.. byte-exact.
 */
export const NARRATION_LINE_Y: readonly number[] = [152, 160, 168];
/** Title line origins: line1 ("ENTERING") lit y161 → origin 160; line2 lit y169 → 168. */
export const TITLE_LINE_Y: readonly number[] = [160, 168];

/** Per-mode strip text payloads, decoded from the message db by the caller. */
export interface EntryStripText {
  /** Title lines (msg 1212/1213): "ENTERING", "BANE OF THE COSMIC FORGE". */
  title: readonly string[];
  /** Narration lines (msg 10010/10011/10012). */
  narration: readonly string[];
  /** Bump line (msg 10020): "HMMMM...". */
  bump: string;
}

/** Fill the whole strip band (y144–199, full width) with a palette index. */
function fillStrip(
  destRgba: Uint8ClampedArray,
  destW: number,
  destH: number,
  idx: number,
  palette: Palette,
): void {
  const c = palette.colors[idx] ?? [0, 0, 0];
  for (let y = STRIP_Y0; y < STRIP_Y1 && y < destH; y++) {
    for (let x = 0; x < destW; x++) {
      const o = (y * destW + x) * 4;
      destRgba[o] = c[0]!;
      destRgba[o + 1] = c[1]!;
      destRgba[o + 2] = c[2]!;
      destRgba[o + 3] = 0xff;
    }
  }
}

/** Centered x for a fixed-width (8px/char) line on a `width`-px screen. */
function centeredX(text: string, width: number): number {
  return Math.floor((width - text.length * 8) / 2);
}

/**
 * Draw the bottom strip for the given entry `mode` onto an RGBA destination
 * buffer. The caller passes the SAME COMPOSED_PALETTE the frame is composed with.
 *
 * `gate-walk` / `bump` / `narration` / `title` OVERWRITE the strip (the
 * mode-appropriate background fill + text). `free` is a no-op here — the caller
 * leaves the baked gray OPTIONS/TURN widget for free-roam.
 *
 * Returns nothing; mutates `destRgba` in place.
 */
export function drawEntryStrip(
  destRgba: Uint8ClampedArray,
  destW: number,
  destH: number,
  mode: EntryMode,
  text: EntryStripText,
  font: Font,
  palette: Palette,
): void {
  switch (mode) {
    case 'title': {
      // Gray widget background (blanks any baked OPTIONS/TURN glyphs) + black
      // y144 separator / y199 baseline, then the two blue centered title lines.
      fillStrip(destRgba, destW, destH, TITLE_BG_IDX, palette);
      blackRow(destRgba, destW, destH, STRIP_Y0); // y144 separator
      blackRow(destRgba, destW, destH, 151); // y151 inner-window top border
      blackRow(destRgba, destW, destH, STRIP_Y1 - 1); // y199 baseline
      for (let i = 0; i < text.title.length && i < TITLE_LINE_Y.length; i++) {
        const line = text.title[i]!;
        renderTextRun(
          destRgba,
          destW,
          destH,
          centeredX(line, destW),
          TITLE_LINE_Y[i]!,
          line,
          font,
          TITLE_FG_IDX,
          palette,
          TITLE_BG_IDX,
        );
      }
      return;
    }

    case 'narration': {
      // Clean black strip (blanks the gray widget — the bug fix) + 3 yellow
      // left-aligned lines.
      fillStrip(destRgba, destW, destH, NARRATION_BG_IDX, palette);
      for (let i = 0; i < text.narration.length && i < NARRATION_LINE_Y.length; i++) {
        renderTextRun(
          destRgba,
          destW,
          destH,
          NARRATION_X,
          NARRATION_LINE_Y[i]!,
          text.narration[i]!,
          font,
          NARRATION_FG_IDX,
          palette,
          NARRATION_BG_IDX,
        );
      }
      return;
    }

    case 'bump': {
      // Clean black strip + a single yellow centered line ("HMMMM...").
      fillStrip(destRgba, destW, destH, NARRATION_BG_IDX, palette);
      renderTextRun(
        destRgba,
        destW,
        destH,
        centeredX(text.bump, destW),
        NARRATION_LINE_Y[0]!,
        text.bump,
        font,
        NARRATION_FG_IDX,
        palette,
        NARRATION_BG_IDX,
      );
      return;
    }

    case 'gate-walk': {
      // Clean black strip, no text (matches newgame-seq-04 byte-exact).
      fillStrip(destRgba, destW, destH, NARRATION_BG_IDX, palette);
      return;
    }

    case 'free':
      // No-op: the caller keeps the baked gray OPTIONS/TURN widget.
      return;
  }
}

/** Fill a single screen row with black (idx 0). */
function blackRow(destRgba: Uint8ClampedArray, destW: number, destH: number, y: number): void {
  if (y < 0 || y >= destH) return;
  for (let x = 0; x < destW; x++) {
    const o = (y * destW + x) * 4;
    destRgba[o] = 0;
    destRgba[o + 1] = 0;
    destRgba[o + 2] = 0;
    destRgba[o + 3] = 0xff;
  }
}

/**
 * drawNarrationStrip — LEGACY single-purpose helper kept for the existing
 * narration parity gate (maze-entry-narration-parity.test.ts). Draws ONLY the
 * 3 yellow left-aligned narration lines (idx 5 on idx 0) at NARRATION_LINE_Y,
 * WITHOUT clearing the strip background (the caller supplies a black canvas).
 *
 * New call sites should use `drawEntryStrip(..., 'narration', ...)` which also
 * blanks the strip to black. SCREEN_W is used only for the legacy doc note.
 */
export function drawNarrationStrip(
  destRgba: Uint8ClampedArray,
  destW: number,
  destH: number,
  lines: readonly string[],
  font: Font,
  palette: Palette,
): void {
  void SCREEN_W;
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
