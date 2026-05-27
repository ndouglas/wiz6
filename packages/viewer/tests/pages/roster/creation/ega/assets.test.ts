// packages/viewer/tests/pages/roster/creation/ega/assets.test.ts
//
// Tests for loadCreationFontSet() and the CREATION_PALETTE re-export.
//
// Font-loading strategy: loadCreationFontSet accepts optional injectable
// loaders (loadFont, loadFont4bpp). In the test env, fetch('/fonts/...')
// doesn't work, so we pass loaders that read the real extracted font JSON
// from disk. The main checkout's extracted/ dir is located by parsing the
// worktree's .git file.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { FontSchema, Font4bppSchema, WIZ6_MAIN } from '@wiz6/data';
import type { Font, Font4bpp } from '@wiz6/data';
import {
  loadCreationFontSet,
  CREATION_PALETTE,
} from '../../../../../src/pages/roster/creation/ega/assets.js';

// ---------------------------------------------------------------------------
// Resolve the main checkout's extracted/fonts/ directory.
//
// In a git worktree, `.git` is a file containing "gitdir: <path>".
// From that path we can derive the main checkout root.
// ---------------------------------------------------------------------------

function findMainCheckoutRoot(): string {
  const testDir = dirname(fileURLToPath(import.meta.url));
  // Walk up to find the worktree root (the dir containing .git as a FILE).
  // From assets.test.ts: tests/pages/roster/creation/ega/ → 5 levels up to
  // packages/viewer/, then 2 more to the worktree root.
  const worktreeRoot = resolve(testDir, '../../../../../../..');
  const gitFilePath = join(worktreeRoot, '.git');
  let gitContent: string;
  try {
    gitContent = readFileSync(gitFilePath, 'utf-8');
  } catch {
    // Fallback: assume we're already in the main checkout
    return worktreeRoot;
  }
  // "gitdir: /path/to/.git/worktrees/branch-name\n"
  const match = /gitdir:\s*(.+)/.exec(gitContent);
  if (!match) return worktreeRoot;
  const gitDir = match[1]!.trim();
  // gitDir = /path/to/main/.git/worktrees/branch → main checkout is the parent of .git
  const dotGitDir = gitDir.replace(/\/worktrees\/[^/]+$/, '');
  return resolve(dotGitDir, '..');
}

const MAIN_ROOT = findMainCheckoutRoot();
const EXTRACTED_FONTS = join(MAIN_ROOT, 'extracted', 'fonts');

