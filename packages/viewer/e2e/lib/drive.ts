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
