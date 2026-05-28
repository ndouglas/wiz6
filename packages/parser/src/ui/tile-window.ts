/**
 * Tile-based UI windows — Wiz6's text-window primitive.
 *
 * Wiz6's UI is built from 8×8 cells arranged in 40×25 screen grids. Each
 * "tile-mode" window owns a (char, attr) cell array; rendering = walk the
 * cells and blit one 8×8 sprite tile per cell from the wfont*.ega
 * spritesheets. There is NO transparency, NO fg/bg-attribute compositing,
 * NO pixel-level draws in this mode — every tile is a complete 8×8
 * picture with all its colors baked in.
 *
 * The attribute byte's LOW NIBBLE selects which wfont file to use:
 *   attr_lo=1 → wfont1, attr_lo=2 → wfont2, attr_lo=3 → wfont3 (main UI
 *   font), attr_lo=4 → wfont4.
 *
 * Reference: docs/re/findings/wfont-tile-system.json
 * Engine functions:
 *   ui_window_clear  (wroot 0x32be) → clearWindow
 *   ui_window_set_cursor (wroot 0x30b) → setCursor
 *   ui_window_puts   (wroot 0x251d) → puts
 *   ui_centered_text (wroot 0xb7e — c61a) → centeredPuts
 *   blit (wroot 0x2b19) → renderTileWindow
 *
 * Cell encoding: each cell is 2 bytes — `[char, attr]`. The cells array
 * has `widthCells * heightCells` cells = `widthCells * heightCells * 2`
 * bytes total.
 *
 * Pixel-mode windows (the gate art etc.) do NOT use this abstraction —
 * they composite via the PIC + sprite primitives in pic-render.ts.
 */

import type { Font, Font4bpp, Palette } from '@wiz6/data';
import { renderTextRun4bpp } from '../formats/wfont-4bpp-render.js';
import { renderTextRun } from '../formats/wfont-render.js';

export interface TileWindow {
  /** Screen position of the window's top-left corner, in pixels. */
  screenX: number;
  screenY: number;
  /** Window dimensions, in 8×8 cells. */
  widthCells: number;
  heightCells: number;
  /**
   * Cell grid: `[char0, attr0, char1, attr1, ...]` row-major,
   * length = `widthCells * heightCells * 2`.
   */
  cells: Uint8Array;
  /** Current cursor position, in cell coords (within the window). */
  cursorX: number;
  cursorY: number;
  /**
   * Highlight render mode for this window. The same highlight cell (attr
   * low-nibble 0, e.g. 0x50) is drawn two ways by the engine via different
   * ega.drv slots, indistinguishable from the stored (char, attr):
   *   - false/undefined → COLORED TEXT: stroke = palette[high nibble], bg = black.
   *     (character-sheet labels/values: yellow STR, white values, etc.)
   *   - true → INVERSE: stroke = black, bg = palette[high nibble].
   *     (menu selection cursors: black text on a yellow bar)
   * Set per window by the caller since the cell alone can't carry it.
   */
  invertHighlight?: boolean;
  /**
   * Optional per-cell override of the inversion polarity for the highlight
   * path. One byte per cell (row-major, length = widthCells * heightCells);
   * 0 = follow `invertHighlight`, 1 = flip it. Used for windows that mix the
   * two render modes — e.g. the char-sheet `top` window renders STR labels at
   * attr 0x50 as COLORED but the BONUS box at attr 0x70 as INVERSE, despite
   * both being in the same window with `invertHighlight=false`. The cell alone
   * can't distinguish (per the CLAUDE.md negated-flag note); the caller marks
   * the inverted cells here. Optional — if omitted, all cells follow
   * `invertHighlight`.
   */
  highlightInvertMask?: Uint8Array;
}

/** Wfont file lookup. attr's low nibble selects font1..font4 (4bpp tiles)
 *  for the normal text path. font0 (1bpp) is used by the HIGHLIGHT path
 *  (cells stored by `df85`, characterized by attr_low_nibble==0 and
 *  attr!=0); the cell's high-nibble attr is the background palette index
 *  and stroke is always palette[0] (black). */
