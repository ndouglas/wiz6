/**
 * faithful-start-new-game.spec.ts — e2e for the START NEW GAME TIMED AUTO-PUSH
 * cutscene.
 *
 * Drives the REAL app through the full cutscene the engine runs when a new game
 * begins (docs/re/findings/maze-gate-open-animation.json). The entry is an
 * AUTO-PUSH cutscene — the party advances on a timer with NO per-step input,
 * pausing at text beats, while TWO portcullis gates lift open:
 *
 *   1. Seed a non-empty active party in localStorage.
 *   2. Navigate to /castle/start-new-game → StartNewGamePage loads level-0,
 *      calls initGameSession (entryMode:'door-open', gy=117), redirects to
 *      /game/maze.
 *   3. The WHOLE cutscene auto-plays on a self-rescheduling timer (no input):
 *        door-open (castle doors slide) → title (ENTERING) → approach1
 *        (APPROACHING + first gate closed) → gate1-open (first portcullis lifts)
 *        → walk → approach2 (HMMM + second gate closed) → gate2-open (second
 *        portcullis lifts) → free.
 *   4. Once 'free', the bottom strip shows the OPTIONS/TURN widget — NO stale
 *      HMMM (issue A).
 *   5. ArrowLeft turns the party; canvas changes (free control is live).
 *
 * ── ASSERTIONS (behavioral, no per-step ENTER) ──
 *  - The viewport ANIMATES on its own (many distinct viewport frames across the
 *    cutscene with NO input) — proves the door slide + auto-push + both gate
 *    lifts run on the timer (issues B, D, E).
 *  - The APPROACHING narration (yellow, palette idx 5) appears at some point
 *    during the cutscene WITHOUT any keypress (issue B: ENTERING auto-advances).
 *  - After the cutscene settles to free-roam, the bottom strip has ~0 yellow
 *    pixels — the stale HMMM is gone (issue A).
 *  - ArrowLeft changes the canvas (free-roam turn is live).
 *
 * The byte-exact full-screen per-frame gate (incl. the 8 door + 8 gate1 + 8 gate2
 * animation frames) lives in tests/game/newgame-sequence-parity.test.ts; this spec
 * proves the auto-push cutscene drives end-to-end to free control in the real app.
 */

import { test, expect } from '@playwright/test';
import { captureCanvas, waitForNonBlankCanvas, waitForStableCanvas } from './lib/canvas.js';

// ---------------------------------------------------------------------------
// Minimal party-member seed
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

/** Count EGA yellow (255,255,85) pixels in the bottom strip (y=140..175). The
 *  APPROACHING narration + HMMM text render in palette idx 5 = EGA yellow on
 *  black; the chrome there uses grays/black, NOT yellow. */
async function stripYellowPixels(page: import('@playwright/test').Page): Promise<number> {
  const cap = await captureCanvas(page, 'canvas');
  const { width, rgba } = cap;
  let count = 0;
  for (let y = 140; y <= 175; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (rgba[i] === 255 && rgba[i + 1] === 255 && rgba[i + 2] === 85) count++;
    }
  }
  return count;
}

/** Single-round-trip sample: the viewport hash AND the strip yellow-pixel count,
 *  read from one getImageData call (halves the page round-trips during the
 *  cutscene sampling loop, which keeps the spec well under its timeout). */
async function sampleViewportAndYellow(
  page: import('@playwright/test').Page,
): Promise<{ vpHash: number; yellow: number }> {
  return page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!c) return { vpHash: -1, yellow: 0 };
    const ctx = c.getContext('2d');
    if (!ctx) return { vpHash: -1, yellow: 0 };
    const W = c.width;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    // Viewport hash (MAZE_VIEWPORT = x16..191 / y8..119).
    let h = 0x811c9dc5;
    for (let y = 8; y < 120; y++) {
      for (let x = 16; x < 192; x++) {
        const i = (y * W + x) * 4;
        h ^= d[i]!;
        h = Math.imul(h, 0x01000193);
        h ^= d[i + 1]!;
        h = Math.imul(h, 0x01000193);
        h ^= d[i + 2]!;
        h = Math.imul(h, 0x01000193);
      }
    }
    // Strip yellow (255,255,85) count, y140..175.
    let yellow = 0;
    for (let y = 140; y <= 175; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 85) yellow++;
      }
    }
    return { vpHash: h >>> 0, yellow };
  });
}

