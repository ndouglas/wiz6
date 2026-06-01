/**
 * review-member-flow.spec.ts — verifies the REVIEW MEMBER flow end-to-end.
 *
 * Seed roster + active party with two members. Navigate to /castle, select
 * REVIEW MEMBER, pick the first member, lands on /castle/review-member/0
 * (the WPCVW character view scaffold), press Enter (EXIT), return to castle.
 * Verify active party unchanged.
 */

import { test, expect } from '@playwright/test';
import { pressKeys, expectCanvasMatchesFixture } from './lib/drive.js';
import { waitForNonBlankCanvas } from './lib/canvas.js';

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

  // Reworked picker starts cursor on EXIT (-1). ArrowDown moves EXIT → slot 0
  // (NATHAN), then Enter commits that member.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  await page.waitForURL('**/castle/review-member/0', { timeout: 5_000 });
  await page.waitForSelector('canvas', { timeout: 10_000 });
  await page.waitForTimeout(500);

  // EXIT — the character view is a real action menu now (cursor starts on EQUIP,
  // not EXIT), so Escape is the exit: reducer maps ESCAPE → exit-castle in the
  // action-menu state (character-view-reducer.ts), which navigates to /castle.
  await page.keyboard.press('Escape');

  await page.waitForURL('**/castle', { timeout: 5_000 });
  await page.waitForTimeout(300);

  // Active party unchanged.
  const partyJson = await page.evaluate(() => window.localStorage.getItem('wiz6:active-party'));
  expect(partyJson).not.toBeNull();
  const party = JSON.parse(partyJson!);
  expect(party.members).toHaveLength(2);
});

// ---------------------------------------------------------------------------
// Mounted-app pixel parity for the REVIEW WHO? picker.
//
// Drives the REAL ReviewMemberPage → PartyMemberPicker against the committed
// engine fixtures `review-who-exit` (cursor on EXIT, -1) and `review-who-member`
// (cursor on slot 0). The vitest parity test composes the frame directly; this
// verifies the MOUNTED canvas renders the same pixels.
//
// The 3 injected members MUST match the parity test's MEMBERS exactly (the
// canvas renders name/portraitIndex/hp/stamina/class, so those must be
// identical). See tools/parity/party-member-picker-parity.test.ts.
// ---------------------------------------------------------------------------

/** Mirror of party-member-picker-parity.test.ts `member()` — schema-valid
 *  ActivePartyMember with the fields that affect the rendered picker frame. */
function parityMember(
  idx: number,
  name: string,
  portraitIndex: number,
  hp: number,
  stamina: number,
  age: number,
  race: number,
  klass: number,
) {
  return {
    id: `00000000-0000-4000-8000-00000000000${idx + 1}`,
    name,
    race,
    class: klass,
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
    sex: 0,
    portraitSlotId: idx,
    rosterCharacterId: `00000000-0000-4000-8000-00000000000${idx + 1}`,
    portraitIndex,
    hpCurrent: hp,
    hpMax: hp,
    staminaCurrent: stamina,
    staminaMax: stamina,
    age,
  };
}

const PARITY_MEMBERS = [
  parityMember(0, 'THESUS', 0, 8, 126, 6590, 0, 0),
  parityMember(1, 'TEMPEST', 22, 9, 123, 7405, 10, 0),
  parityMember(2, 'LYSANDR', 20, 5, 87, 7265, 8, 3),
];

test('REVIEW WHO? picker mounted-canvas matches engine fixtures (EXIT + member)', async ({
  page,
}) => {
  // Inject the active party BEFORE navigation, mirroring how gotoCreation seeds
  // __WIZ6_E2E_STATE__. The store key is plain JSON ({schemaVersion, members}).
  await page.addInitScript((members) => {
    window.localStorage.setItem(
      'wiz6:active-party',
      JSON.stringify({ schemaVersion: 1, members }),
    );
  }, PARITY_MEMBERS);

  await page.goto('/castle/review-member');
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);

  // Cursor starts on EXIT (-1).
  await expectCanvasMatchesFixture(page, 'review-who-exit');

  // ArrowDown: EXIT (-1) → slot 0 (THESUS highlighted).
  await pressKeys(page, ['ArrowDown']);
  await expectCanvasMatchesFixture(page, 'review-who-member');
});
