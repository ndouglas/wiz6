/**
 * maze-review.spec.ts — CONVERGENCE GATE for the in-dungeon REVIEW flow.
 *
 * Drives the real app from free-roam at the entrance through the full REVIEW
 * round-trip:
 *
 *   Enter          → OPTIONS (cursor SEARCH)
 *   ArrowDown      → cursor REVIEW
 *   Enter          → "REVIEW WHO?" picker (cursor EXIT)
 *   ArrowDown      → cursor THESUS (slot 0, m0)
 *   Enter          → /game/review/0 (char view)
 *   Escape         → /game/maze (back to dungeon)
 *
 * The picker strip (x:0, y:144, w:160, h:40) is pixel-asserted at each cursor
 * position against the committed engine fixtures:
 *   maze-review-who-exit  — picker open, cursor on EXIT
 *   maze-review-who-m0    — cursor on THESUS  (slot 0, party index 0)
 *
 * The char view is verified behaviorally (canvas is non-blank and has multiple
 * distinct colors — NOT pixel-gated per the task spec).
 *
 * Party seed order: THESUS(idx0), TEMPEST(idx1), LYSANDR(idx2) — the PINNED
 * ROSTER ORDER. Interleaved panel mapping (even→left, odd→right) places
 * THESUS→slot0 (left-top), LYSANDR→slot1 (left-mid), TEMPEST→slot3 (right-top),
 * which matches the engine maze-review-who-* fixtures byte-exact.
 * (Seeding THESUS/LYSANDR/TEMPEST would swap TEMPEST and LYSANDR and break the
 * strip asserts.)
 *
 * Reach sequence mirrors maze-options-menu.spec.ts (known-green):
 *   seedMember → /castle/start-new-game → waitForURL maze → waitForNonBlankCanvas
 *   → 9s auto-push → Enter → 11s gate lifts → waitForStableCanvas free-roam
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

/**
 * Build a minimal schema-valid ActivePartyMember for seeding.
 *
 * Mirrors `seedMember` from maze-options-menu.spec.ts — same shape, same
 * defaults. The `portraitSlotId` equals the party index so the interleaved
 * panel → picker slot mapping produces the engine-fixture layout.
 */
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

// Pinned roster order: THESUS(0), TEMPEST(1), LYSANDR(2).
// Interleaved panel mapping → picker slots: THESUS=slot0, LYSANDR=slot1, TEMPEST=slot3.
// This matches the engine maze-review-who-* fixture layout byte-exact.
const SEEDED_PARTY = [
  seedMember(0, 'THESUS'),
  seedMember(1, 'TEMPEST'),
  seedMember(2, 'LYSANDR'),
];

test('maze REVIEW: picker strip parity + char view + EXIT back to dungeon', async ({ page }) => {
  test.setTimeout(90_000);

  // ── Reach free-roam at the entrance via the real START-NEW-GAME cutscene ──
  await page.goto('/');
  await page.evaluate((members) => {
    window.localStorage.setItem('wiz6:active-party', JSON.stringify({ schemaVersion: 1, members }));
  }, SEEDED_PARTY);
  await page.goto('/castle/start-new-game');
  await page.waitForURL('**/game/maze', { timeout: 15_000 });
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);

  // Mirror the proven cadence from maze-options-menu.spec.ts.
  await page.waitForTimeout(9_000); // auto-push to APPROACHING
  await page.keyboard.press('Enter'); // continue past the one interactive beat
  await page.waitForTimeout(11_000); // both gate lifts auto-play
  await waitForStableCanvas(page, 'canvas'); // settle to free-roam

  // ── Open PARTY OPTIONS with Enter ──
  await page.keyboard.press('Enter');
  // menu opened; cursor on SEARCH (column 0, row 0) — sanity: don't assert here
  // to keep the test focused on REVIEW

  // ── Move cursor down to REVIEW ──
  await page.keyboard.press('ArrowDown');
  // cursor on REVIEW (column 0, row 1)

  // ── Select REVIEW → "REVIEW WHO?" picker opens (cursor EXIT) ──
  await page.keyboard.press('Enter');
  await expectOptionsStripMatchesFixture(page, 'maze-review-who-exit');

  // ── Move cursor to first member (THESUS, slot 0) ──
  await page.keyboard.press('ArrowDown');
  await expectOptionsStripMatchesFixture(page, 'maze-review-who-m0');

  // ── Select THESUS → navigate to /game/review/0 ──
  await page.keyboard.press('Enter');
  await page.waitForURL('**/game/review/0', { timeout: 8_000 });
  await waitForStableCanvas(page, 'canvas');

  // ── Char view behavioral check: canvas is non-blank and has multiple distinct colours ──
  // We do NOT pixel-gate the dungeon char view (per spec) — just verify it rendered.
  const colorCount = await page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!c) return 0;
    const ctx = c.getContext('2d');
    if (!ctx) return 0;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4) {
      seen.add((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
      if (seen.size >= 3) return seen.size; // short-circuit once clearly non-blank
    }
    return seen.size;
  });
  expect(colorCount, 'char view canvas should have multiple distinct colours (non-blank)').toBeGreaterThanOrEqual(3);

  // ── EXIT char view (Escape) → back to dungeon /game/maze ──
  await page.keyboard.press('Escape');
  await page.waitForURL('**/game/maze', { timeout: 10_000 });
  await waitForStableCanvas(page, 'canvas');

  // ── Verify we are back in the dungeon: the strip should NOT match the REVIEW picker ──
  const d = await optionsStripDiffersFromFixture(page, 'maze-review-who-exit');
  expect(d, 'after returning from char view, the strip should not be the REVIEW picker').toBeGreaterThan(0);
});