/** Cheap content hash of the full 320×200 canvas (detects ANY frame change). */
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
//
// The cutscene runs ~15s wall-clock (CUTSCENE_TICK_MS=200, see MazeView.tsx).
// Give the test a generous timeout for the auto-paced cadence.
// ---------------------------------------------------------------------------

test('START NEW GAME: cutscene auto-plays (doors + both gates animate, no input) → free → arrow turns view', async ({
  page,
}) => {
  test.setTimeout(60_000);

  // ── Step 1: Seed a non-empty active party ────────────────────────────────
  await page.goto('/');
  await page.evaluate((members) => {
    window.localStorage.setItem('wiz6:active-party', JSON.stringify({ schemaVersion: 1, members }));
  }, [seedMember(0, 'THESUS')]);

  // ── Step 2: Navigate to /castle/start-new-game → redirects to /game/maze ──
  await page.goto('/castle/start-new-game');
  await page.waitForURL('**/game/maze', { timeout: 15_000 });
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);

  // ── Step 3: The cutscene AUTO-PLAYS — sample the viewport across it with NO
  //     input. Over ~15s we sample every 250ms (~60 samples). The door slide,
  //     auto-push movement, and BOTH portcullis lifts all change the viewport, so
  //     we expect MANY distinct viewport frames — proving the timed auto-push +
  //     gate animations run without any keypress (issues B, D, E). We also catch
  //     the peak yellow-pixel count (the APPROACHING narration auto-appears).
  const viewportFrames = new Set<number>();
  let peakYellow = 0;
  // ~18s window (72 × 250ms) brackets the whole ~15s cutscene; one round-trip
  // per sample keeps the spec comfortably under its 60s timeout.
  for (let i = 0; i < 72; i++) {
    const { vpHash, yellow } = await sampleViewportAndYellow(page);
    viewportFrames.add(vpHash);
    peakYellow = Math.max(peakYellow, yellow);
    await page.waitForTimeout(250);
  }
  expect(
    viewportFrames.size,
    `cutscene should ANIMATE the viewport over many distinct frames with NO input ` +
      `(door slide + auto-push + two gate lifts), saw ${viewportFrames.size} distinct viewport hashes`,
  ).toBeGreaterThan(4);
  expect(
    peakYellow,
    `the APPROACHING narration (yellow idx 5) should auto-appear during the cutscene ` +
      `with NO input (issue B: ENTERING auto-advances), peak yellow seen = ${peakYellow}`,
  ).toBeGreaterThan(500);

  // ── Step 4: Let the cutscene fully settle to free-roam ───────────────────
  await waitForStableCanvas(page, 'canvas');

  // Issue A: in free-roam the bottom strip shows the OPTIONS/TURN widget — the
  // stale HMMM must be GONE (~0 yellow pixels in the strip band).
  const yellowFree = await stripYellowPixels(page);
  expect(
    yellowFree,
    `free-roam strip should have NO yellow HMMM pixels (issue A: stale HMMM gone), got ${yellowFree}`,
  ).toBeLessThan(100);

  // ── Step 5: ArrowLeft turns the party (free control is live) ─────────────
  const hashBeforeTurn = await canvasHash(page);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(200);
  await waitForStableCanvas(page, 'canvas');
  const hashAfterTurn = await canvasHash(page);
  expect(
    hashAfterTurn,
    "Canvas should change after ArrowLeft (free-roam turn proves entryMode='free')",
  ).not.toBe(hashBeforeTurn);
});
