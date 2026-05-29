/**
 * review-member-flow.spec.ts — verifies the REVIEW MEMBER flow end-to-end.
 *
 * Seed roster + active party with two members. Navigate to /castle, select
 * REVIEW MEMBER, pick the first member, lands on /castle/review-member/0
 * (the WPCVW character view scaffold), press Enter (EXIT), return to castle.
 * Verify active party unchanged.
 */

import { test, expect } from '@playwright/test';

const ID_A = '550e8400-e29b-41d4-a716-446655440000';
const ID_B = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

function makeChar(id: string, name: string) {
  return {
    id, name, race: 0, class: 0, sex: 0, level: 1, xp: 0, gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false, paralyzed: false,
    attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    savedOldLevel: 0, reaction: 0,
  };
}

test('REVIEW MEMBER picker opens character view + EXIT returns to castle', async ({ page }) => {
  const nathan = makeChar(ID_A, 'NATHAN');
  const gandalf = makeChar(ID_B, 'GANDALF');
  const nathanInParty = { ...nathan, portraitSlotId: 0, rosterCharacterId: nathan.id };
  const gandalfInParty = { ...gandalf, portraitSlotId: 1, rosterCharacterId: gandalf.id };

  await page.goto('/');
  await page.evaluate(
    async ({ chars, members }) => {
      const json = JSON.stringify({ schemaVersion: 1, characters: chars });
      const cs = new CompressionStream('gzip');
      const writer = cs.writable.getWriter();
      void writer.write(new TextEncoder().encode(json));
      void writer.close();
      const gz = new Uint8Array(await new Response(cs.readable).arrayBuffer());
      let s = '';
      for (let i = 0; i < gz.length; i++) s += String.fromCharCode(gz[i]!);
      window.localStorage.setItem('wiz6:roster', btoa(s));
      window.localStorage.setItem(
        'wiz6:active-party',
        JSON.stringify({ schemaVersion: 1, members }),
      );
    },
    { chars: [nathan, gandalf], members: [nathanInParty, gandalfInParty] },
  );

  await page.goto('/castle');
  await page.waitForSelector('canvas', { timeout: 10_000 });
  await page.waitForTimeout(500);

  // Both roster chars already in party → ADD is hidden. Visible menu order:
  //   [REVIEW, DISMISS, START NEW GAME, CHARACTER MENU, GAME CONFIG, TITLE]
  // Cursor starts at visible index 0 = REVIEW. Press Enter.
  await page.keyboard.press('Enter');

  await page.waitForURL('**/castle/review-member', { timeout: 5_000 });
  await page.waitForSelector('canvas', { timeout: 10_000 });
  await page.waitForTimeout(500);

  // Picker cursor on slot 0 (NATHAN). Enter.
  await page.keyboard.press('Enter');

  await page.waitForURL('**/castle/review-member/0', { timeout: 5_000 });
  await page.waitForSelector('canvas', { timeout: 10_000 });
  await page.waitForTimeout(500);

  // EXIT — Enter (cursor locked on EXIT in scaffold) OR Escape.
  await page.keyboard.press('Enter');

  await page.waitForURL('**/castle', { timeout: 5_000 });
  await page.waitForTimeout(300);

  // Active party unchanged.
  const partyJson = await page.evaluate(() => window.localStorage.getItem('wiz6:active-party'));
  expect(partyJson).not.toBeNull();
  const party = JSON.parse(partyJson!);
  expect(party.members).toHaveLength(2);
});
