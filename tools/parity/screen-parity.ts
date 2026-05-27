/**
 * screen-parity.ts — CLI parity harness: our CHARACTER MENU render vs. committed fixture.
 *
 * Loads the committed engine fixture `character-menu-partial` (generated once from
 * DOSBox-X save 1 via `tools/parity/gen-fixture.ts`) and compares it against our
 * headless render of the CHARACTER MENU in the PARTIAL roster state (rosterCount=7,
 * cursor at (0,0) = CREATE PC highlighted).
 *
 * CRITICAL: this script reads NO .sav file. The engine ground truth is the committed
 * tools/parity/fixtures/engine/character-menu-partial.idx.gz file.
 *
 * Run:
 *   pnpm tsx tools/parity/screen-parity.ts
 *
 * Outputs:
 *   /tmp/our-character-menu-partial.png     — our rendered frame
 *   /tmp/engine-character-menu-partial.png  — engine reference (from committed fixture)
 *   /tmp/diff-character-menu-partial.png    — diff PNG (red = mismatch)
 *   Prints matchPct + summary of first diverging pixels.
 *
 * The match % is the ground truth for the current render quality. It is used as
 * the regression floor in the parity test (with a small margin).
 *
 * ## Regenerating fixtures
 *
 * If you need to capture a new engine reference for the CHARACTER MENU:
 *   1. Boot Wiz6 in DOSBox-X, navigate to the character menu, save state:
 *      Alt-F5 → saves to tools/dosbox/save/<n>.sav
 *   2. Generate the fixture:
 *      pnpm tsx tools/parity/gen-fixture.ts --save <n> --name character-menu-partial
 *   3. Commit the new fixture:
 *      git add tools/parity/fixtures/engine/character-menu-partial.{idx.gz,png}
 *   4. Re-run this script to verify the match % is still above the regression floor.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import { FontSchema, Font4bppSchema, MessageDbSchema, WIZ6_MAIN } from '../../packages/data/src/index.js';
import type { Font, Font4bpp, MessageDb } from '../../packages/data/src/index.js';
import { loadCreationFontSet } from '../../packages/viewer/src/pages/roster/creation/ega/assets.js';
import { renderCreationFrame } from '../../packages/viewer/src/pages/roster/creation/ega/render-frame.js';
import { createPersistentWindows } from '../../packages/viewer/src/pages/roster/creation/ega/windows.js';
import { highlightRow } from '../../packages/viewer/src/pages/roster/creation/ega/highlight.js';
import { setCursor, puts } from '../../packages/parser/src/index.js';
import {
  creationString,
} from '../../packages/viewer/src/pages/roster/creation/messages.js';
import { compareRgba, writeDiffPng } from './diff-image.js';
import { loadFixture } from './fixtures.js';

// ─── Resolve paths ───────────────────────────────────────────────────────────

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
const EXTRACTED_MESSAGES = join(MAIN_ROOT, 'extracted', 'messages');

// ─── Disk-loading font loaders (no fetch in node) ────────────────────────────

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

function loadMessageDb(): MessageDb {
  const json: unknown = JSON.parse(readFileSync(join(EXTRACTED_MESSAGES, 'msg.json'), 'utf-8'));
  return MessageDbSchema.parse(json);
}

// ─── Render CHARACTER MENU (partial roster, cursor=CREATE PC) ──────────────

/**
 * Render the CHARACTER MENU headlessly for a partial roster (rosterCount=7),
 * cursor at (0,0) = CREATE PC highlighted.
 *
 * Mirrors exactly what CharacterMenuScreen.tsx does during render(), without React.
 */
async function renderCharacterMenuPartial(): Promise<Uint8ClampedArray> {
  const fontSet = await loadCreationFontSet({
    loadFont: diskLoadFont,
    loadFont4bpp: diskLoadFont4bpp,
  });
  const db = loadMessageDb();

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

  // PARTIAL grid (6 options, 3 cols × 2 rows)
  // Row 0: CREATE PC @ x=1 | DELETE PC @ x=14 | PORTRAIT @ x=27
  // Row 1: REVIEW PC @ x=1 | RENAME PC @ x=14 | EXIT @ x=27
  // COL_X_3 = [1, 14, 27], ROW_Y = [1, 3]
  const normalAttr = 0x13;
  setCursor(bottomBar, 1,  1); puts(bottomBar, labels.createPc, normalAttr);
  setCursor(bottomBar, 14, 1); puts(bottomBar, labels.deletePc, normalAttr);
  setCursor(bottomBar, 27, 1); puts(bottomBar, labels.portrait,  normalAttr);
  setCursor(bottomBar, 1,  3); puts(bottomBar, labels.reviewPc, normalAttr);
  setCursor(bottomBar, 14, 3); puts(bottomBar, labels.renamePc, normalAttr);
  setCursor(bottomBar, 27, 3); puts(bottomBar, labels.exit,     normalAttr);

  // Cursor at (row=0, col=0) → y = ROW_Y[0] = 1 → highlightRow(bottomBar, 1, 5)
  highlightRow(bottomBar, 1, 5);

  return renderCreationFrame([top, bottomBar, menuPanel], fontSet, WIZ6_MAIN);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('screen-parity: CHARACTER MENU (partial roster) vs committed fixture');
  console.log('Fixture: tools/parity/fixtures/engine/character-menu-partial.idx.gz');
  console.log('');

  // 1. Render ours
  console.log('Rendering CHARACTER MENU (partial, cursor=CREATE PC)...');
  const ourRgba = await renderCharacterMenuPartial();
  const ourPng = encodePngRgba(320, 200, new Uint8Array(ourRgba.buffer));
  const ourPath = '/tmp/our-character-menu-partial.png';
  writeFileSync(ourPath, ourPng);
  console.log(`  → ${ourPath}`);

  // 2. Load engine fixture (no .sav read)
  console.log('Loading engine fixture (character-menu-partial)...');
  const { rgba: engineRgba } = loadFixture('character-menu-partial');
  const enginePng = encodePngRgba(320, 200, engineRgba);
  const enginePath = '/tmp/engine-character-menu-partial.png';
  writeFileSync(enginePath, enginePng);
  console.log(`  → ${enginePath}`);

  // 3. Diff
  console.log('Comparing...');
  const result = compareRgba(ourRgba, engineRgba, { tolerance: 8 });
  const diffPath = '/tmp/diff-character-menu-partial.png';
  writeDiffPng(ourRgba, engineRgba, diffPath, { tolerance: 8 });
  console.log(`  → ${diffPath}`);

  // 4. Report
  console.log('');
  console.log('─────────────────────────────────────────────');
  console.log(`Match: ${result.matchPct.toFixed(2)}%  (${result.total - result.diffCount}/${result.total} pixels match)`);
  console.log(`Diff pixels: ${result.diffCount}`);
  if (result.firstDiffs.length > 0) {
    console.log('First mismatches:');
    for (const d of result.firstDiffs) {
      console.log(
        `  (${d.x}, ${d.y})  ours=[${d.a.join(',')}]  engine=[${d.b.join(',')}]`,
      );
    }
  } else {
    console.log('No mismatches — PERFECT MATCH');
  }
  console.log('─────────────────────────────────────────────');
  console.log('');
  console.log('Artifacts:');
  console.log(`  ours:   ${ourPath}`);
  console.log(`  engine: ${enginePath}  (from committed fixture, NOT a .sav)`);
  console.log(`  diff:   ${diffPath}`);
}

main().catch((err) => {
  console.error('screen-parity failed:', err);
  process.exit(1);
});
