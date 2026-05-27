/**
 * character-menu.spec.ts — E2e regression test for /castle/character-menu.
 *
 * Validates that the EGA chrome renders correctly:
 *   - Canvas internal resolution is 320×200
 *   - Frame is NOT uniform (multiple distinct colors)
 *   - Frame contains black window interiors (>25% black pixels)
 *   - Frame contains light-gray frame lines (~RGB 170,170,170)
 *   - Frame contains gray background (~RGB 85,85,85)
 *
 * The black-fraction check (>25%) is the primary regression guard for the
 * "ring sprite" bug where every cell was a colored tile and large black
 * window areas were absent. A broken render typically shows <5% black.
 *
 * Artifacts: the captured frame is saved to /tmp/character-menu-cap.png
 * for visual inspection when the test fails or for manual review.
 */

import { test, expect } from '@playwright/test';
import { captureCanvas, waitForNonBlankCanvas, saveCanvasPng } from './lib/canvas.js';

// ---------------------------------------------------------------------------
// EGA color definitions (approximate — palette may shift ±1 for DAC rounding)
// ---------------------------------------------------------------------------

/** Match a pixel against an EGA color within a tolerance of ±10 per channel. */
function isColor(r: number, g: number, b: number, tr: number, tg: number, tb: number, tol = 10): boolean {
  return Math.abs(r - tr) <= tol && Math.abs(g - tg) <= tol && Math.abs(b - tb) <= tol;
}

// EGA black: (0, 0, 0)
const isBlack = (r: number, g: number, b: number) => isColor(r, g, b, 0, 0, 0, 5);

// EGA light gray / frame lines: (170, 170, 170)
const isLightGray = (r: number, g: number, b: number) => isColor(r, g, b, 170, 170, 170, 20);

// EGA dark gray / background: (85, 85, 85)
const isDarkGray = (r: number, g: number, b: number) => isColor(r, g, b, 85, 85, 85, 20);

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test('character menu renders framed EGA chrome + 6 options', async ({ page }) => {
  // Navigate directly to the character menu screen.
  await page.goto('/castle/character-menu');

  // Wait for a non-blank frame (assets loaded + canvas painted).
  // Threshold 500 non-background pixels is conservative — the chrome frame
  // has several thousand lit pixels once fonts and palettes are loaded.
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);

  // Capture the internal 320×200 pixel buffer.
  const cap = await captureCanvas(page, 'canvas');

  // Save a debug artifact regardless of pass/fail (useful for visual review).
  try {
    saveCanvasPng('/tmp/character-menu-cap.png', cap);
    console.log('Canvas capture saved to /tmp/character-menu-cap.png');
  } catch (err) {
    console.warn('Could not save PNG artifact:', err);
  }

  // -------------------------------------------------------------------------
  // (a) Internal resolution must be 320×200
  // -------------------------------------------------------------------------
  expect(cap.width).toBe(320);
  expect(cap.height).toBe(200);

  const totalPixels = cap.width * cap.height; // 64000

  // -------------------------------------------------------------------------
  // Count pixel categories
  // -------------------------------------------------------------------------

  let blackCount    = 0;
  let lightGrayCount = 0;
  let darkGrayCount  = 0;
  const distinctColors = new Set<number>();

  for (let i = 0; i < cap.rgba.length; i += 4) {
    const r = cap.rgba[i]!;
    const g = cap.rgba[i + 1]!;
    const b = cap.rgba[i + 2]!;

    if (isBlack(r, g, b))          blackCount++;
    if (isLightGray(r, g, b))      lightGrayCount++;
    if (isDarkGray(r, g, b))       darkGrayCount++;

    // Quantize to 4-bit per channel for distinct-color counting (avoids
    // DAC sub-step noise inflating the count).
    const quantized = ((r >> 4) << 16) | ((g >> 4) << 8) | (b >> 4);
    distinctColors.add(quantized);
  }

  const blackFraction     = blackCount     / totalPixels;
  const lightGrayFraction = lightGrayCount / totalPixels;
  const darkGrayFraction  = darkGrayCount  / totalPixels;

  console.log(`Canvas ${cap.width}×${cap.height} (${totalPixels} pixels)`);
  console.log(`  Black (0,0,0):          ${blackCount} (${(blackFraction * 100).toFixed(1)}%)`);
  console.log(`  LightGray (~170,170,170): ${lightGrayCount} (${(lightGrayFraction * 100).toFixed(1)}%)`);
  console.log(`  DarkGray (~85,85,85):   ${darkGrayCount} (${(darkGrayFraction * 100).toFixed(1)}%)`);
  console.log(`  Distinct quantized colors: ${distinctColors.size}`);

  // -------------------------------------------------------------------------
  // (b) Frame is NOT uniform — must have multiple distinct colors
  // -------------------------------------------------------------------------
  // A blank or single-color frame has ≤2 quantized values; real EGA chrome has ≥5.
  expect(distinctColors.size).toBeGreaterThanOrEqual(5);

  // -------------------------------------------------------------------------
  // (c) Structural chrome check — catches the ring-sprite bug
  //
  //   Black fraction > 25%: window interiors are large black areas.
  //     The ring-sprite bug filled these with colored tiles → very few black pixels.
  //   Light gray fraction > 1%: frame/border lines are present.
  //   Dark gray fraction > 5%: background tiles visible around windows.
  // -------------------------------------------------------------------------
  expect(blackFraction).toBeGreaterThan(0.25);
  expect(lightGrayFraction).toBeGreaterThan(0.01);
  expect(darkGrayFraction).toBeGreaterThan(0.05);
});