export interface FontSet {
  /** 1bpp text mask used by the highlight path. */
  font0?: Font | null;
  /** attr_lo=1 → wfont1. */
  font1?: Font4bpp | null;
  /** attr_lo=2 → wfont2. */
  font2?: Font4bpp | null;
  /** attr_lo=3 → wfont3 (THE main UI font). */
  font3?: Font4bpp | null;
  /** attr_lo=4 → wfont4. */
  font4?: Font4bpp | null;
}

/** Allocate a fresh tile window with all cells zeroed. */
export function createTileWindow(opts: {
  screenX: number;
  screenY: number;
  widthCells: number;
  heightCells: number;
}): TileWindow {
  return {
    screenX: opts.screenX,
    screenY: opts.screenY,
    widthCells: opts.widthCells,
    heightCells: opts.heightCells,
    cells: new Uint8Array(opts.widthCells * opts.heightCells * 2),
    cursorX: 0,
    cursorY: 0,
  };
}

/** `ui_window_clear` — fill every cell with the same (char, attr) pair.
 *  Also resets the cursor to (0, 0). */
export function clearWindow(win: TileWindow, char: number, attr: number): void {
  for (let i = 0; i < win.cells.length; i += 2) {
    win.cells[i] = char & 0xff;
    win.cells[i + 1] = attr & 0xff;
  }
  win.cursorX = 0;
  win.cursorY = 0;
}

/** `ui_window_set_cursor` — set cursor in cell coords. Per the engine,
 *  the coordinates are modded by the window's dimensions, so passing
 *  out-of-range values wraps. */
export function setCursor(win: TileWindow, x: number, y: number): void {
  win.cursorX = ((x % win.widthCells) + win.widthCells) % win.widthCells;
  win.cursorY = ((y % win.heightCells) + win.heightCells) % win.heightCells;
}

/** `ui_window_puts` — write a string at the cursor with the given attr.
 *  Each byte (INCLUDING space 0x20) gets written to one cell as `(byte, attr)`;
 *  cursor advances by one cell per byte, wrapping at both x and y.
 *
 *  Space is written like any other char — the tile fonts render glyph 0x20 as
 *  the background fill (wfont3 0x20 = solid gray; wfont0 highlight 0x20 = blank
 *  on the highlight bg). This matches the engine, and crucially keeps the space
 *  cell carrying the same attr as its word — so a highlighted multi-word label
 *  (e.g. "CHARACTER MENU") highlights the inter-word gap too. */
export function puts(win: TileWindow, text: string, attr: number): void {
  const a = attr & 0xff;
  for (let i = 0; i < text.length; i++) {
    const idx = (win.cursorY * win.widthCells + win.cursorX) * 2;
    win.cells[idx] = text.charCodeAt(i) & 0xff;
    win.cells[idx + 1] = a;
    win.cursorX++;
    if (win.cursorX >= win.widthCells) {
      win.cursorX = 0;
      win.cursorY++;
      if (win.cursorY >= win.heightCells) {
        win.cursorY = 0;
      }
    }
  }
}

/**
 * `ui_centered_text` (c61a) — pad `text` to the window's width and
 * write it at the current cursor row. The engine's attr translation:
 * for attr ≥ 0x10, subtract 0xF (so the typical banner call
 * `c61a(..., 0, 0x12)` becomes `puts(..., 3)`, selecting wfont3).
 *
 * The padding character is left as a parameter (engine likely uses
 * `0x5F` banner-space for the banner row); we don't try to guess from
 * the attr.
 */
export function centeredPuts(
  win: TileWindow,
  text: string,
  attr: number,
  padChar: number,
): void {
  const effectiveAttr = attr >= 0x10 ? attr - 0xf : attr;
  const totalWidth = win.widthCells;
  const padTotal = Math.max(0, totalWidth - text.length);
  const leftPad = padTotal >> 1;
  const rightPad = padTotal - leftPad;
  const padStr = String.fromCharCode(padChar);
  win.cursorX = 0;
  // (preserve cursorY)
  puts(win, padStr.repeat(leftPad) + text + padStr.repeat(rightPad), effectiveAttr);
}

