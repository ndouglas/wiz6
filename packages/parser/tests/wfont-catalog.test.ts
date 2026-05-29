/**
 * wfont-catalog.test.ts — assert that critical chrome glyphs have the
 * expected pixel pattern.
 *
 * These tiles are load-bearing for screen ports (banner bars, scrollbars,
 * border lines, status row). If the font asset is ever regenerated or
 * corrupted, these tests catch it before a parity test fails 1000 px
 * later.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const FONTS_DIR = join(REPO_ROOT, 'extracted', 'fonts');

function decodeGlyph(bytes: ArrayLike<number>): number[][] {
  const out: number[][] = [];
  for (let row = 0; row < 8; row++) {
    const pG = bytes[row] ?? 0, pB = bytes[8 + row] ?? 0, pR = bytes[16 + row] ?? 0, pI = bytes[24 + row] ?? 0;
    const cells: number[] = [];
    for (let col = 0; col < 8; col++) {
      const bit = 7 - col;
      cells.push(((pG >> bit) & 1) | (((pB >> bit) & 1) << 1) | (((pR >> bit) & 1) << 2) | (((pI >> bit) & 1) << 3));
    }
    out.push(cells);
  }
  return out;
}

function loadFont(name: string) {
  return JSON.parse(readFileSync(join(FONTS_DIR, `${name}.json`), 'utf-8'));
}

// Expected patterns. Each is the 8×8 grid of palette indices.
const PATTERNS = {
  'wfont3 0x5f banner-bar (black top + gray middle + black bottom)': {
    font: 'wfont3', char: 0x5f,
    grid: [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
  'wfont3 0x1d banner-bar + right-edge (used at cell 19 row 18)': {
    font: 'wfont3', char: 0x1d,
    grid: [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
  'wfont3 0x1e status-row underline (gray + black bottom only)': {
    font: 'wfont3', char: 0x1e,
    grid: [
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
  'wfont1 0x23 top-edge-only (used at cells 20-39 row 18)': {
    font: 'wfont1', char: 0x23,
    grid: [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
    ],
  },
  'wfont1 0x1c right-edge vertical line (used at cell 19 rows 19-23)': {
    font: 'wfont1', char: 0x1c,
    grid: [
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
    ],
  },
  'wfont1 0x1f bottom-right L-corner (used at cell (19, 24))': {
    font: 'wfont1', char: 0x1f,
    grid: [
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
};

describe('wfont chrome-tile catalog', () => {
  for (const [name, spec] of Object.entries(PATTERNS)) {
    it(`${name}`, () => {
      const font = loadFont(spec.font);
      const bytes = font.glyphs[spec.char];
      expect(bytes, `glyph 0x${spec.char.toString(16)} missing from ${spec.font}`).toBeDefined();
      expect(decodeGlyph(bytes)).toEqual(spec.grid);
    });
  }
});
