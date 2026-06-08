/**
 * faithful-start-new-game.spec.ts — e2e for the START NEW GAME animated scripted entry.
 *
 * Drives the REAL app through the full sequence the engine runs when a new
 * game begins (docs/re/findings/maze-start-new-game.json +
 * maze-gate-open-animation.json), INCLUDING the two viewport animations the
 * user recalls (castle doors slide apart on entry; the dungeon portcullis lifts
 * as the party reaches the gate):
 *
 *   1. Seed a non-empty active party in localStorage.
 *   2. Navigate to /castle/start-new-game → StartNewGamePage loads level-0,
 *      calls initGameSession (entryMode:'door-open', gy=117), redirects to
 *      /game/maze.
 *   3. DOOR-OPEN (auto-animates): on mount the castle-door slide-apart animation
 *      AUTO-PLAYS on a self-rescheduling timer (8 frames × ANIM_FRAME_MS=90ms ≈
 *      720ms), then transitions to 'title' (the ENTERING still). We capture an
 *      EARLY frame (mid-slide) and a SETTLED frame (after the slide finishes) and
 *      assert the doors visibly MOVED (hashes differ) — no Enter pressed during it.
 *   4. Enter advances title → narration; MazeView renders the yellow narration strip.
 *   5. Enter dismisses the narration (yellow glyphs gone) → gate-walk (gy 118→119).
 *   6. Enter from gate-walk steps to the gate cell (gy 119→120) → gate-open: the
 *      PORTCULLIS lift AUTO-ANIMATES on the timer (8 frames). We capture hashes a
 *      few frames apart WHILE NO ENTER IS PRESSED and assert a timer-driven change
 *      occurs during the lift. The animation then transitions to bump (gy=121).
 *   7. Enter from bump (gy=121, dead-end) → free.
 *   8. ArrowLeft turns the party; canvas changes (proving free-roam is live).
 *
 * Beat order (FSM, packages/parser/src/maze/entry-sequence.ts):
 *   door-open (auto→title) → [Enter] title→narration(gy118) →
 *   [Enter] narration→gate-walk(gy119) → [Enter] gate-walk→gate-open(gy120, auto-lift→bump gy121) →
 *   [Enter] bump→free.
 *
 * Pixel assertions are BEHAVIORAL (canvas-diff hashes + narration yellow-pixel
 * counts), not byte-exact fixture comparisons; the byte-exact full-screen
 * per-frame gate (incl. the 8 door + 8 gate animation frames) lives in
 * tests/game/newgame-sequence-parity.test.ts. This spec proves the FSM + the two
 * auto-animations drive end-to-end to free control in the real app.
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
 * Used to detect that a frame changed (after a keypress OR a timer tick).
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

/**
 * Hash the VIEWPORT region only (the center maze window, MAZE_VIEWPORT =
 * x16..191 / y8..119). The two entry animations play ENTIRELY in the viewport
 * (door slide / portcullis lift), so a viewport-only hash isolates the animation
 * from any incidental strip/panel paints.
 */
async function viewportHash(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!c) return -1;
    const ctx = c.getContext('2d');
    if (!ctx) return -1;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const W = c.width;
    // MAZE_VIEWPORT: x 16..191 (w=176), y 8..119 (h=112).
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
    return h >>> 0;
  });
}

/**
 * Sample the viewport hash N times spaced `intervalMs` apart and return the set
 * of distinct values seen. >1 distinct value during a window in which NO key is
 * pressed proves a timer-driven viewport animation played.
 */
