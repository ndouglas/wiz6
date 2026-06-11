import { expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync } from 'fs';
import { gunzipSync } from 'zlib';
import { resolve, join } from 'path';
import {
  captureCanvas,
  waitForNonBlankCanvas,
  waitForStableCanvas,
  saveCanvasPng,
} from './canvas.js';
import { compareRgba } from '../../../../tools/parity/diff-image.js';
import { indicesToRgba } from '../../../../tools/parity/decode-screen.js';
import type { CreationStatePartial } from './creation-states.js';

// e2e/lib/drive.ts is four levels up from repo root:
//   packages/viewer/e2e/lib/drive.ts → ../../../../ = repo root
const REPO_ROOT = resolve(new URL(import.meta.url).pathname, '..', '..', '..', '..', '..');
const FIXTURES_ENGINE = join(REPO_ROOT, 'tools', 'parity', 'fixtures', 'engine');

/** Inject a creation state BEFORE navigation, then goto the creation route + wait for paint. */
export async function gotoCreation(page: Page, injected?: CreationStatePartial): Promise<void> {
  if (injected) {
    await page.addInitScript((s) => {
      (window as unknown as { __WIZ6_E2E_STATE__: unknown }).__WIZ6_E2E_STATE__ = s;
    }, injected);
  }
  await page.goto('/castle/character-menu');
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);
}

/** Fire a keydown sequence on window, settling between keys so the canvas re-renders. */
export async function pressKeys(page: Page, keys: string[]): Promise<void> {
  for (const key of keys) {
    await page.keyboard.press(key);
    await page.waitForTimeout(60);
  }
}

/** Load a committed engine fixture as a 320×200 RGBA buffer. */
export function loadFixtureRgba(name: string): Uint8Array {
  const raw = gunzipSync(readFileSync(join(FIXTURES_ENGINE, `${name}.idx.gz`)));
  if (raw.length !== 64000) throw new Error(`Fixture "${name}": expected 64000 bytes, got ${raw.length}`);
  return indicesToRgba(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
}

const ARTIFACT_DIR = join(REPO_ROOT, 'packages', 'viewer', 'test-results');

/** The maze first-person viewport rect within the 320×200 screen (MAZE_VIEWPORT
 *  in @wiz6/data corridor-geometry). The chrome OUTSIDE it (party panel, bottom
 *  OPTIONS/TURN strip) is party-dependent — the engine fixture's party differs
 *  from the seeded test party — so maze-walk fixtures compare ONLY this rect. */
const MAZE_VP = { x: 72, y: 32, w: 176, h: 112 } as const;

/** Crop a 320×200 RGBA buffer to the MAZE_VP rect (→ 176×112 RGBA). */
function cropMazeViewport(rgba: Uint8Array, screenW = 320): Uint8Array {
  const { x, y, w, h } = MAZE_VP;
  const out = new Uint8Array(w * h * 4);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const s = ((y + r) * screenW + (x + c)) * 4;
      const d = (r * w + c) * 4;
      out[d] = rgba[s]!;
      out[d + 1] = rgba[s + 1]!;
      out[d + 2] = rgba[s + 2]!;
      out[d + 3] = rgba[s + 3]!;
    }
  }
  return out;
}

/** Assert the live <canvas>'s MAZE VIEWPORT region matches the named engine
 *  fixture byte-exact (RGB, tolerance 0), ignoring the party-dependent chrome
 *  around it. The fixture is a full 320×200 engine frame captured INDEPENDENTLY
 *  via `trace-maze.ts freeroam <gx> <gy> <facing>` (clean play-through). This is
 *  the convergence check the render-vs-stored-oracle gate structurally can't be:
 *  it pins the real app's render to the engine's actual walk-there view. */
export async function expectMazeViewportMatchesFixture(
  page: Page,
  name: string,
): Promise<void> {
  await waitForStableCanvas(page, 'canvas');
  const cap = await captureCanvas(page, 'canvas');
  expect(cap.width).toBe(320);
  expect(cap.height).toBe(200);
  const actual = cropMazeViewport(new Uint8Array(cap.rgba));
  const fixture = cropMazeViewport(loadFixtureRgba(name));
  const total = MAZE_VP.w * MAZE_VP.h;
  let diff = 0;
  let first: { x: number; y: number } | undefined;
  for (let p = 0; p < total; p++) {
    const i = p * 4;
    if (actual[i] !== fixture[i] || actual[i + 1] !== fixture[i + 1] || actual[i + 2] !== fixture[i + 2]) {
      diff++;
      if (!first) first = { x: p % MAZE_VP.w, y: Math.floor(p / MAZE_VP.w) };
    }
  }
  const matchPct = (100 * (total - diff)) / total;
  if (diff !== 0) {
    try {
      mkdirSync(ARTIFACT_DIR, { recursive: true });
      saveCanvasPng(join(ARTIFACT_DIR, `MISMATCH-${name}.png`), cap);
    } catch {
      // best-effort artifact
    }
  }
  expect(
    diff,
    `${name}: maze viewport ${matchPct.toFixed(2)}% match (${diff}/${total} px differ, first at viewport ${first ? `${first.x},${first.y}` : 'n/a'})`,
  ).toBe(0);
}

// ---------------------------------------------------------------------------
// OPTIONS strip helpers
// ---------------------------------------------------------------------------

