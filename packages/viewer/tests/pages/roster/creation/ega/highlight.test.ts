// packages/viewer/tests/pages/roster/creation/ega/highlight.test.ts
//
// Tests for the creation menu-highlight helpers:
//   putHighlighted(win, text, opts)   — write text with highlight attr encoding
//   highlightRow(win, row, bgAttr)    — re-attr an existing row to highlighted
//
// Highlight attr encoding (from renderTileWindow's highlight branch in
// packages/parser/src/ui/tile-window.ts and confirmed by
// docs/re/findings/menu-cursor-render-path.json):
//
//   cell attr byte = (|bgAttr| & 0x0F) << 4
//   Detection invariant: (attr & 0x0F) === 0 AND attr !== 0
//   Render: stroke -> palette[0] (black), bg -> palette[attr >> 4]
//
// The engine stores `(originalAttr & 0x0F) << 4` in the attr byte.
// Low nibble = 0 signals the highlight path. High nibble = bg palette index.
//
// Integration test: render a window with one normal row and one highlighted
// row via renderCreationFrame; assert the highlighted frame's RGBA hash
// DIFFERS from the same window with that row NOT highlighted.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FontSchema, Font4bppSchema } from '@wiz6/data';
import type { Font, Font4bpp } from '@wiz6/data';
import { createTileWindow, puts, setCursor } from '@wiz6/parser';
import type { TileWindow } from '@wiz6/parser';
import {
  loadCreationFontSet,
  WIZ6_MAIN,
} from '../../../../../src/pages/roster/creation/ega/assets.js';
import {
  putHighlighted,
  highlightRow,
  highlightAttr,
} from '../../../../../src/pages/roster/creation/ega/highlight.js';
import { renderCreationFrame } from '../../../../../src/pages/roster/creation/ega/render-frame.js';

// ---------------------------------------------------------------------------
// Disk-font loader (same pattern as assets.test.ts / render-frame.test.ts)
// ---------------------------------------------------------------------------

function findMainCheckoutRoot(): string {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const worktreeRoot = resolve(testDir, '../../../../../../..');
  const gitFilePath = join(worktreeRoot, '.git');
  let gitContent: string;
  try {
    gitContent = readFileSync(gitFilePath, 'utf-8');
  } catch {
    return worktreeRoot;
  }
  const match = /gitdir:\s*(.+)/.exec(gitContent);
  if (!match) return worktreeRoot;
  const gitDir = match[1]!.trim();
  const dotGitDir = gitDir.replace(/\/worktrees\/[^/]+$/, '');
  return resolve(dotGitDir, '..');
}

const MAIN_ROOT = findMainCheckoutRoot();
const EXTRACTED_FONTS = join(MAIN_ROOT, 'extracted', 'fonts');

