/**
 * screen-parity.test.ts — regression floor test for the NUG confirm-screen render.
 *
 * Asserts that our headless render of the NUG confirm screen (screen-15:
 * "SAVE THIS CHARACTER?") matches the engine's 320×200 RGBA from save 1
 * above a known threshold.
 *
 * This is NOT a "must be perfect" test. The goal is a REGRESSION FLOOR:
 * if a refactor breaks the render significantly, this test catches it.
 *
 * Actual match as of implementation: ~67.2% (tolerance=8).
 *   Sources of divergence (from diff PNG analysis):
 *   1. Background fill: we fill with dark-gray (85,85,85), engine shows black
 *      in most window interiors — this accounts for the largest share (~15%)
 *   2. Top window content: our font tiles differ from engine font tiles in
 *      the portion of the window the engine does NOT draw into (engine leaves
 *      blank/black; we draw chrome tiles in the un-written cells)
 *   3. Bottom bar region: similar pattern — engine has mostly black; we have
 *      chrome + rendered text in a different vertical position
 *   4. Row 120 area: window border renders match in most pixels; small shifts
 *      from chrome vs. engine border drawing approach
 *   Layout refinement (aligning exactly to engine window positions and fill
 *   colors) will raise this number. The threshold below is set conservatively
 *   so the test does NOT break on minor improvements.
 *
 * THRESHOLD: 60% (actual ~67.2% — 7% margin for refactor safety)
 *
 * Run:
 *   cd tools/parity && npx vitest run screen-parity.test.ts
 * Or via the screen-parity harness for human-readable output + PNG artifacts:
 *   pnpm tsx tools/parity/screen-parity.ts
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readVgaBlob } from '../../packages/mcp/src/vga-palette.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import { FontSchema, Font4bppSchema, MessageDbSchema, WIZ6_MAIN } from '../../packages/data/src/index.js';
import type { Font, Font4bpp } from '../../packages/data/src/index.js';
import { loadCreationFontSet } from '../../packages/viewer/src/pages/roster/creation/ega/assets.js';
import { renderCreationFrame } from '../../packages/viewer/src/pages/roster/creation/ega/render-frame.js';
import { createPersistentWindows } from '../../packages/viewer/src/pages/roster/creation/ega/windows.js';
import { highlightRow } from '../../packages/viewer/src/pages/roster/creation/ega/highlight.js';
import { setCursor, puts } from '../../packages/parser/src/index.js';
import {
  MSG,
  creationString,
  raceName,
  sexName,
  className,
} from '../../packages/viewer/src/pages/roster/creation/messages.js';
import { compareRgba, writeDiffPng } from './diff-image.js';

// ─── Path helpers ────────────────────────────────────────────────────────────

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

// ─── Disk loaders (no fetch in node) ─────────────────────────────────────────

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

async function renderNugConfirmScreen(): Promise<Uint8ClampedArray> {
  const fontSet = await loadCreationFontSet({
    loadFont: diskLoadFont,
    loadFont4bpp: diskLoadFont4bpp,
  });
  const db = MessageDbSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_MESSAGES, 'msg.json'), 'utf-8')) as unknown,
  );

  const { top, bottomBar } = createPersistentWindows();
  const attr = top.cells[1] ?? 0x14;

  // Row 0: name
  setCursor(top, 0, 0);
  puts(top, 'NUG', attr);
  // Row 1: race + sex (Elf Male)
  setCursor(top, 0, 1);
  puts(top, `${raceName(db, 1)} ${sexName(db, 0)}`, attr);
  // Row 2: class (Ninja)
  setCursor(top, 0, 2);
  puts(top, className(db, 13), attr);
  // Row 4: STR/INT/PIE/VIT
  setCursor(top, 0, 4);
  puts(top, 'STR:12  INT:10  PIE:10  VIT:12', attr);
  // Row 5: DEX/SPD/PER/KAR
  setCursor(top, 0, 5);
  puts(top, 'DEX:12  SPD:12  PER:8  KAR:13', attr);
  // Row 7: HP/STM/GOLD
  setCursor(top, 0, 7);
  puts(top, 'HP:6  STM:108  GOLD:?', attr);

  // bottomBar: prompt + YES/NO picker (cursor=0=YES highlighted)
  const promptText = creationString(db, MSG.confirmPrompt);
  if (promptText) {
    setCursor(bottomBar, 0, 0);
    puts(bottomBar, promptText, bottomBar.cells[1] ?? 0x13);
  }
  const optionAttr = bottomBar.cells[1] ?? 0x13;
  const options = ['YES', 'NO'] as const;
  for (let i = 0; i < options.length; i++) {
    const label = i === 0 ? (creationString(db, MSG.confirmOptions) || 'YES') : 'NO';
    setCursor(bottomBar, 0, 1 + i);
    puts(bottomBar, label, optionAttr);
    if (i === 0) highlightRow(bottomBar, 1 + i, 5);
  }

  return renderCreationFrame([top, bottomBar], fontSet, WIZ6_MAIN);
}

function decodeEngineScreen(savePath: string): Uint8Array {
  const blob = readVgaBlob(savePath);
  const EGA: ReadonlyArray<readonly [number, number, number]> = [
    [0, 0, 0], [0, 0, 170], [0, 170, 0], [0, 170, 170],
    [170, 0, 0], [170, 0, 170], [170, 85, 0], [170, 170, 170],
    [85, 85, 85], [85, 85, 255], [85, 255, 85], [85, 255, 255],
    [255, 85, 85], [255, 85, 255], [255, 255, 85], [255, 255, 255],
  ];
  const VRAM_OFFSET = 0x80000;
  const W = 320; const H = 200; const PLANES = 4;
  const DOSBOX_INTERNAL_START = 0x0810E0; const DOSBOX_INTERNAL_END = 0x08171F;
  const VGA_STATE_START = 0x82F70; const VGA_STATE_END = 0x838CE;
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const vgaAddr = y * 40 + (x >> 3);
      const blobBase = VRAM_OFFSET + vgaAddr * PLANES;
      let pixelIndex: number;
      if ((blobBase >= DOSBOX_INTERNAL_START && blobBase <= DOSBOX_INTERNAL_END) ||
          (blobBase >= VGA_STATE_START && blobBase <= VGA_STATE_END)) {
        pixelIndex = 0;
      } else {
        const b0 = blob[blobBase]!; const b1 = blob[blobBase + 1]!;
        const b2 = blob[blobBase + 2]!; const b3 = blob[blobBase + 3]!;
        const bit = 7 - (x & 7);
        pixelIndex = ((b0 >> bit) & 1) | (((b1 >> bit) & 1) << 1) |
                     (((b2 >> bit) & 1) << 2) | (((b3 >> bit) & 1) << 3);
      }
      const [r, g, b] = EGA[pixelIndex]!;
      const off = (y * W + x) * 4;
      rgba[off] = r; rgba[off + 1] = g; rgba[off + 2] = b; rgba[off + 3] = 0xff;
    }
  }
  return rgba;
}

// ─── Parity test ─────────────────────────────────────────────────────────────

/**
 * Regression floor: the NUG confirm-screen render must match the engine
 * reference (save 1) at ≥ 60%.
 *
 * Actual match as of implementation: ~67.2% (tolerance=8).
 * See header comment for sources of divergence.
 */
