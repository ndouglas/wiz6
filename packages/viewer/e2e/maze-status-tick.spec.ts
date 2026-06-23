/**
 * maze-status-tick.spec.ts — #089 e2e: an afflicted member's stamina drains over
 * maze turns.
 *
 * Drives the REAL app into free-roam (the START-NEW-GAME cutscene cadence, mirrored
 * from maze-walk-gate-square.spec.ts), then rotates in place ~12 times. Each rotate
 * is a maze action → advanceMazeTurn() → the staggered status tick. On turnCounter
 * % 10 === 5, slot (turn%60)/10 drains (poisonAmount + 1) stamina (slot 0 at turn 5).
 *
 * The seeded member 0 is afflicted (poisonAmount: 3) but has VALID hp/stamina so the
 * tick's HP-regen check does NOT fire the DEATH path (which would zero stamina).
 * After the rotates, we read staminaCurrent back from localStorage and assert it
 * dropped below the seeded 50.
 */

import { test, expect } from '@playwright/test';
import {
  waitForNonBlankCanvas,
  waitForStableCanvas,
} from './lib/canvas.js';

interface SeedOverrides {
  poisonAmount?: number;
  statusLevel?: number;
  hpCurrent?: number;
  hpMax?: number;
  staminaCurrent?: number;
  staminaMax?: number;
}

function seedMember(idx: number, name: string, overrides: SeedOverrides = {}) {
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
    // Valid HP so the tick's hp<1 DEATH path (which zeros stamina) does NOT fire.
    hpCurrent: overrides.hpCurrent ?? 8,
    hpMax: overrides.hpMax ?? 8,
    staminaCurrent: overrides.staminaCurrent ?? 100,
    staminaMax: overrides.staminaMax ?? 100,
    age: 6570,
    // #089 affliction fields.
    statusLevel: overrides.statusLevel ?? 0,
    poisonAmount: overrides.poisonAmount ?? 0,
  };
}

test('maze status tick: an afflicted member loses stamina over free-roam turns', async ({
  page,
}) => {
  test.setTimeout(90_000);

  // ── Seed member 0 as afflicted with VALID hp/stamina ──
  const afflicted = seedMember(0, 'TOXIC', {
    poisonAmount: 3,
    statusLevel: 0,
    hpCurrent: 20,
    hpMax: 20,
    staminaCurrent: 50,
    staminaMax: 50,
  });

  await page.goto('/');
  await page.evaluate((members) => {
    window.localStorage.setItem('wiz6:active-party', JSON.stringify({ schemaVersion: 1, members }));
  }, [afflicted]);

  // ── Reach free-roam via the real START-NEW-GAME cutscene (mirrors maze-walk-gate-square) ──
  await page.goto('/castle/start-new-game');
  await page.waitForURL('**/game/maze', { timeout: 15_000 });
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);

  await page.waitForTimeout(9_000); // auto-push to APPROACHING
  await page.keyboard.press('Enter'); // continue past the one interactive beat
  await page.waitForTimeout(11_000); // both gate lifts auto-play
  await waitForStableCanvas(page, 'canvas'); // settle to free-roam

  // ── Rotate in place ~12 times: each ArrowRight is a maze action → a turn.
  // Starting from turnCounter 0, the 5th press is turn 5 = slot 0 drain. Rotating
  // (not stepping) avoids walls/encounters that would derail the turn count. ──
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(120);
  }

  // ── Read staminaCurrent back from localStorage and assert it drained ──
  const staminaAfter = await page.evaluate(() => {
    const raw = window.localStorage.getItem('wiz6:active-party');
    if (!raw) return null;
    const party = JSON.parse(raw) as { members: Array<{ staminaCurrent?: number }> };
    return party.members[0]?.staminaCurrent ?? null;
  });

  expect(staminaAfter).not.toBeNull();
  // Seeded at 50; the staggered tick drains slot 0 by (poisonAmount + 1) = 4 on turn 5.
  // Asserts the tick actually fired without zeroing stamina (death path).
  expect(staminaAfter!).toBeGreaterThan(0);
  expect(staminaAfter!).toBeLessThan(50);
});