/** The PARTY OPTIONS bottom-strip rect within the 320×200 screen.
 *  Mirrors OPTIONS_STRIP in @wiz6/data (hardcoded here to avoid a cross-package
 *  import, matching how MAZE_VP is handled above). */
const OPTIONS_STRIP = { x: 0, y: 144, w: 160, h: 40 } as const;

/** Crop a 320×200 RGBA buffer to the OPTIONS_STRIP rect (→ 160×40 RGBA). */
function cropOptionsStrip(rgba: Uint8Array, screenW = 320): Uint8Array {
  const { x, y, w, h } = OPTIONS_STRIP;
  const out = new Uint8Array(w * h * 4);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const s = ((y + r) * screenW + (x + c)) * 4;
      const d = (r * w + c) * 4;
      out[d] = rgba[s]!;
      out[d + 1] = rgba[s + 1]!;
      out[d + 2] = rgba[s + 2]!;
      out[d + 3] = rgba[s + 3]!;
    }
  }
  return out;
}

/** Assert the live <canvas>'s OPTIONS STRIP region matches the named engine
 *  fixture byte-exact (RGB, tolerance 0). Settles the canvas first (same as
 *  expectMazeViewportMatchesFixture). The cursor is settle-invariant (no blink),
 *  so tolerance 0 is correct. */
export async function expectOptionsStripMatchesFixture(
  page: Page,
  name: string,
): Promise<void> {
  await waitForStableCanvas(page, 'canvas');
  const cap = await captureCanvas(page, 'canvas');
  expect(cap.width).toBe(320);
  expect(cap.height).toBe(200);
  const actual = cropOptionsStrip(new Uint8Array(cap.rgba));
  const fixture = cropOptionsStrip(loadFixtureRgba(name));
  const total = OPTIONS_STRIP.w * OPTIONS_STRIP.h;
  let diff = 0;
  let first: { x: number; y: number } | undefined;
  for (let p = 0; p < total; p++) {
    const i = p * 4;
    if (actual[i] !== fixture[i] || actual[i + 1] !== fixture[i + 1] || actual[i + 2] !== fixture[i + 2]) {
      diff++;
      if (!first) first = { x: p % OPTIONS_STRIP.w, y: Math.floor(p / OPTIONS_STRIP.w) };
    }
  }
  const matchPct = (100 * (total - diff)) / total;
  if (diff !== 0) {
    try {
      mkdirSync(ARTIFACT_DIR, { recursive: true });
      saveCanvasPng(join(ARTIFACT_DIR, `MISMATCH-${name}.png`), cap);
    } catch {
      // best-effort artifact
    }
  }
  expect(
    diff,
    `${name}: options strip ${matchPct.toFixed(2)}% match (${diff}/${total} px differ, first at strip ${first ? `${first.x},${first.y}` : 'n/a'})`,
  ).toBe(0);
}

/** Return the number of mismatching pixels between the live <canvas>'s OPTIONS
 *  STRIP and the named engine fixture. Used for negative assertions (e.g. after
 *  Escape closes the menu, the strip should NO LONGER match the menu fixture). */
export async function optionsStripDiffersFromFixture(
  page: Page,
  name: string,
): Promise<number> {
  await waitForStableCanvas(page, 'canvas');
  const cap = await captureCanvas(page, 'canvas');
  const actual = cropOptionsStrip(new Uint8Array(cap.rgba));
  const fixture = cropOptionsStrip(loadFixtureRgba(name));
  const total = OPTIONS_STRIP.w * OPTIONS_STRIP.h;
  let diff = 0;
  for (let p = 0; p < total; p++) {
    const i = p * 4;
    if (actual[i] !== fixture[i] || actual[i + 1] !== fixture[i + 1] || actual[i + 2] !== fixture[i + 2]) {
      diff++;
    }
  }
  return diff;
}

/** Assert the live <canvas> matches the named engine fixture byte-exact (tolerance 0). */
export async function expectCanvasMatchesFixture(page: Page, name: string, tolerance = 0): Promise<void> {
  // Wait for a fully-settled frame before reading. The picker/char-view compose
  // from several async-loaded asset layers (fonts, pics, portraits), each
  // triggering its own re-paint; a slow CI runner can otherwise capture a
  // partial frame. This is a settle (not a tolerance relaxation) — the assert
  // below remains byte-exact.
  await waitForStableCanvas(page, 'canvas');
  const cap = await captureCanvas(page, 'canvas');
  expect(cap.width).toBe(320);
  expect(cap.height).toBe(200);
  const result = compareRgba(new Uint8Array(cap.rgba), loadFixtureRgba(name), { tolerance });
  // On mismatch, dump the ACTUAL captured 320×200 canvas as a PNG into
  // test-results/ so CI (which uploads that dir on failure) preserves the real
  // composed pixels — the default Playwright page screenshot is CSS-scaled and
  // loses the internal buffer.
  if (result.matchPct !== 100) {
    try {
      mkdirSync(ARTIFACT_DIR, { recursive: true });
      saveCanvasPng(join(ARTIFACT_DIR, `MISMATCH-${name}.png`), cap);
    } catch {
      // best-effort artifact; never let it mask the real assertion failure
    }
  }
  expect(result.matchPct, `${name}: ${result.matchPct.toFixed(2)}% match`).toBe(100);
}
