/**
 * maze-door.spec.ts — CONVERGENCE GATE for the FORCE/PICK door flow.
 *
 * Drives the REAL app through the full OPTIONS → OPEN door interaction:
 *
 *   START: free-roam at entrance (127,121,f0)
 *   ArrowLeft            → face west (facing 3)
 *   ArrowUp ×3           → walk gx 127→124 (passability: all open)
 *   ArrowLeft            → face south (facing 2)  ← now at (124,121,f2)
 *   Enter                → PARTY OPTIONS (cursor SEARCH, index 0)
 *   ArrowRight           → cursor USE (index 3, col1,row0)
 *   ArrowDown            → cursor OPEN (index 4, col1,row1)
 *   Enter                → dispatchOptionsCommand('open') → door detected → FORCE/PICK/EXIT menu
 *   assert maze-door-menu-force strip byte-exact   (gate 1)
 *   ArrowRight           → cursor PICK
 *   assert maze-door-menu-pick strip byte-exact    (gate 2)
 *   ArrowRight           → cursor EXIT (optional check skipped for brevity)
 *   ArrowLeft ×2         → cursor back to FORCE
 *   Enter                → WHO WILL TRY? picker (cursor EXIT)
 *   assert maze-door-who strip byte-exact          (gate 3)
 *   ArrowDown            → cursor THESUS (slot 0)
 *   Enter                → RNG roll → result frame
 *   assert strip CHANGED from maze-door-who        (gate 4: result appeared)
 *   any key              → result dismisses; strip differs from door menu
 *   (gate 5: Escape from door menu → free-roam)
 *
 * Door at (124,121,f2): lock 3, not welded. The roll outcome is RNG-dependent;
 * we only assert that the result frame is non-identical to the WHO picker.
 *
 * NOTE: a deterministic success+walkthrough test requires a seeded-RNG dev hook
 * (deferred TODO #089 follow-up). Until then, the roll path is exercised but
 * not outcome-gated.
 *
 * Reach sequence mirrors maze-options-menu.spec.ts (known-green):
 *   seedMember → /castle/start-new-game → waitForURL maze → waitForNonBlankCanvas
 *   → 9s auto-push → Enter → 11s gate lifts → waitForStableCanvas free-roam
 *
 * Party seed: THESUS(idx0,str18,staminaCurrent/Max100), TEMPEST(idx1), LYSANDR(idx2)
 * in PINNED ROSTER ORDER. The interleaved panel mapping (even→left, odd→right)
 * places THESUS→slot0, LYSANDR→slot1, TEMPEST→slot3 — matching the engine
 * maze-door-who fixture byte-exact (same order as maze-review.spec.ts).
 *
 * APPROACH: live walk (not state injection). The path is verified passable via
 * extracted/maze/passability.json; all three west-facing steps and both turns
 * are confirmed reachable at planning time.
 */

import { test, expect } from '@playwright/test';
import {
  waitForNonBlankCanvas,
  waitForStableCanvas,
} from './lib/canvas.js';
import {
  expectOptionsStripMatchesFixture,
  optionsStripDiffersFromFixture,
  pressKeys,
} from './lib/drive.js';

/**
 * Build a minimal schema-valid ActivePartyMember for seeding.
 * Mirrors seedMember from maze-review.spec.ts — same shape, same defaults.
 * THESUS is seeded with str=18 and stamina=100 for a reasonable FORCE roll,
 * though the outcome is RNG-dependent.
 */
function seedMember(
  idx: number,
  name: string,
  overrides: { str?: number; staminaCurrent?: number; staminaMax?: number } = {},
) {
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
    attributes: {
      str: overrides.str ?? 10,
      int: 10, pie: 10, vit: 10, dex: 10, spd: 10, per: 10, kar: 10,
    },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    reaction: 0,
    portraitSlotId: idx,
    rosterCharacterId: `00000000-0000-4000-8000-000000000${String(idx + 1).padStart(3, '0')}`,
    portraitIndex: 0,
    hpCurrent: 8,
    hpMax: 8,
    staminaCurrent: overrides.staminaCurrent ?? 100,
    staminaMax: overrides.staminaMax ?? 100,
    age: 6570,
  };
}

// Pinned roster order: THESUS(0), TEMPEST(1), LYSANDR(2).
// Interleaved panel mapping → WHO picker slots: THESUS=slot0, LYSANDR=slot1, TEMPEST=slot3.
// This matches the engine maze-door-who fixture layout byte-exact.
const SEEDED_PARTY = [
  seedMember(0, 'THESUS', { str: 18, staminaCurrent: 100, staminaMax: 100 }),
  seedMember(1, 'TEMPEST'),
  seedMember(2, 'LYSANDR'),
];

