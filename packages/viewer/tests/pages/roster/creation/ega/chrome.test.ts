// packages/viewer/tests/pages/roster/creation/ega/chrome.test.ts
//
// Tests for drawWindowChrome() — fills a TileWindow with black interior and
// gray frame, matching wpcmk's FUN_06af chrome rendering.
//
// RE source: docs/re/findings/wpcmk-window-chrome.json
//
// Chrome spec:
//   - All cells filled with (char=0x00, attr=0x01) — wfont1 solid black tile
//   - Top-left corner:     (0x01, 0x01)
//   - Horizontal top edge: (0x02, 0x01)
//   - Top-right corner:    (0x03, 0x01)
//   - Left vertical edge:  (0x04, 0x01)
//   - Right vertical edge: (0x05, 0x01)
//   - Bottom-left corner:  (0x06, 0x01)
//   - Horizontal bot edge: (0x07, 0x01)
//   - Bottom-right corner: (0x08, 0x01)

import { describe, expect, it, beforeEach } from 'vitest';
import { createTileWindow } from '@wiz6/parser';
import type { TileWindow } from '@wiz6/parser';
import { drawWindowChrome } from '../../../../../src/pages/roster/creation/ega/chrome.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCell(win: TileWindow, x: number, y: number): { char: number; attr: number } {
  const idx = (y * win.widthCells + x) * 2;
  return { char: win.cells[idx]!, attr: win.cells[idx + 1]! };
}

// ---------------------------------------------------------------------------
// Tests: standard window (≥2 cells wide, ≥2 cells tall)
// ---------------------------------------------------------------------------

describe('drawWindowChrome', () => {
  let win: TileWindow;

  beforeEach(() => {
    // 5×4 window (wide enough for corners + at least 1 interior fill)
    win = createTileWindow({ screenX: 0, screenY: 0, widthCells: 5, heightCells: 4 });
    // Pre-fill with garbage to confirm chrome overwrites everything
    win.cells.fill(0xcc);
    drawWindowChrome(win);
  });

  // --- Fill cells ---
  it('interior cells have char=0x00 and attr=0x01 (solid black fill)', () => {
    // Interior = rows 1..(h-2), cols 1..(w-2)
    for (let y = 1; y < win.heightCells - 1; y++) {
      for (let x = 1; x < win.widthCells - 1; x++) {
        const cell = getCell(win, x, y);
        expect(cell.char).toBe(0x00);
        expect(cell.attr).toBe(0x01);
      }
    }
  });

  // --- Corners ---
  it('top-left corner has char=0x01, attr=0x01', () => {
    expect(getCell(win, 0, 0)).toEqual({ char: 0x01, attr: 0x01 });
  });

  it('top-right corner has char=0x03, attr=0x01', () => {
    expect(getCell(win, win.widthCells - 1, 0)).toEqual({ char: 0x03, attr: 0x01 });
  });

  it('bottom-left corner has char=0x06, attr=0x01', () => {
    expect(getCell(win, 0, win.heightCells - 1)).toEqual({ char: 0x06, attr: 0x01 });
  });

  it('bottom-right corner has char=0x08, attr=0x01', () => {
    expect(getCell(win, win.widthCells - 1, win.heightCells - 1)).toEqual({
      char: 0x08,
      attr: 0x01,
    });
  });

  // --- Top horizontal edge ---
  it('top edge (row 0, cols 1..w-2) has char=0x02, attr=0x01', () => {
    for (let x = 1; x < win.widthCells - 1; x++) {
      const cell = getCell(win, x, 0);
      expect(cell.char).toBe(0x02);
      expect(cell.attr).toBe(0x01);
    }
  });

  // --- Bottom horizontal edge ---
  it('bottom edge (last row, cols 1..w-2) has char=0x07, attr=0x01', () => {
    for (let x = 1; x < win.widthCells - 1; x++) {
      const cell = getCell(win, x, win.heightCells - 1);
      expect(cell.char).toBe(0x07);
      expect(cell.attr).toBe(0x01);
    }
  });

  // --- Left vertical edge ---
  it('left edge (col 0, rows 1..h-2) has char=0x04, attr=0x01', () => {
    for (let y = 1; y < win.heightCells - 1; y++) {
      const cell = getCell(win, 0, y);
      expect(cell.char).toBe(0x04);
      expect(cell.attr).toBe(0x01);
    }
  });

  // --- Right vertical edge ---
  it('right edge (col w-1, rows 1..h-2) has char=0x05, attr=0x01', () => {
    for (let y = 1; y < win.heightCells - 1; y++) {
      const cell = getCell(win, win.widthCells - 1, y);
      expect(cell.char).toBe(0x05);
      expect(cell.attr).toBe(0x01);
    }
  });

  // --- All cells use attr=0x01 ---
  it('every cell has attr=0x01 (wfont1)', () => {
    for (let i = 1; i < win.cells.length; i += 2) {
      expect(win.cells[i]).toBe(0x01);
    }
  });

  // --- Larger window: 40×20 (the main wpcmk top window) ---
  it('works on 40×20 window (top panel size)', () => {
    const big = createTileWindow({ screenX: 0, screenY: 0, widthCells: 40, heightCells: 20 });
    drawWindowChrome(big);

    // Corners
    expect(getCell(big, 0, 0)).toEqual({ char: 0x01, attr: 0x01 });
    expect(getCell(big, 39, 0)).toEqual({ char: 0x03, attr: 0x01 });
    expect(getCell(big, 0, 19)).toEqual({ char: 0x06, attr: 0x01 });
    expect(getCell(big, 39, 19)).toEqual({ char: 0x08, attr: 0x01 });

    // A sample interior cell
    expect(getCell(big, 20, 10)).toEqual({ char: 0x00, attr: 0x01 });

    // A sample top edge cell
    expect(getCell(big, 5, 0)).toEqual({ char: 0x02, attr: 0x01 });
    // A sample left edge cell
    expect(getCell(big, 0, 5)).toEqual({ char: 0x04, attr: 0x01 });
  });
});

