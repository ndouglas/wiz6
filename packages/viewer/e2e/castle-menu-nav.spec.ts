/**
 * castle-menu-nav.spec.ts — E2e smoke for MASTER OPTIONS grid navigation.
 *
 * Drives the REAL CastleScreen (/castle) and asserts the selection cursor moves
 * as a COLUMN-MAJOR 2-D GRID (engine widget wbase FUN_025c, cols=4), NOT the old
 * 1-D wrap-around. The menu's selected option is drawn black-on-yellow (attr
 * 0x50); we locate the yellow (255,255,85) highlight bar and check which column
 * it lands in after each keypress.
 *
 * Ground truth (DOSBox-verified, RE: wbase-master-options-navigation.json):
 *   - Right from the top-left option jumps to the RIGHT column (a full +cols
 *     step), NOT down to the next left-column row (which the 1-D bug did).
 *   - Down moves WITHIN a column.
 *   - Right at the last column CLAMPS (no wrap).
 *
 * Layout: left column at cell col 2 (x≈16..), right column at cell col 21
 * (x≈168..); menu pane starts at screen y=152.
 */

import { test, expect } from '@playwright/test';
import { captureCanvas, waitForNonBlankCanvas, saveCanvasPng } from './lib/canvas.js';

/** Centroid (x,y) of the yellow highlight bar in the menu pane, or null if none. */
async function highlightCentroid(page: import('@playwright/test').Page): Promise<{ x: number; y: number; n: number } | null> {
  const cap = await captureCanvas(page);
  const { width, rgba } = cap;
  let sx = 0, sy = 0, n = 0;
  for (let y = 150; y < 200; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = rgba[i]!, g = rgba[i + 1]!, b = rgba[i + 2]!;
      // EGA yellow highlight background ≈ (255,255,85)
      if (Math.abs(r - 255) <= 12 && Math.abs(g - 255) <= 12 && Math.abs(b - 85) <= 20) {
        sx += x; sy += y; n++;
      }
    }
  }
  return n === 0 ? null : { x: sx / n, y: sy / n, n };
}

const LEFT_COL_MAX_X = 130;   // left-column labels live well under this
const RIGHT_COL_MIN_X = 150;  // right-column labels live well over this

/** Minimal schema-valid ActivePartyMember (only fields the menu/store need). */
function seedMember(idx: number, name: string) {
  return {
    id: `00000000-0000-4000-8000-00000000000${idx + 1}`,
    name, race: 0, class: 0, level: 1, savedOldLevel: 0, xp: 0, gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], dead: false, paralyzed: false,
    attributes: { str: 10, int: 10, pie: 10, vit: 10, dex: 10, spd: 10, per: 10, kar: 10 },
    schoolMana: [0, 0, 0, 0, 0, 0], schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0), reaction: 0, sex: 0, portraitSlotId: idx,
    rosterCharacterId: `00000000-0000-4000-8000-00000000000${idx + 1}`,
    portraitIndex: 0, hpCurrent: 8, hpMax: 8, staminaCurrent: 100, staminaMax: 100, age: 6570,
  };
}

test('MASTER OPTIONS navigates as a column-major grid, not a 1-D wrap', async ({ page }) => {
  // Seed a 2-member party so the menu shows 6 options across 2 columns
  // (col0 = REVIEW/DISMISS/NEW GAME/CHAR MENU, col1 = GAME CONFIG/SHOW TITLE).
  // A fresh /castle with no party shows only ~4 options = a single column.
  await page.addInitScript((members) => {
    window.localStorage.setItem('wiz6:active-party', JSON.stringify({ schemaVersion: 1, members }));
  }, [seedMember(0, 'THESUS'), seedMember(1, 'TEMPEST')]);

  await page.goto('/castle');
  await waitForNonBlankCanvas(page);
  // Give the RAF tick a frame to paint the highlighted menu.
  await page.waitForTimeout(300);

  const base = await highlightCentroid(page);
  saveCanvasPng('/tmp/castle-nav-0-base.png', await captureCanvas(page));
  expect(base, 'a highlighted option should be visible').not.toBeNull();
  // Initial cursor = ADD PARTY MEMBER, top of the LEFT column.
  expect(base!.x).toBeLessThan(LEFT_COL_MAX_X);
  const baseY = base!.y;

  // Right → jumps to the RIGHT column (the engine's +cols step). The 1-D bug
  // would instead move DOWN one row in the LEFT column (REVIEW MEMBER).
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  const right = await highlightCentroid(page);
  saveCanvasPng('/tmp/castle-nav-1-right.png', await captureCanvas(page));
  expect(right, 'highlight present after Right').not.toBeNull();
  expect(right!.x, 'Right moves to the right column (grid), not down the left (1-D wrap)').toBeGreaterThan(RIGHT_COL_MIN_X);
  // Same row as before (top row): y unchanged.
  expect(Math.abs(right!.y - baseY)).toBeLessThan(4);

  // Down → moves WITHIN the right column (y increases, x stays right).
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  const down = await highlightCentroid(page);
  expect(down!.x, 'Down stays in the right column').toBeGreaterThan(RIGHT_COL_MIN_X);
  expect(down!.y, 'Down moves down a row').toBeGreaterThan(right!.y + 2);

  // Right again → CLAMPS at the last column (no wrap back to the left).
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  const clamp = await highlightCentroid(page);
  expect(clamp!.x, 'Right at last column clamps').toBeGreaterThan(RIGHT_COL_MIN_X);
  expect(Math.abs(clamp!.x - down!.x)).toBeLessThan(8);
  expect(Math.abs(clamp!.y - down!.y)).toBeLessThan(4);
});
