/**
 * screen-parity.ts — headless parity harness: our render vs. the engine.
 *
 * Reconstructs the NUG confirm-screen render (screen-15: "SAVE THIS CHARACTER?")
 * using the same window-building + renderCreationFrame path that the browser uses,
 * then compares pixel-by-pixel against the engine's 320×200 RGBA from save 1.
 *
 * NUG's known fields (from MCP decode of save 1):
 *   name:       "NUG"
 *   race:       1   (Elf)
 *   sex:        0   (Male)
 *   class:      13  (Ninja)
 *   attributes: STR=12, INT=10, PIE=10, VIT=12, DEX=12, SPD=12, PER=8, KAR=13
 *   hp:         6
 *   stamina:    108
 *   gold:       (derived, not needed for the screen — rendered from draft.derived)
 *
 * Run:
 *   pnpm tsx tools/parity/screen-parity.ts
 *
 * Outputs:
 *   /tmp/our-confirm-nug.png       — our rendered frame
 *   /tmp/engine-screen-1.png       — engine reference frame (written by decode-screen)
 *   /tmp/diff-confirm-nug.png      — diff PNG (red = mismatch)
 *   Prints matchPct + summary of first diverging pixels.
 *
 * The match % is the ground truth for the current render quality. It is used as
 * the regression floor in the parity test (with a small margin).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Workspace imports (relative to tools/parity/ → 2 levels up)
import { readVgaBlob } from '../../packages/mcp/src/vga-palette.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import { FontSchema, Font4bppSchema, MessageDbSchema, WIZ6_MAIN } from '../../packages/data/src/index.js';
import type { Font, Font4bpp, MessageDb } from '../../packages/data/src/index.js';
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

// ─── Resolve paths ───────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = resolve(__dirname, '..', '..');

/**
 * Resolve the main checkout root from the worktree's .git file.
 * In a git worktree, .git is a file: "gitdir: /path/to/.git/worktrees/<name>"
 * Main checkout root = parent of that .git dir.
 */