const CONFIRM_SCREEN_PARITY_THRESHOLD = 60; // percent

describe('screen parity: NUG confirm screen vs save 1', () => {
  it(`matches engine reference at ≥ ${CONFIRM_SCREEN_PARITY_THRESHOLD}% (actual ~67.2%)`, async () => {
    const savePath = join(WORKTREE_ROOT, 'tools', 'dosbox', 'save', '1.sav');

    // Render our frame
    const ourRgba = await renderNugConfirmScreen();

    // Decode engine reference
    const engineRgba = decodeEngineScreen(savePath);

    // Compare
    const result = compareRgba(ourRgba, engineRgba, { tolerance: 8 });

    // Write diff artifact to /tmp for inspection (does not affect pass/fail)
    try {
      const diffPath = '/tmp/diff-confirm-nug-test.png';
      writeDiffPng(ourRgba, engineRgba, diffPath, { tolerance: 8 });
      const ourPng = encodePngRgba(320, 200, new Uint8Array(ourRgba.buffer));
      writeFileSync('/tmp/our-confirm-nug-test.png', ourPng);
      console.log(
        `  match: ${result.matchPct.toFixed(2)}%  diff → ${diffPath}`,
      );
    } catch {
      // PNG artifact write failure is non-fatal
    }

    // Regression floor
    expect(result.matchPct).toBeGreaterThanOrEqual(CONFIRM_SCREEN_PARITY_THRESHOLD);
  }, 30_000); // allow 30s for font loading
});
