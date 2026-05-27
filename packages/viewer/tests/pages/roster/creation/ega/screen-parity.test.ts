/**
 * screen-parity.test.ts — Fixture-based parity: our CHARACTER MENU render vs. engine.
 *
 * Loads the committed engine fixture `character-menu-partial` (generated once from
 * DOSBox-X save 1 via `tools/parity/gen-fixture.ts`) and compares it against our
 * headless render of the CHARACTER MENU in the PARTIAL roster state (rosterCount=7,
 * cursor at (0,0) = CREATE PC highlighted).
 *
 * CRITICAL: this test reads NO .sav file. The engine ground truth is the committed
 * tools/parity/fixtures/engine/character-menu-partial.idx.gz file.
 *
 * Fixture format:
 *   .idx.gz — gzipped Uint8Array(64000): one 4-bit EGA index per pixel (0–15).
 *   Palette applied via the wiz6-main AC→DAC pipeline at test time.
 *
 * Match floor: set conservatively below the measured actual value.
 * Run this test once to get the real match %, then tighten if desired.
 *
 * Run:
 *   pnpm --filter @wiz6/viewer test tests/pages/roster/creation/ega/screen-parity.test.ts
 * Or via the full viewer test suite:
 *   pnpm --filter @wiz6/viewer test
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WIZ6_MAIN, FontSchema, Font4bppSchema } from '@wiz6/data';
import type { Font, Font4bpp, MessageDb } from '@wiz6/data';
import { MessageDbSchema } from '@wiz6/data';
import { setCursor, puts } from '@wiz6/parser';
import { loadCreationFontSet } from '../../../../../src/pages/roster/creation/ega/assets.js';
import { renderCreationFrame } from '../../../../../src/pages/roster/creation/ega/render-frame.js';
import { createPersistentWindows } from '../../../../../src/pages/roster/creation/ega/windows.js';
import { creationString } from '../../../../../src/pages/roster/creation/messages.js';
import { compareRgba, writeDiffPng } from '../../../../../../../tools/parity/diff-image.js';
import { indicesToRgba } from '../../../../../../../tools/parity/decode-screen.js';

// ─── Path helpers ────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the repo root from the test file location.
 * This test lives at:
 *   packages/viewer/tests/pages/roster/creation/ega/screen-parity.test.ts
 * That's 7 levels deep from repo root.
 */
// __dirname = packages/viewer/tests/pages/roster/creation/ega
// 7 levels up reaches the repo root
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..', '..', '..');

/**
 * Resolve the main checkout root (handles git worktrees).
 * In a worktree, .git is a file "gitdir: <path>/worktrees/<name>"
 */
function findMainCheckoutRoot(): string {
  const gitFilePath = join(REPO_ROOT, '.git');
  let gitContent: string;
  try {
    gitContent = readFileSync(gitFilePath, 'utf-8');
  } catch {
    return REPO_ROOT;
  }
  const match = /gitdir:\s*(.+)/.exec(gitContent);
  if (!match) return REPO_ROOT;
  const gitDir = match[1]!.trim();
  const dotGitDir = gitDir.replace(/\/worktrees\/[^/]+$/, '');
  return resolve(dotGitDir, '..');
}

const MAIN_ROOT = findMainCheckoutRoot();
const EXTRACTED_FONTS = join(MAIN_ROOT, 'extracted', 'fonts');
const EXTRACTED_MESSAGES = join(MAIN_ROOT, 'extracted', 'messages');

// Fixtures live in tools/parity/fixtures/engine/ — relative to MAIN_ROOT
const FIXTURES_ENGINE = join(MAIN_ROOT, 'tools', 'parity', 'fixtures', 'engine');

// ─── Fixture loader (no .sav) ─────────────────────────────────────────────────

/**
 * Load a committed engine fixture from tools/parity/fixtures/engine/<name>.idx.gz.
 * Decompresses the gzipped EGA index array and applies the wiz6-main AC→DAC palette.
 * No .sav file is read — the fixture is the committed ground truth.
 */
function loadFixtureRgba(name: string): Uint8Array {
  const idxGzPath = join(FIXTURES_ENGINE, `${name}.idx.gz`);
  const compressed = readFileSync(idxGzPath);
  const raw = gunzipSync(compressed);
  if (raw.length !== 64000) {
    throw new Error(`Fixture "${name}": expected 64000 bytes, got ${raw.length}`);
  }
  const indices = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  return indicesToRgba(indices);
}

// ─── Disk-loading font helpers ────────────────────────────────────────────────

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

// ─── Headless CHARACTER MENU render (PARTIAL, cursor at CREATE PC) ──────────

/**
 * Render the CHARACTER MENU headlessly for a partial roster (rosterCount=7),
 * cursor at (0,0) = CREATE PC highlighted.
 *
 * Mirrors exactly what CharacterMenuScreen.tsx does during render(), without React:
 *   1. createPersistentWindows() → top, bottomBar, menuPanel
 *   2. Write each visible option to bottomBar at its grid position
 *   3. Highlight the cursor row (row 0 → y=ROW_Y[0]=1)
 *   4. renderCreationFrame([top, bottomBar, menuPanel], fontSet, WIZ6_MAIN)
 *
 * PARTIAL grid (rosterCount=7, all 6 options, 2×3):
 *   Row 0 (y=1): CREATE PC @ col 1 (x=1) | DELETE PC @ col 14 | PORTRAIT @ col 27
 *   Row 1 (y=3): REVIEW PC @ col 1       | RENAME PC @ col 14 | EXIT @ col 27
 *
 * Cursor = (0,0) → CREATE PC at y=1, x=1 → highlightRow(bottomBar, 1, 5)
 *
 * Menu option strings resolved from extracted/messages/msg.json (same as browser).
 */
