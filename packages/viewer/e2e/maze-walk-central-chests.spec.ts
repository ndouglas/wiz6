/**
 * maze-walk-central-chests.spec.ts — the regression repro turned into a gate.
 *
 * Walks the REAL app to the two central-room decoration cells that the old
 * wall-geometry oracle key ALIASED (the chest<->candlestick bug, TODO #086):
 * (127,124,f1) and (127,132,f1). Under configKey-keying both were served ONE
 * frame; (127,132,f1) showed the wrong decoration. With the position-keyed oracles
 * (rebuilt from engcap engine-truth captures) each renders its own engine view.
 *
 * Drives via the app's FAITHFUL movement (the passability gate), so the key paths
 * are exactly the routes the player can walk; the maze-viewport pixels are compared
 * to engine fixtures (engcap). Faithful movement no-ops random encounters, so the
 * browser walk is deterministic (the engine capture had to dodge encounters).
 */

import { test } from '@playwright/test';
import { waitForNonBlankCanvas, waitForStableCanvas } from './lib/canvas.js';
import { pressKeys, expectMazeViewportMatchesFixture } from './lib/drive.js';

function seedMember(idx: number, name: string) {
  return {
    id: `00000000-0000-4000-8000-000000000${String(idx + 1).padStart(3, '0')}`,
    name,
    race: 0, class: 0, sex: 0, level: 1, savedOldLevel: 0, xp: 0, gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false, paralyzed: false,
    attributes: { str: 10, int: 10, pie: 10, vit: 10, dex: 10, spd: 10, per: 10, kar: 10 },
    schoolMana: [0, 0, 0, 0, 0, 0], schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0), reaction: 0,
    portraitSlotId: idx, rosterCharacterId: `00000000-0000-4000-8000-000000000${String(idx + 1).padStart(3, '0')}`,
    portraitIndex: 0, hpCurrent: 8, hpMax: 8, staminaCurrent: 100, staminaMax: 100, age: 6570,
  };
}

// Faithful-movement key paths (BFS over the committed passability gate).
//   entrance (127,121,f0) → chest A (127,124,f1)
const PATH_TO_A = ['ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowUp', 'ArrowRight', 'ArrowUp'];
//   chest A (127,124,f1) → chest B (127,132,f1)
const PATH_A_TO_B = ['ArrowUp', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowUp', 'ArrowRight'];

test('maze walk: the two central chests render their own (un-aliased) engine views', async ({ page }) => {
  test.setTimeout(90_000);

  // Reach free-roam at the entrance via the real START-NEW-GAME cutscene.
  await page.goto('/');
  await page.evaluate((members) => {
    window.localStorage.setItem('wiz6:active-party', JSON.stringify({ schemaVersion: 1, members }));
  }, [seedMember(0, 'THESUS')]);
  await page.goto('/castle/start-new-game');
  await page.waitForURL('**/game/maze', { timeout: 15_000 });
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);
  await page.waitForTimeout(9_000);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(11_000);
  await waitForStableCanvas(page, 'canvas');

  // Chest A (127,124,f1) — special4=9. Under the old key this and B shared a frame.
  await pressKeys(page, PATH_TO_A);
  await expectMazeViewportMatchesFixture(page, 'maze-walk-gx127-gy124-f1');

  // Chest B (127,132,f1) — the cell that previously rendered A's frame (the candlestick
  // showing a chest). Now its own engine view.
  await pressKeys(page, PATH_A_TO_B);
  await expectMazeViewportMatchesFixture(page, 'maze-walk-gx127-gy132-f1');
});