async function diskLoadFont(url: string): Promise<Font> {
  const filename = url.replace(/^\/fonts\//, '');
  const json: unknown = JSON.parse(readFileSync(join(EXTRACTED_FONTS, filename), 'utf-8'));
  return FontSchema.parse(json);
}

async function diskLoadFont4bpp(url: string): Promise<Font4bpp> {
  const filename = url.replace(/^\/fonts\//, '');
  const json: unknown = JSON.parse(readFileSync(join(EXTRACTED_FONTS, filename), 'utf-8'));
  return Font4bppSchema.parse(json);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256hex(buf: Uint8ClampedArray): string {
  return createHash('sha256').update(Buffer.from(buf)).digest('hex');
}

/** Create a small 10×4 window for unit tests. */
function makeSmallWindow(): TileWindow {
  return createTileWindow({ screenX: 0, screenY: 0, widthCells: 10, heightCells: 4 });
}

// ---------------------------------------------------------------------------
// highlightAttr — pure encoding helper
// ---------------------------------------------------------------------------

describe('highlightAttr', () => {
  it('returns (bgPaletteIdx & 0x0F) << 4 for attr=5', () => {
    // Engine encoding: (|attr| & 0x0F) << 4. Low nibble = 0 triggers highlight path.
    expect(highlightAttr(5)).toBe(0x50);
  });

  it('returns 0x10 for bgPaletteIdx=1', () => {
    expect(highlightAttr(1)).toBe(0x10);
  });

  it('returns 0xf0 for bgPaletteIdx=15', () => {
    expect(highlightAttr(15)).toBe(0xf0);
  });

  it('low nibble is always 0 (highlight path detection invariant)', () => {
    for (let i = 1; i <= 15; i++) {
      expect(highlightAttr(i) & 0x0f).toBe(0);
    }
  });

  it('result is non-zero for any bgPaletteIdx in 1..15 (not an empty cell)', () => {
    for (let i = 1; i <= 15; i++) {
      expect(highlightAttr(i)).not.toBe(0);
    }
  });

  it('high nibble equals bgPaletteIdx for values 1..15', () => {
    for (let i = 1; i <= 15; i++) {
      expect((highlightAttr(i) >> 4) & 0x0f).toBe(i);
    }
  });
});

// ---------------------------------------------------------------------------
// putHighlighted — writes text with highlight attr encoding
// ---------------------------------------------------------------------------

describe('putHighlighted', () => {
  it('writes the correct number of cells for the given text', () => {
    const win = makeSmallWindow();
    putHighlighted(win, 'NINJA', { bgPaletteIdx: 5 });
    // Cells 0-4 should be written (5 chars = 5 cells)
    for (let i = 0; i < 5; i++) {
      const charByte = win.cells[i * 2]!;
      expect(charByte).toBe('NINJA'.charCodeAt(i));
    }
  });

  it('attr byte has low nibble = 0 (highlight detection invariant)', () => {
    const win = makeSmallWindow();
    putHighlighted(win, 'NINJA', { bgPaletteIdx: 5 });
    for (let i = 0; i < 5; i++) {
      const attr = win.cells[i * 2 + 1]!;
      expect(attr & 0x0f).toBe(0);
    }
  });

  it('attr byte is non-zero (not an empty cell)', () => {
    const win = makeSmallWindow();
    putHighlighted(win, 'NINJA', { bgPaletteIdx: 5 });
    for (let i = 0; i < 5; i++) {
      const attr = win.cells[i * 2 + 1]!;
      expect(attr).not.toBe(0);
    }
  });

  it('attr high nibble equals bgPaletteIdx', () => {
    const win = makeSmallWindow();
    putHighlighted(win, 'NINJA', { bgPaletteIdx: 5 });
    for (let i = 0; i < 5; i++) {
      const attr = win.cells[i * 2 + 1]!;
      expect((attr >> 4) & 0x0f).toBe(5);
    }
  });

  it('attr byte equals highlightAttr(bgPaletteIdx)', () => {
    const win = makeSmallWindow();
    putHighlighted(win, 'NINJA', { bgPaletteIdx: 7 });
    for (let i = 0; i < 5; i++) {
      const attr = win.cells[i * 2 + 1]!;
      expect(attr).toBe(highlightAttr(7));
    }
  });

  it('advances the cursor past the written text', () => {
    const win = makeSmallWindow();
    win.cursorX = 0;
    win.cursorY = 0;
    putHighlighted(win, 'NINJA', { bgPaletteIdx: 5 });
    // Cursor should be at position 5 (past the 5 written chars)
    expect(win.cursorX).toBe(5);
    expect(win.cursorY).toBe(0);
  });

  it('works with bgPaletteIdx=1 (white on black variant)', () => {
    const win = makeSmallWindow();
    putHighlighted(win, 'A', { bgPaletteIdx: 1 });
    expect(win.cells[1]).toBe(0x10); // (1 & 0x0F) << 4 = 0x10
    expect(win.cells[1]! & 0x0f).toBe(0); // low nibble = 0
    expect(win.cells[1]).not.toBe(0); // non-zero
  });

  it('works with bgPaletteIdx=14 (green)', () => {
    const win = makeSmallWindow();
    putHighlighted(win, 'X', { bgPaletteIdx: 14 });
    expect(win.cells[1]).toBe(0xe0);
    expect((win.cells[1]! >> 4) & 0x0f).toBe(14);
  });

  it('respects a pre-set cursor position', () => {
    const win = makeSmallWindow();
    setCursor(win, 2, 1);
    putHighlighted(win, 'HI', { bgPaletteIdx: 5 });
    // Row 1, cols 2 and 3
    const base = (1 * 10 + 2) * 2;
    expect(win.cells[base]!).toBe('H'.charCodeAt(0));
    expect(win.cells[base + 1]!).toBe(highlightAttr(5));
    expect(win.cells[base + 2]!).toBe('I'.charCodeAt(0));
    expect(win.cells[base + 3]!).toBe(highlightAttr(5));
  });
});

// ---------------------------------------------------------------------------
// highlightRow — re-attrs an existing row
// ---------------------------------------------------------------------------

describe('highlightRow', () => {
  it('re-attrs all cells in the target row to the highlight encoding', () => {
    const win = makeSmallWindow();
    // Write normal text first (attr=3, wfont3 path)
    setCursor(win, 0, 1);
    puts(win, 'HELLO     ', 3); // fill row 1 (10 chars)
    // Now highlight it
    highlightRow(win, 1, 5);
    for (let cx = 0; cx < win.widthCells; cx++) {
      const idx = (1 * win.widthCells + cx) * 2;
      const attr = win.cells[idx + 1]!;
      expect(attr & 0x0f).toBe(0);        // low nibble = 0
      expect(attr).not.toBe(0);           // non-zero
      expect((attr >> 4) & 0x0f).toBe(5); // high nibble = bgPaletteIdx
    }
  });

  it('does not change the char bytes in the target row', () => {
    const win = makeSmallWindow();
    setCursor(win, 0, 2);
    puts(win, 'ABCDEFGHIJ', 3);
    // Capture original chars before highlight
    const chars: number[] = [];
    for (let cx = 0; cx < win.widthCells; cx++) {
      chars.push(win.cells[(2 * win.widthCells + cx) * 2]!);
    }
    highlightRow(win, 2, 5);
    for (let cx = 0; cx < win.widthCells; cx++) {
      const idx = (2 * win.widthCells + cx) * 2;
      expect(win.cells[idx]).toBe(chars[cx]);
    }
  });

  it('does not affect cells in other rows', () => {
    const win = makeSmallWindow();
    setCursor(win, 0, 0);
    puts(win, 'AAAAAAAAAA', 3); // row 0
    setCursor(win, 0, 1);
    puts(win, 'BBBBBBBBBB', 3); // row 1
    setCursor(win, 0, 2);
    puts(win, 'CCCCCCCCCC', 3); // row 2

    highlightRow(win, 1, 5); // highlight only row 1

    // Row 0 attrs unchanged (attr=3)
    for (let cx = 0; cx < win.widthCells; cx++) {
      expect(win.cells[(0 * win.widthCells + cx) * 2 + 1]).toBe(3);
    }
    // Row 2 attrs unchanged (attr=3)
    for (let cx = 0; cx < win.widthCells; cx++) {
      expect(win.cells[(2 * win.widthCells + cx) * 2 + 1]).toBe(3);
    }
  });

  it('sets attr byte to highlightAttr(bgPaletteIdx) for bgPaletteIdx=14', () => {
    const win = makeSmallWindow();
    highlightRow(win, 0, 14);
    for (let cx = 0; cx < win.widthCells; cx++) {
      expect(win.cells[(0 * win.widthCells + cx) * 2 + 1]).toBe(highlightAttr(14));
    }
  });
});

// ---------------------------------------------------------------------------
// Integration: highlighted row renders differently than non-highlighted
// ---------------------------------------------------------------------------

describe('highlight integration with renderCreationFrame', () => {
  it('highlighted row produces a different RGBA hash than non-highlighted', async () => {
    const fontSet = await loadCreationFontSet({
      loadFont: diskLoadFont,
      loadFont4bpp: diskLoadFont4bpp,
    });

    // Window A: one row written normally (wfont3 path)
    const winA = createTileWindow({ screenX: 0, screenY: 0, widthCells: 19, heightCells: 13 });
    setCursor(winA, 0, 2);
    puts(winA, 'NINJA      RACE    ', 3);

    // Window B: same text on row 2, but highlighted
    const winB = createTileWindow({ screenX: 0, screenY: 0, widthCells: 19, heightCells: 13 });
    setCursor(winB, 0, 2);
    putHighlighted(winB, 'NINJA      RACE    ', { bgPaletteIdx: 5 });

    const rgbaA = renderCreationFrame([winA], fontSet, WIZ6_MAIN);
    const rgbaB = renderCreationFrame([winB], fontSet, WIZ6_MAIN);

    expect(sha256hex(rgbaA)).not.toBe(sha256hex(rgbaB));
  });

  it('highlightRow produces same RGBA as putHighlighted on same text', async () => {
    const fontSet = await loadCreationFontSet({
      loadFont: diskLoadFont,
      loadFont4bpp: diskLoadFont4bpp,
    });

    // Window A: putHighlighted to write directly
    const winA = createTileWindow({ screenX: 0, screenY: 0, widthCells: 10, heightCells: 4 });
    setCursor(winA, 0, 1);
    putHighlighted(winA, 'ABCDEFGHIJ', { bgPaletteIdx: 5 });

    // Window B: write normal text first, then highlightRow to re-attr
    const winB = createTileWindow({ screenX: 0, screenY: 0, widthCells: 10, heightCells: 4 });
    setCursor(winB, 0, 1);
    puts(winB, 'ABCDEFGHIJ', 3); // normal attr
    highlightRow(winB, 1, 5);    // re-attr to highlight

    const rgbaA = renderCreationFrame([winA], fontSet, WIZ6_MAIN);
    const rgbaB = renderCreationFrame([winB], fontSet, WIZ6_MAIN);

    // Both produce the same highlight attr encoding, so RGBA should match.
    expect(sha256hex(rgbaA)).toBe(sha256hex(rgbaB));
  });
});
