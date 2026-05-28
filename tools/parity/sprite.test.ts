/**
 * sprite.test.ts — unit + integration tests for sprite-at-index helpers.
 *
 * Tests (hermetic — read only committed extracted/fonts):
 *   1. renderFontGlyph(wfont1, 0x00) → all-black (solid fill tile)
 *   2. renderFontGlyph(wfont1, 0x01) → frame piece: contains light-gray AND black
 *   3. renderFontGlyph(wfont4, 0x20) → NOT all-black (ring sprite tile — regression anchor)
 *
 * Run:
 *   pnpm --filter @wiz6/parity test
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Font4bppSchema, WIZ6_MAIN } from '../../packages/data/src/index.js';
import type { Font4bpp } from '../../packages/data/src/index.js';
import { renderFontGlyph } from './sprite.js';

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

// Engine cross-check: full-screen pixel parity against the committed engine
// fixtures now lives in screen-parity.test.ts (no live .sav read).
