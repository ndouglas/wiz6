/**
 * parity.spec.ts — Route-based pixel-diff parity against committed engine fixtures.
 *
 * Pattern: for each entry in PARITY_CASES, navigate to the viewer route that
 * shows a specific game screen, capture the 320×200 canvas RGBA via Playwright,
 * load the matching committed engine fixture (NOT a .sav file), and run
 * compareRgba to assert the match % ≥ threshold.
 *
 * ## Fixture-based approach (no .sav at test time)
 *
 * Fixtures live in `tools/parity/fixtures/engine/<name>.idx.gz` — committed
 * ground-truth EGA index arrays generated once from DOSBox-X save states via
 * `tools/parity/gen-fixture.ts`. At test time, the fixture is gunzipped and
 * the wiz6-main AC→DAC palette is applied to produce RGBA. No .sav needed.
 *
 * ## How to add a new parity case
 *
 * 1. **Capture a save state** in DOSBox-X at the screen you want to validate:
 *    - Boot Wiz6 via `tools/dosbox/run-with-logging.sh` (or just `dosbox-x`)
 *    - Navigate to the screen
 *    - Press Alt-F5 to save state → `tools/dosbox/save/<n>.sav`
 *
 * 2. **Generate the fixture** (one-time; commit the result):
 *    ```bash
 *    pnpm tsx tools/parity/gen-fixture.ts --save <n> --name <fixture-name>
 *    git add tools/parity/fixtures/engine/<fixture-name>.{idx.gz,png}
 *    ```
 *
 * 3. **Find a viewer route** that displays the same screen content.
 *    If no direct route exists: (a) add one, (b) use the headless harness
 *    (packages/viewer/tests/pages/roster/creation/ega/screen-parity.test.ts),
 *    or (c) leave as test.skip.
 *
 * 4. **Add the entry to PARITY_CASES**:
 *    ```ts
 *    {
 *      description: 'character menu',
 *      route: '/castle/character-menu',
 *      fixtureName: 'character-menu-partial',  // from fixtures/engine/
 *      threshold: 40,   // start conservative; tighten after layout refinement
 *      skip: false,
 *      skipReason: '',
 *    }
 *    ```
 *
 * 5. **Set the threshold conservatively** (e.g. 40%):
 *    - Run `pnpm test:e2e e2e/parity.spec.ts` to get the actual match %
 *    - Set threshold = actual − 10% (safety margin for minor refactors)
 *    - Document the actual match % in a comment beside the entry
 *
 * 6. **The diff PNG** is attached to the Playwright HTML report for visual inspection.
 *    Look for `artifacts/diff-<description>.png` in the test output.
 *
 * ## See also
 *   tools/parity/README.md — fixture workflow + capture instructions
 *   tools/parity/gen-fixture.ts — generate fixtures from .sav
 *   packages/viewer/tests/pages/roster/creation/ega/screen-parity.test.ts — headless parity
 *   tools/parity/diff-image.ts — compareRgba + writeDiffPng
 */

import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { gunzipSync } from 'zlib';
import { resolve, join } from 'path';
import { captureCanvas, waitForNonBlankCanvas } from './lib/canvas.js';
import { compareRgba, writeDiffPng } from '../../../tools/parity/diff-image.js';
import { indicesToRgba } from '../../../tools/parity/decode-screen.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ParityCase {
  /** Human-readable description (used in test name + artifact filenames). */
  description: string;
  /** Viewer route to navigate to (e.g. '/castle/character-menu'). */
  route: string;
  /**
   * Name of the committed engine fixture (without extension).
   * The file `tools/parity/fixtures/engine/<fixtureName>.idx.gz` must exist.
   * Generate via: pnpm tsx tools/parity/gen-fixture.ts --save <n> --name <fixtureName>
   */
  fixtureName: string;
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

// ─── Fixture loader (no .sav) ─────────────────────────────────────────────────

/** Repo root — resolve fixture paths relative to here. */
const REPO_ROOT = resolve(new URL(import.meta.url).pathname, '..', '..', '..');
const FIXTURES_ENGINE = join(REPO_ROOT, 'tools', 'parity', 'fixtures', 'engine');

/**
 * Load a committed engine fixture from tools/parity/fixtures/engine/<name>.idx.gz.
 * No .sav file needed — the fixture is the committed ground truth.
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

// ─── PARITY_CASES table ──────────────────────────────────────────────────────

/**
 * Add new entries here as (fixture, route) pairs become available.
 * See file header comment for step-by-step instructions.
 *
 * CHARACTER MENU — The route `/castle/character-menu` displays the roster
 * entry screen. The `character-menu-partial` fixture was decoded from save 1
 * (partial roster). The Playwright canvas must be loaded with partial roster
 * state for a meaningful comparison.
 *
 * NOTE: Until the viewer auto-loads a partial roster state at /castle/character-menu,
 * this test compares the DEFAULT (empty) render against the partial fixture, which
 * will have low match %. The test is left skip=true until the route renders a
 * roster-state-matching screen.
 *
 * For headless parity (no Playwright), see:
 *   packages/viewer/tests/pages/roster/creation/ega/screen-parity.test.ts
 */
const PARITY_CASES: ParityCase[] = [
  {
    description: 'character-menu',
    route: '/castle/character-menu',
    fixtureName: 'character-menu-partial',
    threshold: 40,
    // TODO: un-skip once the viewer route renders with a partial roster state.
    // The headless parity test covers this comparison in the meantime.
    skip: true,
    skipReason:
      'The /castle/character-menu route defaults to empty roster. The fixture ' +
      'is character-menu-partial (save 1). Once the route can be initialized with ' +
      'a partial roster state, update threshold + un-skip. ' +
      'Headless coverage: packages/viewer/tests/pages/roster/creation/ega/screen-parity.test.ts',
  },
];

// ─── Test runner ─────────────────────────────────────────────────────────────

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

      // Load engine fixture (no .sav read)
      const engineRgba = loadFixtureRgba(c.fixtureName);

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
