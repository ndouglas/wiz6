/**
 * add-party-flow.spec.ts — e2e verification that ADD PARTY MEMBER actually
 * adds a roster character to the active-party localStorage.
 *
 * User reported "ADD PARTY MEMBER no longer seems to add a party member" after
 * the master-options-labels fix. The label change didn't touch routing, but
 * we test the full flow end-to-end to either confirm a regression or refute
 * the report.
 *
 * Strategy:
 *   1) Seed localStorage with a single roster character (NATHAN) and an
 *      empty active party.
 *   2) Navigate to /castle.
 *   3) Cursor starts on slot 0 (ADD PARTY MEMBER). Press Enter to route to
 *      /castle/add-party.
 *   4) Press Enter to pick NATHAN (the only candidate; cursor defaults to 0).
 *   5) Page should auto-navigate back to /castle.
 *   6) Inspect localStorage: active party should now have 1 member with
 *      name=NATHAN.
 */

import { test, expect } from '@playwright/test';

const ID_A = '550e8400-e29b-41d4-a716-446655440000';

function makeNathan() {
  return {
    id: ID_A,
    name: 'NATHAN',
    race: 0,
    class: 0,
    sex: 0,
    level: 1,
    xp: 0,
    gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false,
    paralyzed: false,
    attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    savedOldLevel: 0,
    reaction: 0,
  };
}

test('ADD PARTY MEMBER picker adds a roster character to active party', async ({ page }) => {
  // Seed the roster + clear active party BEFORE the page reads them. The
  // viewer's RosterSchema stores a base64-encoded blob; the simpler shape
  // (writeRoster's plain JSON path) doesn't apply directly. Instead use
  // page.addInitScript to write the encoded form. But since encoding requires
  // the viewer's parser, easier: navigate first to mount the app, then call
  // writeRoster via page-side eval.
  const nathan = makeNathan();

  // Roster is stored gzip(JSON)→base64 by encodeRosterBase64. Easiest seed
  // path: navigate to a page that exposes the viewer's writeRoster + use it.
  // The simplest UI-driven seed: create a character via the creation flow.
  // But that's slow. Instead: load the roster page so the viewer's modules
  // are mounted, then call writeRoster through a dynamically-imported
  // module specifier the page can resolve.
  //
  // Simpler still: encode the roster ourselves with the same pipeline (gzip
  // → base64) via DecompressionStream / btoa. Since pako uses raw DEFLATE
  // wrapped in gzip headers, do it the standard way via CompressionStream.
  await page.goto('/');
  await page.evaluate(async (char) => {
    const json = JSON.stringify({ schemaVersion: 1, characters: [char] });
    // gzip via CompressionStream (Chrome/Firefox/Safari modern; matches pako.gzip output)
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    void writer.write(new TextEncoder().encode(json));
    void writer.close();
    const gz = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    // base64
    let s = '';
    for (let i = 0; i < gz.length; i++) s += String.fromCharCode(gz[i]!);
    const b64 = btoa(s);
    window.localStorage.setItem('wiz6:roster', b64);
    window.localStorage.setItem(
      'wiz6:active-party',
      JSON.stringify({ schemaVersion: 1, members: [] }),
    );
  }, nathan);

  // Now navigate to /castle so the seeded state takes effect.
  await page.goto('/castle');
  // Wait for the castle canvas to render.
  await page.waitForSelector('canvas', { timeout: 10_000 });
  await page.waitForTimeout(500); // give assets + RAF a beat to settle

  // Slot 0 (ADD PARTY MEMBER) is the first visible slot at first launch and
  // cursor defaults to selectedIdx=0. Press Enter to navigate to add-party.
  await page.keyboard.press('Enter');

  // Wait for AddPartyPage to mount.
  await page.waitForURL('**/castle/add-party', { timeout: 5_000 });
  await page.waitForTimeout(500);

  // Only one candidate (NATHAN); cursor defaults to 0. Press Enter to commit.
  await page.keyboard.press('Enter');

  // Should auto-navigate back to /castle.
  await page.waitForURL('**/castle', { timeout: 5_000 });
  await page.waitForTimeout(300);

  // Inspect localStorage: active party should now have 1 member.
  const partyJson = await page.evaluate(() => window.localStorage.getItem('wiz6:active-party'));
  expect(partyJson).not.toBeNull();
  const party = JSON.parse(partyJson!);
  expect(party.members).toHaveLength(1);
  expect(party.members[0].name).toBe('NATHAN');
  expect(party.members[0].id).toBe(ID_A);
  expect(party.members[0].rosterCharacterId).toBe(ID_A);
});

test('ADD PARTY MEMBER is hidden when every roster character is already in the active party', async ({ page }) => {
  // Seed: NATHAN is in the roster AND already in the active party.
  // pcFileHasUnloadedChars must compute false (nothing left to add); slot 0
  // must not appear in the menu.
  const nathan = makeNathan();
  const nathanInParty = { ...nathan, portraitSlotId: 0, rosterCharacterId: nathan.id };

  await page.goto('/');
  await page.evaluate(
    async ({ char, member }) => {
      const json = JSON.stringify({ schemaVersion: 1, characters: [char] });
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
        JSON.stringify({ schemaVersion: 1, members: [member] }),
      );
    },
    { char: nathan, member: nathanInParty },
  );

  await page.goto('/castle');
  await page.waitForSelector('canvas', { timeout: 10_000 });
  await page.waitForTimeout(500);

  // First visible slot should NOT be slot 0 (ADD PARTY MEMBER). Press Enter
  // and confirm the route is NOT /castle/add-party. The visible-menu screen
  // reader text in CastleScreen says "Currently selected: <label>." — match
  // on the aria text via accessibility tree to know which slot is first.
  const srOnly = await page.locator('[aria-label="Wizardry VI castle entrance"]').first();
  await expect(srOnly).toBeVisible();
  await page.keyboard.press('Enter');
  // Allow whatever navigation to happen.
  await page.waitForTimeout(500);
  const url = page.url();
  expect(url).not.toContain('/castle/add-party');
});
