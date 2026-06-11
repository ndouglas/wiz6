/**
 * maze-options-menu.spec.ts — CONVERGENCE GATE for the PARTY OPTIONS menu.
 *
 * Drives the real app to free-roam at the entrance, then exercises the
 * in-dungeon PARTY OPTIONS menu end-to-end:
 *
 *   - Return  → opens PARTY OPTIONS; cursor on SEARCH (column 0, row 0)
 *   - ArrowDown → cursor moves to REVIEW (column 0, row 1)
 *   - Escape  → menu closes; strip returns to free-roam chrome (NOT the menu)
 *
 * Each open-menu step is pixel-asserted against the independently-captured
 * engine fixtures: tools/parity/fixtures/engine/options-menu-{search,review}.idx.gz.
 * Only the OPTIONS_STRIP rect (x:0, y:144, w:160, h:40) is compared — the maze
 * viewport and party-panel chrome are party-dependent (the seeded party differs
 * from the engine fixture party) and are not in scope here.
 *
 * Reach sequence mirrors maze-walk-gate-square.spec.ts (known-green):
 *   seedMember → /castle/start-new-game → wait 9s → Enter → wait 11s → settle
 */

import { test, expect } from '@playwright/test';
import {
  waitForNonBlankCanvas,
  waitForStableCanvas,
} from './lib/canvas.js';
import {
  expectOptionsStripMatchesFixture,
  optionsStripDiffersFromFixture,
} from './lib/drive.js';

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

test('maze options menu: Return opens, ArrowDown moves cursor, Escape closes', async ({
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

  // Mirror the proven cadence from maze-walk-gate-square.spec.ts.
  await page.waitForTimeout(9_000); // auto-push to APPROACHING
  await page.keyboard.press('Enter'); // continue past the one interactive beat
  await page.waitForTimeout(11_000); // both gate lifts auto-play
  await waitForStableCanvas(page, 'canvas'); // settle to free-roam

  // ── Open PARTY OPTIONS with Return ──
  await page.keyboard.press('Enter');
  // menu opened; cursor on SEARCH (column 0, row 0)
  await expectOptionsStripMatchesFixture(page, 'options-menu-search');

  // ── Move cursor down to REVIEW ──
  await page.keyboard.press('ArrowDown');
  // cursor on REVIEW (column 0, row 1)
  await expectOptionsStripMatchesFixture(page, 'options-menu-review');

  // ── Close with Escape ──
  await page.keyboard.press('Escape');
  // strip is the free-roam widget, NOT the menu — it must differ from the last menu fixture
  const d = await optionsStripDiffersFromFixture(page, 'options-menu-review');
  expect(d, 'strip should no longer match the OPTIONS menu after Escape').toBeGreaterThan(0);
});