test('maze DOOR: walk to (124,121,f2), OPEN → FORCE/PICK menu → WHO picker → result', async ({
  page,
}) => {
  test.setTimeout(120_000);

  // ── Reach free-roam at the entrance via the real START-NEW-GAME cutscene ──
  await page.goto('/');
  await page.evaluate((members) => {
    window.localStorage.setItem(
      'wiz6:active-party',
      JSON.stringify({ schemaVersion: 1, members }),
    );
  }, SEEDED_PARTY);
  await page.goto('/castle/start-new-game');
  await page.waitForURL('**/game/maze', { timeout: 15_000 });
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);

  // Mirror the proven cadence from maze-options-menu.spec.ts.
  await page.waitForTimeout(9_000); // auto-push to APPROACHING
  await page.keyboard.press('Enter'); // continue past the one interactive beat
  await page.waitForTimeout(11_000); // both gate lifts auto-play
  await waitForStableCanvas(page, 'canvas'); // settle to free-roam

  // ── Walk to the door at (124,121,f2) ──
  // Start: (127,121,f0). Path:
  //   ArrowLeft            → (127,121,f3) — face west
  //   ArrowUp ×3           → (124,121,f3) — walk west 3 steps (all passable: open)
  //   ArrowLeft            → (124,121,f2) — face south; door edge ahead
  await pressKeys(page, [
    'ArrowLeft',                       // face west (f0→f3)
    'ArrowUp', 'ArrowUp', 'ArrowUp',   // walk gx 127→124
    'ArrowLeft',                       // face south (f3→f2) — door at (124,121,f2)
  ]);
  // Short settle to let the renderer flush the new position.
  await waitForStableCanvas(page, 'canvas');

  // ── Open PARTY OPTIONS (Enter), navigate to OPEN (grid index 4) ──
  // Grid is column-major: index = col*3 + row.
  //   index 0 = SEARCH  (col0,row0)  ← Enter opens here
  //   index 3 = USE     (col1,row0)  ← ArrowRight
  //   index 4 = OPEN    (col1,row1)  ← ArrowDown
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');  // SEARCH → USE (index 0 → 3)
  await page.keyboard.press('ArrowDown');   // USE    → OPEN (index 3 → 4)
  await page.keyboard.press('Enter');       // dispatchOptionsCommand('open')

  // ── GATE 1: FORCE/PICK/EXIT menu strip is byte-exact ──
  // detectDoorAtParty matched (124,121,f2) → doorFlow.phase='menu', cursor=0 (FORCE).
  await expectOptionsStripMatchesFixture(page, 'maze-door-menu-force');

  // ── Navigate cursor right: FORCE → PICK ──
  await page.keyboard.press('ArrowRight');

  // ── GATE 2: PICK cursor byte-exact ──
  await expectOptionsStripMatchesFixture(page, 'maze-door-menu-pick');

  // ── Navigate cursor right: PICK → EXIT (optional) ──
  await page.keyboard.press('ArrowRight');
  await expectOptionsStripMatchesFixture(page, 'maze-door-menu-exit');

  // ── Navigate back to FORCE (ArrowLeft ×2) ──
  await page.keyboard.press('ArrowLeft'); // EXIT → PICK
  await page.keyboard.press('ArrowLeft'); // PICK → FORCE

  // ── Enter FORCE → WHO WILL TRY? picker (cursor on EXIT = -1) ──
  await page.keyboard.press('Enter');

  // ── GATE 3: WHO picker strip byte-exact (cursor on EXIT) ──
  await expectOptionsStripMatchesFixture(page, 'maze-door-who');

  // ── Move cursor to THESUS (slot 0, ArrowDown from EXIT) ──
  await page.keyboard.press('ArrowDown');
  await waitForStableCanvas(page, 'canvas');

  // ── Enter → RNG roll → result frame ──
  await page.keyboard.press('Enter');

  // ── GATE 4: result frame appeared — strip DIFFERS from WHO picker ──
  // The result composer shows a "STRAIN/TUMBLE" bar or outcome text — always
  // different from the WHO picker regardless of success/failure.
  // Outcome is RNG-dependent; we do NOT assert a specific result fixture.
  const diffFromWho = await optionsStripDiffersFromFixture(page, 'maze-door-who');
  expect(
    diffFromWho,
    'after Enter on a WHO slot, the strip should show the result frame (differs from WHO picker)',
  ).toBeGreaterThan(0);

  // ── Dismiss result (any key) → returns to free-roam ──
  // The result phase closes on any key (MazeView: doorFlow.phase==='result' → any key → closed).
  await page.keyboard.press('Enter');
  await waitForStableCanvas(page, 'canvas');

  // ── GATE 5: strip no longer shows the FORCE/PICK/EXIT door menu ──
  // After dismissal, doorFlow.phase='closed' → free-roam chrome shows in the strip,
  // which is NOT the door menu.
  const diffFromMenu = await optionsStripDiffersFromFixture(page, 'maze-door-menu-force');
  expect(
    diffFromMenu,
    'after result dismissed, the strip should return to free-roam chrome (not the door menu)',
  ).toBeGreaterThan(0);

  // ── GATE 6: Escape from door menu → free-roam (re-open + Escape) ──
  // Re-open OPTIONS → OPEN to verify the Escape path.
  await page.keyboard.press('Enter');       // PARTY OPTIONS
  await page.keyboard.press('ArrowRight'); // SEARCH → USE
  await page.keyboard.press('ArrowDown'); // USE → OPEN
  await page.keyboard.press('Enter');       // OPEN → door menu
  await expectOptionsStripMatchesFixture(page, 'maze-door-menu-force'); // confirm door menu opened
  await page.keyboard.press('Escape');      // dismiss
  await waitForStableCanvas(page, 'canvas');
  const diffFromMenuEsc = await optionsStripDiffersFromFixture(page, 'maze-door-menu-force');
  expect(
    diffFromMenuEsc,
    'after Escape from door menu, strip should be free-roam chrome (not the door menu)',
  ).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// NOTE: A deterministic success+walkthrough test (asserting the party moves
// through the door after a successful FORCE/PICK) requires a seeded-RNG dev
// hook to guarantee the roll outcome. Deferred as a TODO #089 follow-up.
// The test above exercises the full flow end-to-end including a real roll, but
// does not assert success vs failure.
// ---------------------------------------------------------------------------