async function renderCharacterMenuPartial(): Promise<Uint8ClampedArray> {
  const fontSet = await loadCreationFontSet({
    loadFont: diskLoadFont,
    loadFont4bpp: diskLoadFont4bpp,
  });

  const msgJson: unknown = JSON.parse(
    readFileSync(join(EXTRACTED_MESSAGES, 'msg.json'), 'utf-8'),
  );
  const db: MessageDb = MessageDbSchema.parse(msgJson);

  // Resolve option labels (mirrors buildAllOptions in CharacterMenuScreen.tsx)
  const resolve_ = (id: number, fallback: string): string => {
    const s = creationString(db, id);
    return s !== '' ? s : fallback;
  };
  const labels = {
    createPc: resolve_(0x046a, 'CREATE PC'),
    reviewPc: resolve_(0x046b, 'REVIEW PC'),
    deletePc: resolve_(0x046c, 'DELETE PC'),
    renamePc: resolve_(0x046d, 'RENAME PC'),
    portrait: resolve_(0x046e, 'PORTRAIT'),
    exit:     'EXIT',
  };

  const { top, bottomBar, menuPanel } = createPersistentWindows();

  // PARTIAL grid (6 options): column-major fill, 2 rows per column, column x
  // in fill order = [18, 30, 2] (center, right, left), rows at bottomBar-local
  // 3 & 4 (screen rows 23 & 24). Verified pixel-exact against the fixture.
  //   col x18: CREATE PC (row3) / REVIEW PC (row4)
  //   col x30: DELETE PC (row3) / RENAME PC (row4)
  //   col x2:  PORTRAIT  (row3) / EXIT      (row4)
  // The engine does NOT highlight the bottom option list (selection shows in
  // the top status bar), so options are plain white text (attr 0x13).
  const normalAttr = 0x13;
  setCursor(bottomBar, 18, 3); puts(bottomBar, labels.createPc, normalAttr);
  setCursor(bottomBar, 18, 4); puts(bottomBar, labels.reviewPc, normalAttr);
  setCursor(bottomBar, 30, 3); puts(bottomBar, labels.deletePc, normalAttr);
  setCursor(bottomBar, 30, 4); puts(bottomBar, labels.renamePc, normalAttr);
  setCursor(bottomBar, 2,  3); puts(bottomBar, labels.portrait, normalAttr);
  setCursor(bottomBar, 2,  4); puts(bottomBar, labels.exit,     normalAttr);

  return renderCreationFrame([top, bottomBar, menuPanel], fontSet, WIZ6_MAIN);
}

// ─── Parity test ──────────────────────────────────────────────────────────────

/**
 * Regression floor for the CHARACTER MENU partial render vs. engine fixture.
 *
 * The fixture is the committed engine ground truth (decoded once from save 1,
 * never re-read from .sav at test time).
 *
 * Threshold is set conservatively. Run the test to see the actual match %.
 * Tighten threshold after layout refinement.
 */
// Actual match as of last layout pass: ~49.25% (tolerance=8).
// The menu-option layout now matches the engine exactly (column-major fill,
// columns at bottomBar-local x = [18, 30, 2], rows 3 & 4; no bottom-menu
// highlight). Remaining divergence is the TOP region:
//   - The engine's CHARACTER MENU top is the character-SHEET view: black only at
//     screen rows 0–5 and the central columns 15–33; GRAY everywhere else, with
//     nested label/value sub-panels. Our `top`/`menuPanel`/`bottomBar` windows
//     black-fill large regions the engine leaves gray (bottom menu sits on the
//     gray background, not a black bar). Reproducing the real char-sheet window
//     geometry (from wpcmk_entry_and_roster_menu @ 0x59e0) is the next pass.
// Threshold = actual − ~4% safety margin (45%).
const CHARACTER_MENU_PARTIAL_PARITY_THRESHOLD = 45; // percent

describe('screen parity: CHARACTER MENU (partial) vs committed fixture', () => {
  it(
    `render matches character-menu-partial fixture at ≥ ${CHARACTER_MENU_PARTIAL_PARITY_THRESHOLD}%`,
    async () => {
      // 1. Load engine fixture (no .sav read)
      const engineRgba = loadFixtureRgba('character-menu-partial');

      // 2. Render our CHARACTER MENU headlessly
      const ourRgba = await renderCharacterMenuPartial();

      // 3. Compare
      const result = compareRgba(ourRgba, engineRgba, { tolerance: 8 });

      // 4. Write diff artifacts to /tmp (non-fatal)
      try {
        const diffPath = '/tmp/diff-character-menu-partial.png';
        writeDiffPng(ourRgba, engineRgba, diffPath, { tolerance: 8 });
        const ourU8 = new Uint8Array(ourRgba.buffer);
        const { encodePngRgba } = await import('../../../../../../cli/src/lib/png.js');
        writeFileSync('/tmp/our-character-menu-partial.png', encodePngRgba(320, 200, ourU8));
        console.log(
          `  character-menu-partial match: ${result.matchPct.toFixed(2)}%  diff → ${diffPath}`,
        );
      } catch {
        // Non-fatal
      }

      // 5. Report first diffs for diagnostics
      if (result.firstDiffs.length > 0) {
        console.log(
          `  first diff at (${result.firstDiffs[0]!.x}, ${result.firstDiffs[0]!.y}): ` +
          `ours=[${result.firstDiffs[0]!.a.join(',')}] engine=[${result.firstDiffs[0]!.b.join(',')}]`,
        );
      }

      // 6. Regression floor
      expect(result.matchPct).toBeGreaterThanOrEqual(CHARACTER_MENU_PARTIAL_PARITY_THRESHOLD);
    },
    60_000, // allow 60s for font loading + rendering
  );
});
