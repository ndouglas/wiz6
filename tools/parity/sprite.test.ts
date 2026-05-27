/**
 * sprite.test.ts — unit + integration tests for sprite-at-index helpers.
 *
 * Tests:
 *   1. renderFontGlyph(wfont1, 0x00) → all-black (solid fill tile)
 *   2. renderFontGlyph(wfont1, 0x01) → frame piece: contains light-gray AND black
 *   3. renderFontGlyph(wfont4, 0x20) → NOT all-black (ring sprite tile — regression anchor)
 *   4. Engine cross-check: extractCell from engine screen (16,16) → all-black;
 *      assertSpriteMatches(renderFontGlyph(wfont1, 0x00), cellRgba) ≥ 99%
 *
 * Run:
 *   cd tools/parity && npx vitest run sprite.test.ts
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Font4bppSchema, WIZ6_MAIN } from '../../packages/data/src/index.js';
import type { Font4bpp } from '../../packages/data/src/index.js';
import { readVgaBlob } from '../../packages/mcp/src/vga-palette.js';
import {
  renderFontGlyph,
  extractCell,
  assertSpriteMatches,
} from './sprite.js';

// ─── Path helpers ─────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = resolve(__dirname, '..', '..');

function findMainCheckoutRoot(): string {
  const gitFilePath = join(WORKTREE_ROOT, '.git');
  let gitContent: string;
  try {
    gitContent = readFileSync(gitFilePath, 'utf-8');
  } catch {
    return WORKTREE_ROOT;
  }
  const match = /gitdir:\s*(.+)/.exec(gitContent);
  if (!match) return WORKTREE_ROOT;
  const gitDir = match[1]!.trim();
  const dotGitDir = gitDir.replace(/\/worktrees\/[^/]+$/, '');
  return resolve(dotGitDir, '..');
}

const MAIN_ROOT = findMainCheckoutRoot();
const EXTRACTED_FONTS = join(MAIN_ROOT, 'extracted', 'fonts');

// ─── Font loaders ─────────────────────────────────────────────────────────────

function loadFont4bpp(name: string): Font4bpp {
  const json: unknown = JSON.parse(readFileSync(join(EXTRACTED_FONTS, `${name}.json`), 'utf-8'));
  return Font4bppSchema.parse(json);
}

// ─── Engine screen decoder (inline — same logic as decode-screen.ts) ─────────
//
// We inline the VGA decode logic here to avoid a top-level CLI dependency from
// the test. This is the same implementation used in screen-parity.test.ts.

const EGA_DEFAULT: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],       // 0  black
  [0, 0, 170],     // 1  blue
  [0, 170, 0],     // 2  green
  [0, 170, 170],   // 3  cyan
  [170, 0, 0],     // 4  red
  [170, 0, 170],   // 5  magenta
  [170, 85, 0],    // 6  brown
  [170, 170, 170], // 7  light gray
  [85, 85, 85],    // 8  dark gray
  [85, 85, 255],   // 9  bright blue
  [85, 255, 85],   // 10 bright green
  [85, 255, 255],  // 11 bright cyan
  [255, 85, 85],   // 12 bright red
  [255, 85, 255],  // 13 bright magenta
  [255, 255, 85],  // 14 yellow
  [255, 255, 255], // 15 white
];

const VRAM_OFFSET = 0x80000;
const DOSBOX_INTERNAL_START = 0x0810E0;
const DOSBOX_INTERNAL_END   = 0x08171F;
const VGA_STATE_START = 0x82F70;
const VGA_STATE_END   = 0x838CE;
const SCREEN_W = 320;
const SCREEN_H = 200;

function decodeEngineScreen(savePath: string): Uint8Array {
  const blob = readVgaBlob(savePath);
  const rgba = new Uint8Array(SCREEN_W * SCREEN_H * 4);
  for (let y = 0; y < SCREEN_H; y++) {
    for (let x = 0; x < SCREEN_W; x++) {
      const vgaAddr = y * 40 + (x >> 3);
      const blobBase = VRAM_OFFSET + vgaAddr * 4;
      let pixelIndex: number;
      if (
        (blobBase >= DOSBOX_INTERNAL_START && blobBase <= DOSBOX_INTERNAL_END) ||
        (blobBase >= VGA_STATE_START && blobBase <= VGA_STATE_END)
      ) {
        pixelIndex = 0;
      } else {
        const b0 = blob[blobBase]!;
        const b1 = blob[blobBase + 1]!;
        const b2 = blob[blobBase + 2]!;
        const b3 = blob[blobBase + 3]!;
        const bit = 7 - (x & 7);
        pixelIndex =
          ((b0 >> bit) & 1) |
          (((b1 >> bit) & 1) << 1) |
          (((b2 >> bit) & 1) << 2) |
          (((b3 >> bit) & 1) << 3);
      }
      const [r, g, b] = EGA_DEFAULT[pixelIndex]!;
      const off = (y * SCREEN_W + x) * 4;
      rgba[off] = r;
      rgba[off + 1] = g;
      rgba[off + 2] = b;
      rgba[off + 3] = 0xff;
    }
  }
  return rgba;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isBlackPixel(rgba: Uint8ClampedArray | Uint8Array, offset: number): boolean {
  return rgba[offset] === 0 && rgba[offset + 1] === 0 && rgba[offset + 2] === 0;
}

function allPixelsBlack(rgba: Uint8ClampedArray | Uint8Array): boolean {
  for (let i = 0; i < rgba.length; i += 4) {
    if (!isBlackPixel(rgba, i)) return false;
  }
  return true;
}

function hasColor(rgba: Uint8ClampedArray, r: number, g: number, b: number): boolean {
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i] === r && rgba[i + 1] === g && rgba[i + 2] === b) return true;
  }
  return false;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('renderFontGlyph', () => {
  /**
   * Test 1: wfont1 glyph 0x00 = solid-black fill tile.
   *
   * Per wpcmk-window-chrome.json (finding "black-fill-char"):
   * ui_window_clear fills all window cells with (char=0x00, attr=0x01=wfont1).
   * wfont1 glyph 0x00 should be all-black — the interior fill tile.
   */
  it('wfont1 glyph 0x00 is all-black (solid fill tile)', () => {
    const wfont1 = loadFont4bpp('wfont1');
    const { rgba } = renderFontGlyph(wfont1, 0x00, WIZ6_MAIN);
    expect(rgba).toHaveLength(8 * 8 * 4);
    expect(allPixelsBlack(rgba)).toBe(true);
  });

  /**
   * Test 2: wfont1 glyph 0x01 = top-left frame corner.
   *
   * Per wpcmk-window-chrome.json (finding "frame-chars-identified"):
   * glyph 0x01 = top-left corner, drawn as light-gray lines on black background.
   * The frame line color is palette color 9 = RGB(170, 170, 170) in WIZ6_MAIN.
   * Background = color 0 or 8 = both black = RGB(0, 0, 0).
   *
   * A frame piece must: contain light-gray (170,170,170) AND some black.
   */
  it('wfont1 glyph 0x01 contains light-gray and black (frame corner piece)', () => {
    const wfont1 = loadFont4bpp('wfont1');
    const { rgba } = renderFontGlyph(wfont1, 0x01, WIZ6_MAIN);
    expect(rgba).toHaveLength(8 * 8 * 4);

    // Must have light-gray pixels (the frame line)
    const hasLightGray = hasColor(rgba, 170, 170, 170);
    expect(hasLightGray).toBe(true);

    // Must have black pixels (background behind the frame line)
    const hasBlack = hasColor(rgba, 0, 0, 0);
    expect(hasBlack).toBe(true);

    // Must NOT be all-black (this is a visible frame piece, not just fill)
    expect(allPixelsBlack(rgba)).toBe(false);
  });

  /**
   * Test 3: wfont4 glyph 0x20 = the "ring sprite" tile — NOT all-black.
   *
   * This is the regression anchor for the original bug where the viewport fill
   * used wfont4/0x20 instead of wfont1/0x00, creating visible ring artifacts
   * instead of a solid black interior.
   *
   * wfont4 glyph 0x20 has 21 non-zero bytes (verified from raw font JSON),
   * meaning it encodes a real sprite, not a blank fill tile.
   */
  it('wfont4 glyph 0x20 is NOT all-black (ring sprite tile — regression anchor)', () => {
    const wfont4 = loadFont4bpp('wfont4');
    const { rgba } = renderFontGlyph(wfont4, 0x20, WIZ6_MAIN);
    expect(rgba).toHaveLength(8 * 8 * 4);

    // This is the key regression check: wfont4/0x20 must NOT be all-black.
    // If it were, it would be usable as a fill tile (and the original bug
    // would have been invisible). Its non-black content is what made the
    // bug manifest as visible ring sprites in the window interior.
    expect(allPixelsBlack(rgba)).toBe(false);
  });
});

