/**
 * parity.spec.ts — Route-based pixel-diff parity against DOSBox-X engine saves.
 *
 * Pattern: for each entry in PARITY_CASES, navigate to the viewer route that
 * shows a specific game screen, capture the 320×200 canvas RGBA via Playwright,
 * decode the matching DOSBox-X save via readVgaBlob + EGA_DEFAULT palette, and
 * run compareRgba to assert the match % ≥ threshold.
 *
 * ## How to add a new parity case
 *
 * 1. **Capture a save state** in DOSBox-X at the screen you want to validate:
 *    - Boot Wiz6 via `tools/dosbox/run-with-logging.sh` (or just `dosbox-x`)
 *    - Navigate to the screen
 *    - Press Alt-F5 to save state → `tools/dosbox/save/<n>.sav`
 *    - Note which save number you used and which screen it shows
 *
 * 2. **Find a viewer route** that displays the same screen content:
 *    - Must be a URL you can hit directly (no multi-step wizard state)
 *    - If the screen requires a specific character, the route may need query params
 *      or the page must auto-load the character by name/slot
 *    - If no direct route exists yet, you can: (a) add one, (b) use the headless
 *      harness (`tools/parity/screen-parity.ts`) instead, (c) leave as test.skip
 *
 * 3. **Add the entry to PARITY_CASES**:
 *    ```ts
 *    {
 *      description: 'character menu',
 *      route: '/castle/character-menu',
 *      savePath: 'tools/dosbox/save/N.sav',  // relative to repo root
 *      threshold: 50,   // start conservative; tighten after layout refinement
 *      skip: false,     // set true if no matching route yet
 *      skipReason: '',
 *    }
 *    ```
 *
 * 4. **Set the threshold conservatively** (e.g. 50%):
 *    - Run `pnpm test:e2e e2e/parity.spec.ts` to get the actual match %
 *    - Set threshold = actual − 10% (safety margin for minor refactors)
 *    - Document the actual match % in a comment beside the entry
 *
 * 5. **The diff PNG** is attached to the Playwright HTML report for visual inspection.
 *    Look for `artifacts/diff-<description>.png` in the test output.
 *
 * ## Current status
 *
 *   CHARACTER_MENU  — BLOCKED: no save state captured at the character menu screen.
 *     The character menu (MASTER OPTIONS → Characters → …) requires navigating to
 *     a specific save state. Once captured, enable the case below.
 *
 *   CONFIRM_SCREEN (NUG) — covered by the HEADLESS harness instead of Playwright,
 *     because the confirm screen isn't directly URL-addressable (it's a sub-state of
 *     the creation wizard). The headless test lives in:
 *       tools/parity/screen-parity.test.ts  (assertion)
 *       tools/parity/screen-parity.ts       (CLI harness with PNG artifacts)
 *
 * ## See also
 *   tools/parity/README.md — diff workflow + DOSBox capture instructions
 *   tools/parity/screen-parity.ts — headless confirm-screen parity harness
 *   tools/parity/diff-image.ts — compareRgba + writeDiffPng
 */

import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { captureCanvas, waitForNonBlankCanvas } from './lib/canvas.js';
import { compareRgba, writeDiffPng } from '../../../tools/parity/diff-image.js';
import { readVgaBlob } from '../../../packages/mcp/src/vga-palette.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ParityCase {
  /** Human-readable description (used in test name + artifact filenames). */
  description: string;
  /** Viewer route to navigate to (e.g. '/castle/character-menu'). */
  route: string;
  /**
   * Path to the DOSBox-X save state file, relative to the repo root.
   * E.g. 'tools/dosbox/save/1.sav'.
   */
  savePath: string;
  /**
   * Minimum acceptable match % (0–100). Start conservative; tighten after
   * confirming actual match and completing layout refinement.
   */
  threshold: number;
  /** If true, this test case is skipped (test.skip). */
  skip?: boolean;
  /** Reason for skipping — shown in the skip message. */
  skipReason?: string;
}

// ─── EGA decoder (mirrors decode-screen.ts, inlined to avoid circular deps) ─