/**
 * Mark a horizontal run of `count` cells starting at (x, y) as having flipped
 * highlight polarity (XOR with the window's `invertHighlight`). Use for cells
 * that need the opposite render mode from the rest of the window — e.g. the
 * BONUS box on the char-sheet (inverse) while STR labels in the same window
 * stay colored. Lazy-allocates `highlightInvertMask` on first use.
 */
export function setHighlightInvert(
  win: TileWindow,
  x: number,
  y: number,
  count: number,
): void {
  if (!win.highlightInvertMask) {
    win.highlightInvertMask = new Uint8Array(win.widthCells * win.heightCells);
  }
  for (let i = 0; i < count; i++) {
    const cx = x + i;
    if (cx < 0 || cx >= win.widthCells || y < 0 || y >= win.heightCells) continue;
    win.highlightInvertMask[y * win.widthCells + cx] = 1;
  }
}

/**
 * Render a tile window into an RGBA destination buffer at the window's
 * screen position. Each cell is rendered as one 8×8 tile from the wfont
 * file selected by the attribute byte's low nibble.
 */
export function renderTileWindow(
  win: TileWindow,
  destRgba: Uint8ClampedArray,
  destW: number,
  destH: number,
  fonts: FontSet,
  palette: Palette,
): void {
  for (let cy = 0; cy < win.heightCells; cy++) {
    for (let cx = 0; cx < win.widthCells; cx++) {
      const idx = (cy * win.widthCells + cx) * 2;
      const char = win.cells[idx]!;
      const attr = win.cells[idx + 1]!;
      const dx = win.screenX + cx * 8;
      const dy = win.screenY + cy * 8;
      const fontIdx = attr & 0x0f;

      if (fontIdx === 0) {
        // Per-cell inversion override XOR'd with the window default.
        const cellIdx = cy * win.widthCells + cx;
        const cellInverted = win.highlightInvertMask?.[cellIdx] ? true : false;
        const inverse = (win.invertHighlight ?? false) !== cellInverted;
        // HIGHLIGHT path — cell (char, attrParam<<4) blitted via wfont0 (1bpp).
        // Every cell with attr_lo=0 routes through here, including attr 0x00
        // itself: with colorIdx=0 both stroke and bg are palette[0]=black, so
        // the cell renders as a solid black tile (the engine's "empty" cell —
        // we never skip, every cell is a tile).
        //
        // The engine renders highlight cells two ways depending on the draw
        // routine's ega.drv slot, indistinguishable from the cell; the
        // `win.invertHighlight` flag selects which:
        //   normal  → stroke = palette[high nibble] (colour), bg = black
        //             (char-sheet: yellow STR labels, white values, …)
        //   inverse → stroke = black, bg = palette[high nibble]
        //             (menu selection cursor: black text on a yellow bar)
        // Verified vs the engine framebuffer (decode-screen of saves 1 & 3).
        if (!fonts.font0) continue;
        const colorIdx = (attr >> 4) & 0x0f;
        renderTextRun(
          destRgba,
          destW,
          destH,
          dx,
          dy,
          String.fromCharCode(char),
          fonts.font0,
          inverse ? 0 : colorIdx, // stroke
          palette,
          inverse ? colorIdx : 0, // bg
        );
        continue;
      }

      // NORMAL path — 4bpp tile blit from the attr-selected font.
      const font = pickFont(fontIdx, fonts);
      if (!font) continue;
      renderTextRun4bpp(
        destRgba,
        destW,
        destH,
        dx,
        dy,
        String.fromCharCode(char),
        font,
        palette,
      );
    }
  }
}

function pickFont(attrLowNibble: number, fonts: FontSet): Font4bpp | null | undefined {
  switch (attrLowNibble) {
    case 1:
      return fonts.font1;
    case 2:
      return fonts.font2;
    case 3:
      return fonts.font3;
    case 4:
      return fonts.font4;
    default:
      return null;
  }
}
