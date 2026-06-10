/**
 * maze-walk-gate-square.spec.ts — CONVERGENCE GATE for faithful dungeon rendering.
 *
 * Phase 1 of the maze walking-coherence gate. Drives the REAL app into free-roam
 * at the entrance cell (127,121) and pixel-asserts the maze viewport against
 * engine ground-truth fixtures for all four facings (turn in place).
 *
 * WHY this exists (the regression it would have caught): the capture-replay parity
 * gate compares the renderer's output to the SAME stored oracle it returns — it is
 * tautological and cannot detect a *wrong* stored frame. This spec instead compares
 * the running app's render to a frame captured INDEPENDENTLY by driving the engine
 * to (127,121,facing) via a clean play-through (`trace-maze.ts freeroam`). If the
 * app shows a different view than the engine shows when you actually walk there,
 * this fails. See docs/driving-based-testing.md (the convergence convention) +
 * TODO #086.
 *
 * Fixtures: tools/parity/fixtures/engine/maze-walk-gx127-gy121-f{0..3}.idx.gz —
 * each verified DETERMINISTIC (two independent freeroam captures were byte-identical,
 * incl. the animating entrance gate at facing 2). Compares the MAZE_VIEWPORT rect
 * only (the surrounding chrome is party-dependent; the maze view is not).
 *
 * Expansion (Phase 2): forward steps → the full walkable starting-area component,
 * which sweeps every visual element (candlesticks, gates, doors, up-stairs, walls,
 * chests) and will catch the open decoration-aliasing bug at (127,124)/(126,133).
 */

import { test, expect } from '@playwright/test';
import {
  waitForNonBlankCanvas,
  waitForStableCanvas,
} from './lib/canvas.js';
import { expectMazeViewportMatchesFixture } from './lib/drive.js';

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

test('maze walk: entrance gate square (127,121) renders byte-exact in all 4 facings', async ({
  page,
}) => {
  test.setTimeout(90_000);

  // ── Reach free-roam at the entrance via the real START-NEW-GAME cutscene ──
  await page.goto('/');
  await page.evaluate((members) => {
    window.localStorage.setItem('wiz6:active-party', JSON.stringify({ schemaVersion: 1, members }));
  }, [seedMember(0, 'THESUS')]);
  await page.goto('/castle/start-new-game');
  await page.waitForURL('**/game/maze', { timeout: 15_000 });
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);

  // The cutscene auto-pushes to the APPROACHING beat (no input), waits for ENTER,
  // then auto-completes both gate lifts → free-roam. Mirror the proven cadence
  // from faithful-start-new-game.spec.ts.
  await page.waitForTimeout(9_000); // auto-push to APPROACHING
  await page.keyboard.press('Enter'); // continue past the one interactive beat
  await page.waitForTimeout(11_000); // both gate lifts auto-play
  await waitForStableCanvas(page, 'canvas'); // settle to free-roam

  // Sanity: free control is live (ArrowLeft turns) — then turn back so we start at facing 0.
  // (We don't assert a frame here; the per-facing asserts below are the real gate.)

  // ── Turn in place through all 4 facings, asserting each vs its engine fixture ──
  // Free-roam starts at (127,121, facing 0). ArrowRight turns right (facing+1):
  //   0 → 1 → 2 → 3. facing 2 looks back at the (animating) entrance portcullis.
  await expectMazeViewportMatchesFixture(page, 'maze-walk-gx127-gy121-f0');
  await page.keyboard.press('ArrowRight');
  await expectMazeViewportMatchesFixture(page, 'maze-walk-gx127-gy121-f1');
  await page.keyboard.press('ArrowRight');
  await expectMazeViewportMatchesFixture(page, 'maze-walk-gx127-gy121-f2');
  await page.keyboard.press('ArrowRight');
  await expectMazeViewportMatchesFixture(page, 'maze-walk-gx127-gy121-f3');
});