async function sampleViewportHashes(
  page: import('@playwright/test').Page,
  samples: number,
  intervalMs: number,
): Promise<Set<number>> {
  const seen = new Set<number>();
  for (let i = 0; i < samples; i++) {
    seen.add(await viewportHash(page));
    if (i < samples - 1) await page.waitForTimeout(intervalMs);
  }
  return seen;
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test('START NEW GAME: door slide animates → title → narration → gate portcullis animates → free → arrow turns view', async ({ page }) => {
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
  // initGameSession (entryMode:'door-open', gy=117, stepsRemaining=4), then
  // navigates to /game/maze.
  await page.goto('/castle/start-new-game');

  // Wait for the redirect to /game/maze.
  await page.waitForURL('**/game/maze', { timeout: 15_000 });

  // ── Step 3: DOOR-OPEN auto-animation (castle doors slide apart) ──────────
  // On mount the session is in entryMode:'door-open' (gy=117); the door slide
  // auto-plays on a self-rescheduling timer (8 frames × 90ms ≈ 720ms), then
  // transitions to 'title'. Capture the viewport AS EARLY AS POSSIBLE after the
  // first non-blank frame (mid-slide) — NO Enter is pressed during the slide.
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);

  // Sample the viewport across the slide window WITHOUT any input. The slide is
  // ~720ms; sampling 8× @ 100ms (~700ms) brackets it and reliably catches ≥2
  // distinct frames even if the very first read races a frame or two in. This is
  // the primary "the doors visibly MOVED" assertion (timer-driven, no input).
  const slideHashes = await sampleViewportHashes(page, 8, 100);
  expect(
    slideHashes.size,
    `castle door-slide should ANIMATE the viewport over multiple distinct frames ` +
      `with no input (door-open auto-timer), saw ${slideHashes.size} distinct viewport hashes`,
  ).toBeGreaterThan(1);

  // Now let the slide fully settle (→ 'title' still). waitForStableCanvas
  // returns once the timer stops ticking (no more frame changes).
  await waitForStableCanvas(page, 'canvas');

  // ── Step 4: Enter advances title → narration; narration text appears ──────
  // After the door slide settles the session is at 'title' (gy=117); the first
  // Enter steps to the narration frame (gy=118). The narration text is palette
  // index 5 = EGA yellow (255,255,85); the chrome uses grays, so a substantial
  // yellow count proves the narration frame is active.
  await page.keyboard.press('Enter'); // title → narration
  await page.waitForTimeout(200);
  await waitForStableCanvas(page, 'canvas');

  const yellowNarration = await narrationStripYellowPixels(page);
  expect(
    yellowNarration,
    `narration strip should have ≥ 500 yellow (255,255,85) glyph pixels when entryMode='narration', got ${yellowNarration}`,
  ).toBeGreaterThan(500);

  // ── Step 5: Enter dismisses narration + steps (→ gate-walk, gy 118→119) ───
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await waitForStableCanvas(page, 'canvas');

  const yellowAfterEnter = await narrationStripYellowPixels(page);
  // After dismissal, the narration text (yellow glyphs) should be gone from
  // the strip. The chrome uses grays/blacks there — near-zero yellow pixels.
  expect(
    yellowAfterEnter,
    `narration yellow glyphs should be gone after Enter (entryMode='gate-walk'), got ${yellowAfterEnter}`,
  ).toBeLessThan(100);

  // ── Step 6: Enter reaches the gate → portcullis lift AUTO-animates ───────
  // From gate-walk (gy=119): one Enter forced-steps to the gate cell (gy=120),
  // which enters 'gate-open' and the portcullis lift AUTO-plays on the timer
  // (8 frames × 90ms ≈ 720ms), then transitions to 'bump' (gy=121).
  //
  // Capture viewport hashes a few frames apart WHILE NO ENTER IS PRESSED and
  // assert a timer-driven change occurs during the lift — the viewport changes
  // on its own, proving the portcullis animation plays.
  await page.keyboard.press('Enter'); // gate-walk → gate-open (gy 119→120)

  // Sample immediately after the gate-reaching Enter; the lift starts right away.
  const liftHashes = await sampleViewportHashes(page, 8, 100);
  expect(
    liftHashes.size,
    `dungeon portcullis should ANIMATE the viewport over multiple distinct frames ` +
      `with no input (gate-open auto-timer), saw ${liftHashes.size} distinct viewport hashes`,
  ).toBeGreaterThan(1);

  // Let the lift settle (→ 'bump' at gy=121).
  await waitForStableCanvas(page, 'canvas');

  // ── Step 7: Enter from bump (gy=121, dead-end) → free ────────────────────
  // A couple of presses to be robust: bump@121 → free, then free-roam Enter is
  // a no-op (OPTIONS/camp deferred), so extra presses are harmless.
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
  }
  await waitForStableCanvas(page, 'canvas');

  // ── Step 8: Arrow key turns the view (free control is live) ──────────────
  // Capture the canvas before the turn.
  const hashBeforeTurn = await canvasHash(page);

  // ArrowLeft turns the party left; the viewport should re-render to a new
  // facing direction — the canvas hash must change. (Arrows are inert during
  // the scripted entry, so a change here proves entryMode='free'.)
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(200);
  await waitForStableCanvas(page, 'canvas');

  const hashAfterTurn = await canvasHash(page);
  expect(
    hashAfterTurn,
    'Canvas should change after ArrowLeft (free-roam turn proves entryMode=\'free\')',
  ).not.toBe(hashBeforeTurn);
});
