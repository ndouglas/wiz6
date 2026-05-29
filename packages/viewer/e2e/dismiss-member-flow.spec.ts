/**
 * dismiss-member-flow.spec.ts — verifies the DISMISS MEMBER flow end-to-end.
 *
 * Seed the roster with two characters + active party with both. Navigate
 * to /castle, select DISMISS MEMBER, pick the first member, return to
 * castle. Verify localStorage active party went from 2 → 1 members.
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

test('DISMISS MEMBER picker drops a party member from the active party', async ({ page }) => {
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

  // CastleScreen visible slots when party has 2 members and both already loaded
  // (pcFileHasUnloadedChars=false, so ADD is hidden):
  //   [1 REVIEW, 2 DISMISS, 3 START NEW GAME, ...]
  // Cursor starts at visible index 0 = REVIEW. Move down once to reach DISMISS, then Enter.
  await page.keyboard.press('ArrowDown'); // → DISMISS (slot 2, visible index 1)
  await page.keyboard.press('Enter');

  await page.waitForURL('**/castle/dismiss-member', { timeout: 5_000 });
  await page.waitForSelector('canvas', { timeout: 10_000 });
  await page.waitForTimeout(500);

  // Picker cursor starts at slot 0. Press Enter to dismiss NATHAN.
  await page.keyboard.press('Enter');
  await page.waitForURL('**/castle', { timeout: 5_000 });
  await page.waitForTimeout(300);

  const partyJson = await page.evaluate(() => window.localStorage.getItem('wiz6:active-party'));
  expect(partyJson).not.toBeNull();
  const party = JSON.parse(partyJson!);
  expect(party.members).toHaveLength(1);
  expect(party.members[0].name).toBe('GANDALF');
});