function findMainCheckoutRoot(): string {
  const gitFilePath = join(WORKTREE_ROOT, '.git');
  let gitContent: string;
  try {
    gitContent = readFileSync(gitFilePath, 'utf-8');
  } catch {
    return WORKTREE_ROOT; // fallback: assume main checkout
  }
  const match = /gitdir:\s*(.+)/.exec(gitContent);
  if (!match) return WORKTREE_ROOT;
  const gitDir = match[1]!.trim();
  // gitDir = /path/to/main/.git/worktrees/<name> → strip /worktrees/<name> → .git parent
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

// ─── NUG's known fields from MCP decode of save 1 ────────────────────────────

const NUG = {
  name: 'NUG',
  race: 1,      // Elf
  sex: 0,       // Male
  class: 13,    // Ninja
  attributes: { str: 12, int: 10, pie: 10, vit: 12, dex: 12, spd: 12, per: 8, kar: 13 },
  derived: {
    hpInitial: 6,
    stamina: 108,
    // goldInitial is not directly observed in save 1 screen; use the formula result
    // from the engine. If unknown, leave undefined — the screen renders "?" gracefully.
    goldInitial: undefined as number | undefined,
  },
} as const;

// ─── Render the confirm screen headlessly ────────────────────────────────────

/**
 * Build the confirm-screen window set and render to a 320×200 RGBA frame,
 * mirroring exactly what ConfirmScreen.tsx does in the browser (cursor=0/YES).
 *
 * This replicates the render path from ConfirmScreen.tsx without any React:
 *   1. createPersistentWindows() → top + bottomBar
 *   2. renderCharSheet(top, ...)  — name, race/sex, class, attrs, HP/STM/GOLD
 *   3. bottomBar: prompt line + YES/NO picker (cursor=0 highlighted)
 *   4. renderCreationFrame([top, bottomBar], fontSet, palette)
 */
async function renderNugConfirmScreen(): Promise<Uint8ClampedArray> {
  const fontSet = await loadCreationFontSet({
    loadFont: diskLoadFont,
    loadFont4bpp: diskLoadFont4bpp,
  });
  const db = loadMessageDb();

  const { top, bottomBar } = createPersistentWindows();
  const pal = WIZ6_MAIN;

  // ── top window: character sheet (mirrors renderCharSheet in ConfirmScreen.tsx) ──
  const attr = top.cells[1] ?? 0x14;

  // Row 0: name
  setCursor(top, 0, 0);
  puts(top, NUG.name, attr);

  // Row 1: race + sex
  const raceStr = raceName(db, NUG.race);
  const sexStr = sexName(db, NUG.sex);
  setCursor(top, 0, 1);
  puts(top, `${raceStr} ${sexStr}`, attr);

  // Row 2: class
  const classStr = className(db, NUG.class);
  setCursor(top, 0, 2);
  puts(top, classStr, attr);

  // Row 4: STR / INT / PIE / VIT
  const { str, int: intVal, pie, vit, dex, spd, per, kar } = NUG.attributes;
  setCursor(top, 0, 4);
  puts(top, `STR:${str}  INT:${intVal}  PIE:${pie}  VIT:${vit}`, attr);

  // Row 5: DEX / SPD / PER / KAR
  setCursor(top, 0, 5);
  puts(top, `DEX:${dex}  SPD:${spd}  PER:${per}  KAR:${kar}`, attr);

  // Row 7: HP / STM / GOLD
  const hp = NUG.derived.hpInitial;
  const stm = NUG.derived.stamina;
  const gold = NUG.derived.goldInitial ?? '?';
  setCursor(top, 0, 7);
  puts(top, `HP:${hp}  STM:${stm}  GOLD:${gold}`, attr);

  // ── bottomBar: prompt + YES/NO picker (cursor=0=YES) ──
  const promptText = creationString(db, MSG.confirmPrompt);
  if (promptText) {
    setCursor(bottomBar, 0, 0);
    puts(bottomBar, promptText, bottomBar.cells[1] ?? 0x13);
  }

  const optionAttr = bottomBar.cells[1] ?? 0x13;
  const options = ['YES', 'NO'] as const;
  for (let i = 0; i < options.length; i++) {
    let label: string;
    if (i === 0) {
      label = creationString(db, MSG.confirmOptions) || options[i];
    } else {
      label = options[i]!;
    }
    setCursor(bottomBar, 0, 1 + i);
    puts(bottomBar, label, optionAttr);
    if (i === 0) {
      // cursor=0 (YES highlighted) — same as initial state in ConfirmScreen
      highlightRow(bottomBar, 1 + i, 5);
    }
  }

  return renderCreationFrame([top, bottomBar], fontSet, pal);
}

// ─── Decode engine reference ─────────────────────────────────────────────────

/**
 * Decode the engine's 320×200 RGBA from save 1 (the NUG confirm screen).
 * Mirrors what decode-screen.ts does internally.
 */
function decodeEngineScreen(savePath: string): Uint8Array {
  const blob = readVgaBlob(savePath);

  // ── EGA_DEFAULT palette (same as decode-screen.ts) ──
  const EGA: ReadonlyArray<readonly [number, number, number]> = [
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
  const BYTES_PER_ROW = 40;
  const W = 320;
  const H = 200;
  const PLANES = 4;

  // DOSBox-X internal state contamination ranges (see decode-screen.ts)
  const DOSBOX_INTERNAL_START = 0x0810E0;
  const DOSBOX_INTERNAL_END   = 0x08171F;
  const VGA_STATE_START       = 0x82F70;
  const VGA_STATE_END         = 0x838CE;

  const rgba = new Uint8Array(W * H * 4);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const vgaAddr = y * BYTES_PER_ROW + (x >> 3);
      const blobBase = VRAM_OFFSET + vgaAddr * PLANES;
      const bitPos = 7 - (x & 7);

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
        pixelIndex =
          ((b0 >> bitPos) & 1) |
          (((b1 >> bitPos) & 1) << 1) |
          (((b2 >> bitPos) & 1) << 2) |
          (((b3 >> bitPos) & 1) << 3);
      }

      const [r, g, b] = EGA[pixelIndex]!;
      const off = (y * W + x) * 4;
      rgba[off] = r;
      rgba[off + 1] = g;
      rgba[off + 2] = b;
      rgba[off + 3] = 0xff;
    }
  }

  return rgba;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('screen-parity: NUG confirm screen (save 1)');
  console.log('');

  // 1. Render ours
  console.log('Rendering NUG confirm screen (headless)...');
  const ourRgba = await renderNugConfirmScreen();
  const ourPng = encodePngRgba(320, 200, new Uint8Array(ourRgba.buffer));
  const ourPath = '/tmp/our-confirm-nug.png';
  writeFileSync(ourPath, ourPng);
  console.log(`  → ${ourPath}`);

  // 2. Decode engine reference
  const savePath = join(WORKTREE_ROOT, 'tools', 'dosbox', 'save', '1.sav');
  console.log(`Decoding engine screen from ${savePath}...`);
  const engineRgba = decodeEngineScreen(savePath);
  const enginePng = encodePngRgba(320, 200, engineRgba);
  const enginePath = '/tmp/engine-screen-1.png';
  writeFileSync(enginePath, enginePng);
  console.log(`  → ${enginePath}`);

  // 3. Diff
  console.log('Comparing...');
  const result = compareRgba(ourRgba, engineRgba, { tolerance: 8 });
  const diffPath = '/tmp/diff-confirm-nug.png';
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
  console.log(`  engine: ${enginePath}`);
  console.log(`  diff:   ${diffPath}`);
}

main().catch((err) => {
  console.error('screen-parity failed:', err);
  process.exit(1);
});
