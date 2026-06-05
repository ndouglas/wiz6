/**
 * faithful-start-new-game.spec.ts — e2e for the START NEW GAME scripted entry.
 *
 * Drives the REAL app through the full sequence the engine runs when a new
 * game begins (docs/re/findings/maze-start-new-game.json):
 *
 *   1. Seed a non-empty active party in localStorage.
 *   2. Navigate to /castle/start-new-game → StartNewGamePage loads level-0,
 *      calls initGameSession (entryMode:'narration'), redirects to /game/maze.
 *   3. MazeView renders the narration strip (3 lines on the bottom band).
 *   4. Enter dismisses the narration (→ entryMode:'gate-walk').
 *   5. Enter ×3 force-walks the party gy 118→121 (→ entryMode:'free').
 *   6. ArrowLeft turns the party; canvas changes (proving free-roam is live).
 *
 * Pixel assertions are behavioral (non-blank strip check + canvas-diff after
 * arrow) rather than byte-exact fixture comparisons; the byte-exact narration
 * gate lives in maze-entry-narration-parity.test.ts.
 */

import { test, expect } from '@playwright/test';
import { captureCanvas, waitForNonBlankCanvas, waitForStableCanvas } from './lib/canvas.js';

// ---------------------------------------------------------------------------
// Minimal party-member seed (same shape as castle-menu-nav.spec.ts / dismiss-member-flow.spec.ts)
// ---------------------------------------------------------------------------

function seedMember(idx: number, name: string) {
  return {
    id: `00000000-0000-4000-8000-000000000${String(idx + 1).padStart(3, '0')}`,
    name,
    race: 0,
    class: 0,
    sex: 0,
    level: 1,
    savedOldLevel: 0,
    xp: 0,
    gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false,
    paralyzed: false,
    attributes: { str: 10, int: 10, pie: 10, vit: 10, dex: 10, spd: 10, per: 10, kar: 10 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    reaction: 0,
    portraitSlotId: idx,
    rosterCharacterId: `00000000-0000-4000-8000-000000000${String(idx + 1).padStart(3, '0')}`,
    portraitIndex: 0,
    hpCurrent: 8,
    hpMax: 8,
    staminaCurrent: 100,
    staminaMax: 100,
    age: 6570,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Count EGA yellow (255,255,85) pixels in the bottom narration strip
 * (y=140..175).
 *
 * The narration text is rendered in palette index 5 = EGA yellow (255,255,85)
 * on a black background (confirmed from the maze-entry-narration fixture:
 * ~2202 yellow pixels in that band). The chrome in that region uses grays
 * (indices 8/9) and black, NOT yellow. After Enter dismisses narration the
 * yellow glyph pixels disappear.
 */
async function narrationStripYellowPixels(page: import('@playwright/test').Page): Promise<number> {
  const cap = await captureCanvas(page, 'canvas');
  const { width, rgba } = cap;
  let count = 0;
  for (let y = 140; y <= 175; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = rgba[i]!;
      const g = rgba[i + 1]!;
      const b = rgba[i + 2]!;
      // EGA yellow = (255, 255, 85). Only narration text produces this in the strip.
      if (r === 255 && g === 255 && b === 85) count++;
    }
  }
  return count;
}

/**
 * Compute a cheap content hash of the full 320×200 canvas buffer.
 * Used to detect that a frame changed after a keypress.
 */
async function canvasHash(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!c) return -1;
    const ctx = c.getContext('2d');
    if (!ctx) return -1;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let h = 0x811c9dc5;
    for (let i = 0; i < d.length; i++) {
      h ^= d[i]!;
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  });
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test('START NEW GAME: narration → Enter dismisses → Enter×3 gate-walk → arrow turns view', async ({ page }) => {
  // ── Step 1: Seed a non-empty active party ────────────────────────────────
  // Navigate to the root first so the app is loaded + localStorage is accessible.
  await page.goto('/');
  await page.evaluate((members) => {
    window.localStorage.setItem(
      'wiz6:active-party',
      JSON.stringify({ schemaVersion: 1, members }),
    );
  }, [seedMember(0, 'THESUS')]);

  // ── Step 2: Navigate to /castle/start-new-game ───────────────────────────
  // StartNewGamePage reads the active party, loads level-0.json, calls
  // initGameSession (entryMode:'narration', gy=118, stepsRemaining=3), then
  // navigates to /game/maze.
  await page.goto('/castle/start-new-game');

  // Wait for the redirect to /game/maze.
  await page.waitForURL('**/game/maze', { timeout: 15_000 });

  // Wait for the MazeView canvas to render a non-blank frame (assets load async).
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);

  // Wait for assets to settle (maze + narration font + message db all load
  // independently; give them a beat to all paint before asserting).
  await waitForStableCanvas(page, 'canvas');

  // ── Step 3: Assert narration text (yellow glyphs) is present ────────────
  // The narration text is palette index 5 = EGA yellow (255,255,85). The
  // engine fixture has ~2202 yellow pixels in the strip. Chrome uses grays,
  // not yellow, so any substantial yellow count means narration is active.
  const yellowBefore = await narrationStripYellowPixels(page);
  expect(
    yellowBefore,
    `narration strip should have ≥ 500 yellow (255,255,85) glyph pixels when entryMode='narration', got ${yellowBefore}`,
  ).toBeGreaterThan(500);

  // ── Step 4: Enter dismisses narration (→ gate-walk) ──────────────────────
  await page.keyboard.press('Enter');
  // Give the RAF a couple frames to re-render.
  await page.waitForTimeout(200);
  await waitForStableCanvas(page, 'canvas');

  const yellowAfterEnter = await narrationStripYellowPixels(page);
  // After dismissal, the narration text (yellow glyphs) should be gone from
  // the strip. The chrome uses grays/blacks there — near-zero yellow pixels.
  expect(
    yellowAfterEnter,
    `narration yellow glyphs should be gone after Enter (entryMode='gate-walk'), got ${yellowAfterEnter}`,
  ).toBeLessThan(100);

  // ── Step 5: Enter ×3 force-walks the party (gate-walk → free) ────────────
  // Each Enter steps the party forward one cell. After 3 presses,
  // stepsRemaining hits 0 and entryMode transitions to 'free'.
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
  }
  await waitForStableCanvas(page, 'canvas');

  // ── Step 6: Arrow key turns the view (free control is live) ──────────────
  // Capture the canvas before the turn.
  const hashBeforeTurn = await canvasHash(page);

  // ArrowLeft turns the party left; the viewport should re-render to a new
  // facing direction — the canvas hash must change.
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(200);
  await waitForStableCanvas(page, 'canvas');

  const hashAfterTurn = await canvasHash(page);
  expect(
    hashAfterTurn,
    'Canvas should change after ArrowLeft (free-roam turn proves entryMode=\'free\')',
  ).not.toBe(hashBeforeTurn);
});
