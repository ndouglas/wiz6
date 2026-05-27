/**
 * Menu-highlight helpers for wpcmk creation screens.
 *
 * The engine's highlight render path (ega.drv slot 1, invoked via the
 * `ui_window_putchar_highlight` thunk at wroot image 0x22B7) stores cells
 * with a specific attr byte encoding:
 *
 *   cell attr byte = (|originalAttr| & 0x0F) << 4
 *
 * Detection invariant (used by renderTileWindow):
 *   (attr & 0x0F) === 0 AND attr !== 0
 *
 * Render formula (from renderTileWindow's highlight branch):
 *   stroke pixels  → palette[0]          (always black in WIZ6_MAIN)
 *   bg pixels      → palette[attr >> 4]  (the bgPaletteIdx in the high nibble)
 *
 * For the wpcmk selected-row cursor, the engine uses attr=-5 which resolves to
 * bgPaletteIdx=5 → WIZ6_MAIN palette[5] = (255, 255, 85) bright yellow.
 *
 * Reference:
 *   - packages/parser/src/ui/tile-window.ts (renderTileWindow highlight branch)
 *   - docs/re/findings/menu-cursor-render-path.json
 *   - docs/re/findings/wfont-highlight-render.json
 */

import { puts, setCursor, type TileWindow } from '@wiz6/parser';

// ---------------------------------------------------------------------------
// highlightAttr — pure encoding helper
// ---------------------------------------------------------------------------

/**
 * Compute the attr byte that encodes a highlight cell for the given background
 * palette index.
 *
 * Engine encoding: `(bgPaletteIdx & 0x0F) << 4`
 *   - Low nibble = 0  → triggers the highlight path in renderTileWindow
 *   - High nibble = bgPaletteIdx → selects the background palette entry
 *
 * Valid bgPaletteIdx range: 1..15 (0 would produce 0x00 = empty/skip cell).
 */
export function highlightAttr(bgPaletteIdx: number): number {
  return ((bgPaletteIdx & 0x0f) << 4) & 0xff;
}

// ---------------------------------------------------------------------------
// putHighlighted — write text with highlight attr encoding
// ---------------------------------------------------------------------------

export interface PutHighlightedOpts {
  /** Background palette index (1..15). Maps to the attr HIGH nibble. */
  bgPaletteIdx: number;
}

/**
 * Write `text` at the window's current cursor position using the highlight
 * attr encoding — equivalent to the engine's `ui_window_puts_highlight`
 * (wroot image 0x24E9) called with |attr| = bgPaletteIdx.
 *
 * Each cell's attr byte is set to `highlightAttr(bgPaletteIdx)`:
 *   - Low nibble = 0  → renderer takes the highlight path (uses wfont0 1bpp)
 *   - High nibble = bgPaletteIdx → background color index
 *
 * The cursor advances by `text.length` cells (wrapping at window boundaries),
 * exactly as `puts` does.
 */
export function putHighlighted(
  win: TileWindow,
  text: string,
  opts: PutHighlightedOpts,
): void {
  puts(win, text, highlightAttr(opts.bgPaletteIdx));
}

// ---------------------------------------------------------------------------
// highlightRow — re-attr an existing row to the highlight encoding
// ---------------------------------------------------------------------------

/**
 * Re-attr every cell in `row` (0-indexed) of `win` to the highlight encoding
 * for `bgPaletteIdx`. Char bytes are left unchanged.
 *
 * Use this when a row has already been written with normal text (e.g. via
 * `puts(..., 3)`) and you want to apply the highlight look in a second pass —
 * matching the engine's cursor-move pattern where the cursor row is re-rendered
 * by calling `ui_window_putchar_highlight` over the existing text.
 */
export function highlightRow(win: TileWindow, row: number, bgPaletteIdx: number): void {
  const attr = highlightAttr(bgPaletteIdx);
  for (let cx = 0; cx < win.widthCells; cx++) {
    const idx = (row * win.widthCells + cx) * 2;
    // Leave char byte (idx+0) unchanged; update attr byte (idx+1).
    win.cells[idx + 1] = attr;
  }
}

/**
 * Re-attr a horizontal RANGE of cells (`x` .. `x+len-1`) on `row` to the
 * highlight encoding for `bgPaletteIdx`. Char bytes are left unchanged.
 *
 * This is the menu-cursor highlight: the engine re-renders the selected
 * option's label string via the per-char highlight path (attr = bgPaletteIdx
 * << 4), producing black glyphs on a `bgPaletteIdx` background. For the wpcmk
 * roster menu the cursor uses bgPaletteIdx=5 → yellow (verified byte-exact vs
 * save 3, where REVIEW PC's cells carry attr 0x50).
 */
export function highlightRange(
  win: TileWindow,
  x: number,
  row: number,
  len: number,
  bgPaletteIdx: number,
): void {
  const attr = highlightAttr(bgPaletteIdx);
  for (let cx = x; cx < x + len && cx < win.widthCells; cx++) {
    win.cells[(row * win.widthCells + cx) * 2 + 1] = attr;
  }
}
