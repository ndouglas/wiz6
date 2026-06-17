/**
 * maze-walk-interior.spec.ts — CONVERGENCE GATE for the level-0 INTERIOR (#091 Piece B).
 *
 * Drives the REAL ported app into the dungeon interior PAST the (124,121) forced
 * door and pixel-asserts the maze viewport against engine ground-truth fixtures.
 *
 * WHY this exists (the regression it catches): the capture-replay parity gate
 * compares the renderer to the SAME stored oracle it returns — it is tautological
 * and cannot catch a WIRING bug (wrong oracle lookup key, wrong screen coords). This
 * spec instead compares the running app's render to a frame captured INDEPENDENTLY
 * by driving the engine into the interior (`trace-maze.ts` interior capture →
 * maze-freeroam-gx124-gy120-fF.idx.gz, committed here as maze-walk-* fixtures). If
 * the app shows a different view than the engine shows when you actually stand there,
 * this fails. See docs/driving-based-testing.md + the plan's Task 8.
 *
 * HOW it reaches the interior: there is no maze party-injection hook in production —
 * the (124,121) door requires an RNG FORCE roll the engine gates non-deterministically.
 * So this spec uses a DEV-ONLY maze-injection hook (`window.__WIZ6_E2E_MAZE__`, read
 * only when `import.meta.env.DEV` in MazeView) that places the party at the interior
 * cell with the door pre-opened. The deterministic-force RNG dev hook (#089 deferred)
 * is out of scope — the maze-injection sidesteps it.
 *
 * Interior cells asserted (both genuinely past the door; NOT in the entrance-only
 * reachable set; confirmed present in extracted/maze/viewport-oracles.json):
 *   (124,120) facing 2  — looking into the interior
 *   (124,120) facing 3  — turn-in-place (ArrowRight), a distinct interior view
 * (The forward neighbours of (124,120) are not yet captured — turn-in-place is the
 * deepest distinct interior assertion available; see plan Task 10 for full coverage.)
 */

import { test } from '@playwright/test';
import { expectMazeViewportMatchesFixture } from './lib/drive.js';
import { waitForNonBlankCanvas, waitForStableCanvas } from './lib/canvas.js';

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

test('level-0 interior renders byte-exact past the (124,121) door', async ({ page }) => {
  test.setTimeout(90_000);

  // Inject the active party + the DEV maze-state hook BEFORE any page script runs,
  // so MazeView's mount effect sees __WIZ6_E2E_MAZE__ and drops straight into
  // free-roam at the interior cell (bypassing the entry cutscene).
  await page.addInitScript(() => {
    (window as unknown as { __WIZ6_E2E_MAZE__: unknown }).__WIZ6_E2E_MAZE__ = {
      gx: 124,
      gy: 120,
      facing: 2,
      openDoors: [{ gx: 124, gy: 121, facing: 2 }],
    };
  });
  await page.goto('/');
  await page.evaluate((members) => {
    window.localStorage.setItem('wiz6:active-party', JSON.stringify({ schemaVersion: 1, members }));
  }, [seedMember(0, 'THESUS')]);

  // START-NEW-GAME creates the level-0 session and navigates to the maze; the DEV
  // hook then overrides the party position to the interior cell in free-roam.
  await page.goto('/castle/start-new-game');
  await page.waitForURL('**/game/maze', { timeout: 15_000 });
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);
  await waitForStableCanvas(page, 'canvas');

  // (124,120) facing 2 — looking into the interior, byte-exact vs the engine.
  await expectMazeViewportMatchesFixture(page, 'maze-walk-gx124-gy120-f2');

  // Turn right in place → facing 3, a distinct interior view.
  await page.keyboard.press('ArrowRight');
  await expectMazeViewportMatchesFixture(page, 'maze-walk-gx124-gy120-f3');
});

// Regression for the #091 walk-back bug: a door opened from one side must be passable
// walking BACK through it. A door is one shared edge — opening (124,121,facing 2)
// must also open its reciprocal (124,120,facing 0), so from the interior the party can
// step back out. Before the DoorStateOverlay edge-symmetry fix, this step was blocked
// (the overlay only recorded the far side; the static wall model saw the edge as solid).
test('can walk BACK out through a door opened from the far side (#091 walk-back)', async ({
  page,
}) => {
  test.setTimeout(90_000);

  // Inject the party INSIDE the interior at (124,120) facing 0 (toward the door /
  // (124,121)), with the door opened from the OTHER side ((124,121,facing 2)).
  await page.addInitScript(() => {
    (window as unknown as { __WIZ6_E2E_MAZE__: unknown }).__WIZ6_E2E_MAZE__ = {
      gx: 124,
      gy: 120,
      facing: 0, // facing back toward (124,121) across the opened door edge
      openDoors: [{ gx: 124, gy: 121, facing: 2 }],
    };
  });
  await page.goto('/');
  await page.evaluate((members) => {
    window.localStorage.setItem('wiz6:active-party', JSON.stringify({ schemaVersion: 1, members }));
  }, [seedMember(0, 'THESUS')]);
  await page.goto('/castle/start-new-game');
  await page.waitForURL('**/game/maze', { timeout: 15_000 });
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);
  await waitForStableCanvas(page, 'canvas');

  // Step forward (back through the door) → the party must reach (124,121); the view
  // becomes (124,121,facing 0), which is DISTINCT from (124,120,*) so it proves the
  // step actually happened (not blocked).
  await page.keyboard.press('ArrowUp');
  await expectMazeViewportMatchesFixture(page, 'maze-walk-gx124-gy121-f0');
});