/**
 * Engine cross-check: extractCell + assertSpriteMatches.
 *
 * The pixel at (16,16) in save 1 is inside the top window interior at a
 * cell boundary. Per decode-screen.ts analysis, rows 8-48 contain ZERO noisy
 * pixels — only black (0,0,0), dark-gray (85,85,85), or light-gray (170,170,170).
 * The top-window interior cells are filled with wfont1/0x00 (all-black), so
 * the cell at pixel (16,16) — which maps to window tile (2,2) — is all-black
 * in the engine's rendered screen.
 *
 * This test demonstrates the "get the sprite the engine drew at index X and
 * confirm ours matches" loop-closing pattern:
 *   1. Decode engine screen from save state.
 *   2. extractCell at a known tile boundary.
 *   3. Render our glyph.
 *   4. assertSpriteMatches → ≥ 99% (should be 100%).
 */
describe('engine cross-check: extractCell + assertSpriteMatches', () => {
  it(
    'engine cell at (16,16) in save 1 is all-black and matches renderFontGlyph(wfont1, 0x00)',
    () => {
      const savePath = join(WORKTREE_ROOT, 'tools', 'dosbox', 'save', '1.sav');
      const engineScreen = decodeEngineScreen(savePath);

      // Extract the 8×8 cell at pixel (16,16) from the engine screen.
      // This is inside the top window interior (rows 8-48 are clean black),
      // well above the rows 27-36 contamination range.
      const cellRgba = extractCell(engineScreen, SCREEN_W, 16, 16);
      expect(cellRgba).toHaveLength(8 * 8 * 4);

      // The engine's actual cell at (16,16) must be all-black.
      expect(allPixelsBlack(cellRgba)).toBe(true);

      // Our rendered wfont1/0x00 glyph should match the engine cell exactly.
      const wfont1 = loadFont4bpp('wfont1');
      const ourGlyph = renderFontGlyph(wfont1, 0x00, WIZ6_MAIN);

      // Use tolerance=0 since both buffers should be identical (pure black).
      // Both our rendered glyph and the engine cell are all-black, so we expect 100%.
      const result = assertSpriteMatches(ourGlyph.rgba, cellRgba, { tolerance: 0 }, 99);
      expect(result.match).toBe(true);
      expect(result.matchPct).toBeGreaterThanOrEqual(99);
      console.log(`  engine-cell cross-check: ${result.matchPct.toFixed(1)}% match (cell at 16,16 vs wfont1/0x00)`);
    },
    15_000, // allow 15s for VGA blob parse
  );
});