// ---------------------------------------------------------------------------
// Edge cases: degenerate window sizes
// ---------------------------------------------------------------------------

describe('drawWindowChrome — edge cases', () => {
  it('1×1 window: single cell gets top-left corner char', () => {
    const win = createTileWindow({ screenX: 0, screenY: 0, widthCells: 1, heightCells: 1 });
    drawWindowChrome(win);
    expect(getCell(win, 0, 0)).toEqual({ char: 0x01, attr: 0x01 });
  });

  it('2×2 window: all four cells are corners', () => {
    const win = createTileWindow({ screenX: 0, screenY: 0, widthCells: 2, heightCells: 2 });
    drawWindowChrome(win);
    expect(getCell(win, 0, 0)).toEqual({ char: 0x01, attr: 0x01 }); // TL
    expect(getCell(win, 1, 0)).toEqual({ char: 0x03, attr: 0x01 }); // TR
    expect(getCell(win, 0, 1)).toEqual({ char: 0x06, attr: 0x01 }); // BL
    expect(getCell(win, 1, 1)).toEqual({ char: 0x08, attr: 0x01 }); // BR
  });

  it('1×3 window: only left-vert and right-vert on middle row (no interior)', () => {
    // 1 cell wide: col 0 = col w-1, so top-left wins for row 0, bottom-left for row 2
    const win = createTileWindow({ screenX: 0, screenY: 0, widthCells: 1, heightCells: 3 });
    drawWindowChrome(win);
    // With width=1 there are no edge cells between corners (no horiz edge range 1..w-2)
    // The corners are at (0,0), (0,0) for top (overlaps — TL is drawn last or first)
    // Engine doesn't hit this in practice; just verify no crash + attr=0x01 throughout
    for (let i = 1; i < win.cells.length; i += 2) {
      expect(win.cells[i]).toBe(0x01);
    }
  });

  it('3×1 window: only horiz-top and horiz-bottom on middle col (no interior)', () => {
    const win = createTileWindow({ screenX: 0, screenY: 0, widthCells: 3, heightCells: 1 });
    drawWindowChrome(win);
    // With height=1 there are no vert edge rows 1..h-2
    // Verify corners + no crash + attr=0x01 throughout
    expect(getCell(win, 0, 0)).toEqual({ char: 0x01, attr: 0x01 }); // TL (last written for col 0)
    for (let i = 1; i < win.cells.length; i += 2) {
      expect(win.cells[i]).toBe(0x01);
    }
  });
});
