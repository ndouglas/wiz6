// packages/viewer/tests/pages/roster/creation/ega/render-frame.test.ts
//
// Tests for renderCreationFrame() — pure RGBA compositor for creation screens.
//
// Strategy:
//   1. Load real fonts from disk (same technique as assets.test.ts).
//   2. Build persistent windows, put some known text in them.
//   3. renderCreationFrame() → Uint8ClampedArray.
//   4. Assert correct length (320×200×4).
//   5. Assert a stable SHA-256 golden hash (stored in __fixtures__/).
//      On first run the fixture is written; subsequent runs must match.
//   6. Assert that rendering with DIFFERENT text produces a DIFFERENT hash
//      (proves text actually hits the RGBA buffer).

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FontSchema, Font4bppSchema } from '@wiz6/data';
import type { Font, Font4bpp } from '@wiz6/data';
import { puts, setCursor } from '@wiz6/parser';
import {
  loadCreationFontSet,
  WIZ6_MAIN,
} from '../../../../../src/pages/roster/creation/ega/assets.js';
import { createPersistentWindows } from '../../../../../src/pages/roster/creation/ega/windows.js';
import { renderCreationFrame } from '../../../../../src/pages/roster/creation/ega/render-frame.js';

// ---------------------------------------------------------------------------
// Resolve the main checkout's extracted/fonts/ directory.
// (Same approach as assets.test.ts — parses the worktree .git file.)
// ---------------------------------------------------------------------------

function findMainCheckoutRoot(): string {
  const testDir = dirname(fileURLToPath(import.meta.url));
  // From render-frame.test.ts: tests/pages/roster/creation/ega/ → 7 levels up
  // to the worktree root.
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
// Fixture helpers
// ---------------------------------------------------------------------------

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const GOLDEN_FILE = join(FIXTURES_DIR, 'empty-and-text-frame.sha256');

function sha256hex(buf: Uint8ClampedArray): string {
  return createHash('sha256').update(Buffer.from(buf)).digest('hex');
}

function readOrWriteGolden(hash: string): string {
  if (!existsSync(FIXTURES_DIR)) {
    mkdirSync(FIXTURES_DIR, { recursive: true });
  }
  if (!existsSync(GOLDEN_FILE)) {
    writeFileSync(GOLDEN_FILE, hash, 'utf-8');
    return hash;
  }
  return readFileSync(GOLDEN_FILE, 'utf-8').trim();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderCreationFrame', () => {
  it('returns a 320×200×4 RGBA buffer', async () => {
    const fontSet = await loadCreationFontSet({
      loadFont: diskLoadFont,
      loadFont4bpp: diskLoadFont4bpp,
    });
    const { top, bottomBar, menuPanel } = createPersistentWindows();
    setCursor(bottomBar, 0, 0);
    puts(bottomBar, 'SELECT CHARACTER RACE', 0x13);

    const rgba = renderCreationFrame([top, bottomBar, menuPanel], fontSet, WIZ6_MAIN);

    expect(rgba).toBeInstanceOf(Uint8ClampedArray);
    expect(rgba.length).toBe(320 * 200 * 4);
  });

  it('matches the golden SHA-256 hash (snapshot test)', async () => {
    const fontSet = await loadCreationFontSet({
      loadFont: diskLoadFont,
      loadFont4bpp: diskLoadFont4bpp,
    });
    const { top, bottomBar, menuPanel } = createPersistentWindows();
    setCursor(bottomBar, 0, 0);
    puts(bottomBar, 'SELECT CHARACTER RACE', 0x13);

    const rgba = renderCreationFrame([top, bottomBar, menuPanel], fontSet, WIZ6_MAIN);

    const actualHash = sha256hex(rgba);
    const expectedHash = readOrWriteGolden(actualHash);

    expect(actualHash).toBe(expectedHash);
  });

  it('buffer is non-uniform (pixels differ — not a blank slate)', async () => {
    const fontSet = await loadCreationFontSet({
      loadFont: diskLoadFont,
      loadFont4bpp: diskLoadFont4bpp,
    });
    const { top, bottomBar, menuPanel } = createPersistentWindows();
    setCursor(bottomBar, 0, 0);
    puts(bottomBar, 'SELECT CHARACTER RACE', 0x13);

    const rgba = renderCreationFrame([top, bottomBar, menuPanel], fontSet, WIZ6_MAIN);

    // Verify that not all pixels are identical (the buffer must have rendered
    // content, not just a single flat fill).
    const first = rgba[0];
    const isUniform = rgba.every((v) => v === first);
    expect(isUniform).toBe(false);
  });

  it('different text produces a different hash', async () => {
    const fontSet = await loadCreationFontSet({
      loadFont: diskLoadFont,
      loadFont4bpp: diskLoadFont4bpp,
    });

    // Frame A: 'SELECT CHARACTER RACE'
    const winsA = createPersistentWindows();
    setCursor(winsA.bottomBar, 0, 0);
    puts(winsA.bottomBar, 'SELECT CHARACTER RACE', 0x13);
    const rgbaA = renderCreationFrame(
      [winsA.top, winsA.bottomBar, winsA.menuPanel],
      fontSet,
      WIZ6_MAIN,
    );

    // Frame B: 'SELECT CHARACTER SEX ' (same length, different text)
    const winsB = createPersistentWindows();
    setCursor(winsB.bottomBar, 0, 0);
    puts(winsB.bottomBar, 'SELECT CHARACTER SEX ', 0x13);
    const rgbaB = renderCreationFrame(
      [winsB.top, winsB.bottomBar, winsB.menuPanel],
      fontSet,
      WIZ6_MAIN,
    );

    expect(sha256hex(rgbaA)).not.toBe(sha256hex(rgbaB));
  });
});