const EGA_DEFAULT: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0], [0, 0, 170], [0, 170, 0], [0, 170, 170],
  [170, 0, 0], [170, 0, 170], [170, 85, 0], [170, 170, 170],
  [85, 85, 85], [85, 85, 255], [85, 255, 85], [85, 255, 255],
  [255, 85, 85], [255, 85, 255], [255, 255, 85], [255, 255, 255],
];

function decodeEngineScreen(savePath: string): Uint8Array {
  const blob = readVgaBlob(savePath);
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
      const [r, g, b] = EGA_DEFAULT[pixelIndex]!;
      const off = (y * W + x) * 4;
      rgba[off] = r; rgba[off + 1] = g; rgba[off + 2] = b; rgba[off + 3] = 0xff;
    }
  }
  return rgba;
}

// ─── PARITY_CASES table ──────────────────────────────────────────────────────

/**
 * Add new entries here as (save, route) pairs become available.
 * See file header comment for step-by-step instructions.
 */
const PARITY_CASES: ParityCase[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // CHARACTER MENU  — BLOCKED: no matching save captured yet.
  //
  // Save 1 shows the NUG confirm screen (screen-15), NOT the character menu.
  // The character menu requires a different save state (the empty character
  // menu at MASTER OPTIONS → Characters, before any character is created).
  //
  // TODO: capture a save at the character menu screen and enable this case.
  // Steps:
  //   1. Boot Wiz6, navigate to the character menu (no characters — fresh game)
  //   2. Alt-F5 → save to tools/dosbox/save/<n>.sav
  //   3. Update savePath below, set skip: false
  // ─────────────────────────────────────────────────────────────────────────
  {
    description: 'character-menu',
    route: '/castle/character-menu',
    savePath: 'tools/dosbox/save/PLACEHOLDER-no-save-yet.sav',
    threshold: 50,
    skip: true,
    skipReason:
      'No matching save state captured yet. ' +
      'Capture a save at the character menu screen (MASTER OPTIONS → Characters, empty roster) ' +
      'and update savePath + threshold. See file header for instructions.',
  },
];

// ─── Test runner ─────────────────────────────────────────────────────────────

/** Repo root — resolve save paths relative to here. */
const REPO_ROOT = resolve(new URL(import.meta.url).pathname, '..', '..', '..');

for (const c of PARITY_CASES) {
  const fn = c.skip ? test.skip : test;

  fn(
    `parity: ${c.description} ≥ ${c.threshold}%${c.skip ? ` [SKIP: ${c.skipReason}]` : ''}`,
    async ({ page }, testInfo) => {
      // Navigate and wait for canvas
      await page.goto(c.route);
      await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);

      // Capture viewer canvas
      const cap = await captureCanvas(page, 'canvas');
      expect(cap.width).toBe(320);
      expect(cap.height).toBe(200);

      // Decode engine reference
      const absoluteSavePath = resolve(REPO_ROOT, c.savePath);
      const engineRgba = decodeEngineScreen(absoluteSavePath);

      // Compare
      const result = compareRgba(new Uint8Array(cap.rgba), engineRgba, { tolerance: 8 });
      console.log(`  ${c.description}: match=${result.matchPct.toFixed(2)}% (threshold: ${c.threshold}%)`);

      // Write diff PNG and attach to report
      const artifactsDir = '/tmp/playwright-parity';
      try {
        mkdirSync(artifactsDir, { recursive: true });
        const diffPath = `${artifactsDir}/diff-${c.description}.png`;
        writeDiffPng(new Uint8Array(cap.rgba), engineRgba, diffPath, { tolerance: 8 });
        await testInfo.attach(`diff-${c.description}`, {
          path: diffPath,
          contentType: 'image/png',
        });

        // Also save our canvas capture as PNG
        const ourPath = `${artifactsDir}/ours-${c.description}.png`;
        const { encodePngRgba } = await import('../../cli/src/lib/png.js');
        const ourPng = encodePngRgba(320, 200, new Uint8Array(cap.rgba));
        writeFileSync(ourPath, ourPng);
        await testInfo.attach(`ours-${c.description}`, {
          path: ourPath,
          contentType: 'image/png',
        });
      } catch (err) {
        console.warn('Could not write diff artifact:', err);
      }

      // Assertion
      expect(result.matchPct).toBeGreaterThanOrEqual(c.threshold);
    },
  );
}
