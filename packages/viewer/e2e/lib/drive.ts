import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { resolve, join } from 'path';
import { captureCanvas, waitForNonBlankCanvas } from './canvas.js';
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

/** Assert the live <canvas> matches the named engine fixture byte-exact (tolerance 0). */
export async function expectCanvasMatchesFixture(page: Page, name: string, tolerance = 0): Promise<void> {
  const cap = await captureCanvas(page, 'canvas');
  expect(cap.width).toBe(320);
  expect(cap.height).toBe(200);
  const result = compareRgba(new Uint8Array(cap.rgba), loadFixtureRgba(name), { tolerance });
  expect(result.matchPct, `${name}: ${result.matchPct.toFixed(2)}% match`).toBe(100);
}
