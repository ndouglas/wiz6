/**
 * screen-parity.test.ts — Fixture-based parity floor test for the CHARACTER MENU.
 *
 * NOTE: The canonical version of this test is in @wiz6/viewer:
 *   packages/viewer/tests/pages/roster/creation/ega/screen-parity.test.ts
 *
 * This file is kept for reference / standalone use if node_modules are installed
 * in tools/parity/ (via `cd tools/parity && npm install`). Under normal development,
 * run the canonical test instead:
 *   pnpm --filter @wiz6/viewer test tests/pages/roster/creation/ega/screen-parity.test.ts
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Fixture-based parity: our CHARACTER MENU render vs. committed engine fixture.
 *
 * Loads the committed engine fixture `character-menu-partial` (generated once from
 * DOSBox-X save 1 via `tools/parity/gen-fixture.ts`) and compares against our
 * headless render. No .sav file is read at test time.
 *
 * Actual match as of implementation: ~46.78% (tolerance=8).
 *   Sources of divergence:
 *   1. Our renderer fills the entire background with dark-gray (85,85,85).
 *      The engine fills only the screen-background region. Window interiors
 *      are black (attr 0). This accounts for the largest share.
 *   2. Window chrome tiles drawn where engine leaves blank/black.
 *   3. DOSBox-X internal-state contamination (~161 pixels in rows 15–16).
 *   Layout refinement will raise this number.
 *
 * THRESHOLD: 40% (actual ~46.78% — 7% margin for refactor safety)
 *
 * Run (if tools/parity/node_modules installed):
 *   cd tools/parity && npx vitest run screen-parity.test.ts
 * Or (preferred, always works):
 *   pnpm --filter @wiz6/viewer test tests/pages/roster/creation/ega/screen-parity.test.ts
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WIZ6_MAIN, FontSchema, Font4bppSchema, MessageDbSchema } from '../../packages/data/src/index.js';
import type { Font, Font4bpp, MessageDb } from '../../packages/data/src/index.js';
import { setCursor, puts } from '../../packages/parser/src/index.js';
import { loadCreationFontSet } from '../../packages/viewer/src/pages/roster/creation/ega/assets.js';
import { renderCreationFrame } from '../../packages/viewer/src/pages/roster/creation/ega/render-frame.js';
import { createPersistentWindows } from '../../packages/viewer/src/pages/roster/creation/ega/windows.js';
import { highlightRow } from '../../packages/viewer/src/pages/roster/creation/ega/highlight.js';
import { creationString } from '../../packages/viewer/src/pages/roster/creation/messages.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import { compareRgba, writeDiffPng } from './diff-image.js';
import { indicesToRgba } from './decode-screen.js';

// ─── Path helpers ────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

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
const FIXTURES_ENGINE = join(MAIN_ROOT, 'tools', 'parity', 'fixtures', 'engine');

// ─── Fixture loader (no .sav) ─────────────────────────────────────────────────

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

// ─── Disk loaders ─────────────────────────────────────────────────────────────

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

// ─── Render helpers ──────────────────────────────────────────────────────────

async function renderCharacterMenuPartial(): Promise<Uint8ClampedArray> {
  const fontSet = await loadCreationFontSet({
    loadFont: diskLoadFont,
    loadFont4bpp: diskLoadFont4bpp,
  });
  const db: MessageDb = MessageDbSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_MESSAGES, 'msg.json'), 'utf-8')) as unknown,
  );

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

  // PARTIAL grid: COL_X_3=[1,14,27], ROW_Y=[1,3]
  const normalAttr = 0x13;
  setCursor(bottomBar, 1,  1); puts(bottomBar, labels.createPc, normalAttr);
  setCursor(bottomBar, 14, 1); puts(bottomBar, labels.deletePc, normalAttr);
  setCursor(bottomBar, 27, 1); puts(bottomBar, labels.portrait,  normalAttr);
  setCursor(bottomBar, 1,  3); puts(bottomBar, labels.reviewPc, normalAttr);
  setCursor(bottomBar, 14, 3); puts(bottomBar, labels.renamePc, normalAttr);
  setCursor(bottomBar, 27, 3); puts(bottomBar, labels.exit,     normalAttr);

  highlightRow(bottomBar, 1, 5);

  return renderCreationFrame([top, bottomBar, menuPanel], fontSet, WIZ6_MAIN);
}

// ─── Parity test ─────────────────────────────────────────────────────────────

const CHARACTER_MENU_PARTIAL_PARITY_THRESHOLD = 40; // percent (actual ~46.78%)

describe('screen parity: CHARACTER MENU (partial) vs committed fixture', () => {
  it(
    `matches engine fixture at ≥ ${CHARACTER_MENU_PARTIAL_PARITY_THRESHOLD}% (actual ~46.78%)`,
    async () => {
      // 1. Load fixture (no .sav)
      const engineRgba = loadFixtureRgba('character-menu-partial');

      // 2. Render ours
      const ourRgba = await renderCharacterMenuPartial();

      // 3. Compare
      const result = compareRgba(ourRgba, engineRgba, { tolerance: 8 });

      // 4. Write diff artifacts (non-fatal)
      try {
        const diffPath = '/tmp/diff-character-menu-partial-parity.png';
        writeDiffPng(ourRgba, engineRgba, diffPath, { tolerance: 8 });
        const ourPng = encodePngRgba(320, 200, new Uint8Array(ourRgba.buffer));
        writeFileSync('/tmp/our-character-menu-partial-parity.png', ourPng);
        console.log(`  match: ${result.matchPct.toFixed(2)}%  diff → ${diffPath}`);
      } catch {
        // Non-fatal
      }

      // 5. Regression floor
      expect(result.matchPct).toBeGreaterThanOrEqual(CHARACTER_MENU_PARTIAL_PARITY_THRESHOLD);
    },
    60_000,
  );
});