/** Disk-reading loader for 1bpp fonts. */
async function diskLoadFont(url: string): Promise<Font> {
  const filename = url.replace(/^\/fonts\//, '');
  const json: unknown = JSON.parse(readFileSync(join(EXTRACTED_FONTS, filename), 'utf-8'));
  return FontSchema.parse(json);
}

/** Disk-reading loader for 4bpp fonts. */
async function diskLoadFont4bpp(url: string): Promise<Font4bpp> {
  const filename = url.replace(/^\/fonts\//, '');
  const json: unknown = JSON.parse(readFileSync(join(EXTRACTED_FONTS, filename), 'utf-8'));
  return Font4bppSchema.parse(json);
}

// ---------------------------------------------------------------------------
// loadCreationFontSet
// ---------------------------------------------------------------------------

describe('loadCreationFontSet', () => {
  it('resolves a FontSet with font0 (1bpp) set', async () => {
    const fontSet = await loadCreationFontSet({
      loadFont: diskLoadFont,
      loadFont4bpp: diskLoadFont4bpp,
    });
    expect(fontSet.font0).toBeDefined();
    expect(fontSet.font0).not.toBeNull();
  });

  it('font0 has the expected id (wfont0)', async () => {
    const fontSet = await loadCreationFontSet({
      loadFont: diskLoadFont,
      loadFont4bpp: diskLoadFont4bpp,
    });
    expect(fontSet.font0?.id).toBe('wfont0');
  });

  it('resolves a FontSet with font3 (4bpp, wfont3) set', async () => {
    const fontSet = await loadCreationFontSet({
      loadFont: diskLoadFont,
      loadFont4bpp: diskLoadFont4bpp,
    });
    expect(fontSet.font3).toBeDefined();
    expect(fontSet.font3).not.toBeNull();
  });

  it('font3 has the expected id (wfont3)', async () => {
    const fontSet = await loadCreationFontSet({
      loadFont: diskLoadFont,
      loadFont4bpp: diskLoadFont4bpp,
    });
    expect(fontSet.font3?.id).toBe('wfont3');
  });

  it('resolves a FontSet with font4 (4bpp, wfont4) set', async () => {
    const fontSet = await loadCreationFontSet({
      loadFont: diskLoadFont,
      loadFont4bpp: diskLoadFont4bpp,
    });
    expect(fontSet.font4).toBeDefined();
    expect(fontSet.font4).not.toBeNull();
  });

  it('font4 has the expected id (wfont4)', async () => {
    const fontSet = await loadCreationFontSet({
      loadFont: diskLoadFont,
      loadFont4bpp: diskLoadFont4bpp,
    });
    expect(fontSet.font4?.id).toBe('wfont4');
  });

  it('font0 has glyphs (real font data, not empty)', async () => {
    const fontSet = await loadCreationFontSet({
      loadFont: diskLoadFont,
      loadFont4bpp: diskLoadFont4bpp,
    });
    expect(fontSet.font0?.glyphCount).toBeGreaterThan(0);
    expect(fontSet.font0?.glyphs.length).toBeGreaterThan(0);
  });

  it('font3 has glyphs (real font data, not empty)', async () => {
    const fontSet = await loadCreationFontSet({
      loadFont: diskLoadFont,
      loadFont4bpp: diskLoadFont4bpp,
    });
    expect(fontSet.font3?.glyphCount).toBeGreaterThan(0);
    expect(fontSet.font3?.glyphs.length).toBeGreaterThan(0);
  });

  it('font4 has glyphs (real font data, not empty)', async () => {
    const fontSet = await loadCreationFontSet({
      loadFont: diskLoadFont,
      loadFont4bpp: diskLoadFont4bpp,
    });
    expect(fontSet.font4?.glyphCount).toBeGreaterThan(0);
    expect(fontSet.font4?.glyphs.length).toBeGreaterThan(0);
  });

  it('font1 is set (4bpp, wfont1) — used by window chrome (attr=0x01)', async () => {
    const fontSet = await loadCreationFontSet({
      loadFont: diskLoadFont,
      loadFont4bpp: diskLoadFont4bpp,
    });
    // Window chrome cells use attr=0x01 (wfont1) for frame tiles.
    expect(fontSet.font1).toBeDefined();
    expect(fontSet.font1).not.toBeNull();
    expect(fontSet.font1?.id).toBe('wfont1');
  });

  it('font2 is null (not needed by creation screens)', async () => {
    const fontSet = await loadCreationFontSet({
      loadFont: diskLoadFont,
      loadFont4bpp: diskLoadFont4bpp,
    });
    // Creation screens don't use wfont2 — attr low nibble 2 is not used.
    expect(fontSet.font2 ?? null).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CREATION_PALETTE re-export
// ---------------------------------------------------------------------------

describe('CREATION_PALETTE', () => {
  it('is the WIZ6_MAIN palette', () => {
    expect(CREATION_PALETTE).toBe(WIZ6_MAIN);
  });

  it('has all 16 EGA palette colors (indices 0..15)', () => {
    // WIZ6_MAIN has 16 colors (EGA attribute indices 0..15). The creation
    // window attr bytes (0x13..0x19) are NOT direct palette indices — the low
    // nibble selects the wfont, and the high nibble is only used in the
    // highlight path (attr >> 4 as bg index, which is always 0..0xf).
    // Confirming the palette has the full set of 16 entries.
    expect(CREATION_PALETTE.colors).toHaveLength(16);
  });

  it('colors are valid RGB triples (each component 0..255)', () => {
    // All 16 palette entries must be valid RGB triples.
    for (let i = 0; i < 16; i++) {
      const color = CREATION_PALETTE.colors[i]!;
      expect(color).toHaveLength(3);
      for (const component of color) {
        expect(component).toBeGreaterThanOrEqual(0);
        expect(component).toBeLessThanOrEqual(255);
      }
    }
  });
});
