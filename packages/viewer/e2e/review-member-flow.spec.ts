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

  // EXIT — the action menu's cursor starts on EXIT (engine default), and Escape
  // exits regardless: the reducer maps ESCAPE → exit-castle in the action-menu
  // state (character-view-reducer.ts), which navigates to /castle.
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

// ---------------------------------------------------------------------------
// Mounted-app pixel parity for the REVIEW MEMBER character view.
//
// Drives the REAL CharacterViewPage (route /castle/review-member/:slotIdx)
// against the committed `review-member-view` fixture. The vitest parity test
// (tools/parity/screen-parity.test.ts → renderReviewMemberView) composes the
// frame directly; THIS verifies the runtime wiring (scenario-db load,
// buildInventoryItems, EXIT-initial cursor, conditional REVIEW) renders the
// same pixels in the mounted app — the runtime-wiring gate the vitest test
// can't provide (the class of bug SP1's e2e caught: a missing font arg → 204px
// diff).
//
// The 3 injected members MUST match renderReviewMemberView's THESUS/TEMPEST/
// LYSANDR EXACTLY (the canvas renders portrait/equipment/char-sheet from these
// fields). THESUS (slot 0, the viewed member) carries the real 22-slot
// inventory so buildInventoryItems produces the 5-item list.
// ---------------------------------------------------------------------------

/** THESUS's 5 equipped items in on-disk inventory-slot shape (22 slots,
 *  schema-required). Mirrors renderReviewMemberView's `inventory`. */
const THESUS_INVENTORY = [
  { itemId: 8, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 },   // LONGSWORD
  { itemId: 135, weight: 0, equipSlot: 7, spriteIdx: 0, quantity: 0, flags: 0 },  // LEATHER CUIRASS
  { itemId: 132, weight: 0, equipSlot: 8, spriteIdx: 0, quantity: 0, flags: 0 },  // FUR LEGGING
  { itemId: 130, weight: 0, equipSlot: 10, spriteIdx: 0, quantity: 0, flags: 0 }, // SANDALS
  { itemId: 141, weight: 0, equipSlot: 11, spriteIdx: 0, quantity: 0, flags: 0 }, // BUCKLER SHIELD
  ...Array.from({ length: 17 }, () => ({
    itemId: 0, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0,
  })),
];

// Mirror of renderReviewMemberView's THESUS (slot 0) — Human Fighter, real
// inventory, encumbrance + age that drive the char-sheet CC + AGE rows.
const VIEW_THESUS = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'THESUS',
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
  attributes: { str: 18, int: 8, pie: 8, vit: 12, dex: 10, spd: 9, per: 8, kar: 14 },
  schoolMana: [0, 0, 0, 0, 0, 0],
  schoolManaMax: [0, 0, 0, 0, 0, 0],
  skills: new Array(30).fill(0),
  reaction: 50,
  // Rendered-portrait selector. renderReviewMemberView keeps the record's
  // +0x1ac portraitIndex field (10) but overrides the RENDERED portrait to 0
  // (the engine's +0x19c selector) when patching the fontset. CharacterViewPage
  // drives the rendered face directly from member.portraitIndex, so to match
  // the fixture's face the injected member's portraitIndex must be 0.
  portraitIndex: 0,
  hpCurrent: 8,
  hpMax: 8,
  staminaCurrent: 126,
  staminaMax: 126,
  encumbranceCurrent: 295,
  encumbranceMax: 2700,
  age: 18 * 365 + 100,
  portraitSlotId: 0,
  rosterCharacterId: '00000000-0000-0000-0000-000000000001',
  inventory: THESUS_INVENTORY,
};

/** Mirror of renderReviewMemberView's makeStubMember — TEMPEST/LYSANDR fill
 *  out the party to 3 (so REVIEW appears) but aren't the viewed member. */
function viewStubMember(name: string, portraitSlotId: number) {
  return {
    id: `00000000-0000-0000-0000-00000000000${portraitSlotId + 2}`,
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
    attributes: { str: 15, int: 11, pie: 8, vit: 12, dex: 12, spd: 14, per: 8, kar: 0 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    reaction: 50,
    portraitIndex: 0,
    hpCurrent: 8,
    hpMax: 8,
    staminaCurrent: 100,
    staminaMax: 100,
    age: 6570,
    portraitSlotId,
  };
}

const VIEW_MEMBERS = [VIEW_THESUS, viewStubMember('TEMPEST', 1), viewStubMember('LYSANDR', 2)];

test('REVIEW MEMBER character view matches engine (equipment + EXIT cursor)', async ({ page }) => {
  // Inject the 3-member party BEFORE navigation. CharacterViewPage reads
  // readActiveParty().members; THESUS (slot 0) carries the inventory that
  // buildInventoryItems resolves into the 5-item equipment list.
  await page.addInitScript((members) => {
    window.localStorage.setItem(
      'wiz6:active-party',
      JSON.stringify({ schemaVersion: 1, members }),
    );
  }, VIEW_MEMBERS);

  await page.goto('/castle/review-member/0');
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);

  // Initial mount: action menu with EXIT highlighted, REVIEW present (3 members),
  // EDIT absent (allowEditFromCamp defaults OFF) — matches the fixture's
  // 7-entry menu [EQUIP,SPELL,ASSAY,SWAG,SKILL,REVIEW,EXIT].
  await expectCanvasMatchesFixture(page, 'review-member-view');
});

// ---------------------------------------------------------------------------
// Mounted-app pixel parity + completion for the EQUIP wizard.
//
// Drives the REAL CharacterViewPage's EQUIP flow: from the action menu (cursor
// on EXIT), navigate LEFT to EQUIP and Enter into the per-slot picker, then
// assert the mounted canvas matches the committed `equip-slot0` fixture (the
// slot-0 picker — LONGSWORD candidate highlighted, "SELECT PRIMARY WEAPON >
// NONE"). This gates the MOUNTED wizard render against engine ground truth: the
// SP1-class wiring check the vitest renderEquipSlot0 parity test can't provide.
//
// Then drive the wizard to completion (Enter through each populated body slot)
// and assert the persisted equipment array reflects the picks — equipment[0] is
// the LONGSWORD inventory index (0), not 0xff.
//
// Action menu (3-member party, EDIT off): 7 entries
//   [EQUIP,SPELL,ASSAY,SWAG,SKILL,REVIEW,EXIT] — column-major 2-row.
// EXIT = idx 6 (initial cursor). nextActionCursor ArrowLeft = idx>=2 ? idx-2.
//   6 → 4 (SKILL) → 2 (ASSAY) → 0 (EQUIP): three ArrowLefts land on EQUIP.
//
// THESUS's populated body slots (equipCandidates non-empty), per
// equip-logic.test.ts body-slot map: 0 (weapon/LONGSWORD), 1 (shield/BUCKLER),
// 4 (chest/CUIRASS), 5 (legs/FUR LEGGING), 7 (feet/SANDALS). The wizard walks
// only populated slots; each slot's cursor starts on candidate 0, so 5 Enters
// pick the first candidate per slot, then commit-equip returns to the menu.
// ---------------------------------------------------------------------------
test('EQUIP wizard mounted-canvas matches equip-slot0 + persists equipment', async ({ page }) => {
  await page.addInitScript((members) => {
    window.localStorage.setItem(
      'wiz6:active-party',
      JSON.stringify({ schemaVersion: 1, members }),
    );
  }, VIEW_MEMBERS);

  await page.goto('/castle/review-member/0');
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);

  // Action menu, cursor on EXIT (idx 6). ArrowLeft ×3 → EQUIP (idx 0). Enter.
  await pressKeys(page, ['ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'Enter']);

  // Mounted EQUIP slot-0 picker must match the engine fixture pixel-exact.
  await expectCanvasMatchesFixture(page, 'equip-slot0');

  // Drive the wizard to completion: Enter through each populated body slot
  // (0,1,4,5,7 → 5 slots), each picking candidate 0 (cursor default). The last
  // Enter commits → commit-equip → updateActiveMember → back to action menu.
  await pressKeys(page, ['Enter', 'Enter', 'Enter', 'Enter', 'Enter']);
  await page.waitForTimeout(200);

  // Persisted equipment reflects the picks. equipment[0] (weapon body slot) is
  // the LONGSWORD's inventory index (0), NOT 0xff (255).
  const partyJson = await page.evaluate(() =>
    window.localStorage.getItem('wiz6:active-party'),
  );
  expect(partyJson).not.toBeNull();
  const party = JSON.parse(partyJson!) as {
    members: Array<{ equipment?: number[] }>;
  };
  const equipment = party.members[0]!.equipment;
  expect(equipment).toBeDefined();
  expect(equipment![0]).toBe(0); // LONGSWORD inv idx in weapon slot
  expect(equipment![0]).not.toBe(0xff);
});

// ---------------------------------------------------------------------------
// Mounted-app pixel parity for the ASSAY flow (picker → inspect popup).
//
// Drives the REAL CharacterViewPage's ASSAY flow against the committed engine
// fixtures `assay-picker` (carried-item picker, cursor on NONE) and
// `assay-longsword` (read-only stat popup for LONGSWORD). This gates the
// MOUNTED wiring (scanCarried ordered scan → carried/items alignment,
// scenarioDb load, assayItem descriptor) against engine ground truth — the
// runtime-wiring class of bug the vitest renderAssayPicker/renderAssayDisplay
// parity tests can't catch.
//
// Action menu (3-member party, EDIT off): 7 entries
//   [EQUIP,SPELL,ASSAY,SWAG,SKILL,REVIEW,EXIT] — column-major 2-row.
// EXIT = idx 6 (initial cursor). nextActionCursor ArrowLeft = idx>=2 ? idx-2.
//   6 → 4 (SKILL) → 2 (ASSAY): two ArrowLefts land on ASSAY.
//
// Picker order (THESUS, inventory itemId>0 scan): [LONGSWORD(0), LEATHER
// CUIRASS(1), FUR LEGGING(2), SANDALS(3), BUCKLER SHIELD(4)], NONE at index 5.
// The picker opens with the cursor on NONE. Per the engine nav (#072), a single
// ArrowUp from NONE jumps to the TOP item = LONGSWORD (index 0).
// ---------------------------------------------------------------------------
test('ASSAY flow mounted-canvas matches assay-picker + assay-longsword', async ({ page }) => {
  await page.addInitScript((members) => {
    window.localStorage.setItem(
      'wiz6:active-party',
      JSON.stringify({ schemaVersion: 1, members }),
    );
  }, VIEW_MEMBERS);

  await page.goto('/castle/review-member/0');
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);

  // Action menu, cursor on EXIT (idx 6). ArrowLeft ×2 → ASSAY (idx 2). Enter
  // opens the picker with the cursor on NONE.
  await pressKeys(page, ['ArrowLeft', 'ArrowLeft', 'Enter']);

  // Mounted ASSAY picker (cursor on NONE) must match the engine fixture.
  await expectCanvasMatchesFixture(page, 'assay-picker');

  // ArrowUp from NONE → TOP item = LONGSWORD (index 0); Enter inspects it.
  await pressKeys(page, ['ArrowUp', 'Enter']);

  // Mounted inspect popup for LONGSWORD must match the engine fixture.
  await expectCanvasMatchesFixture(page, 'assay-longsword');

  // Enter dismisses the popup → back to the action menu (cursor on EXIT). The
  // canvas is non-blank and is NOT the popup (the assay-longsword pixels gone).
  await pressKeys(page, ['Enter']);
  await page.waitForTimeout(200);
  await waitForNonBlankCanvas(page, 'canvas', 500, 10_000);
  await expectCanvasMatchesFixture(page, 'review-member-view');
});

// ---------------------------------------------------------------------------
// Mounted-app pixel parity for the read-only SKILL viewer.
//
// Drives the REAL CharacterViewPage's SKILL flow against the committed engine
// fixtures skill-viewer-{weaponry,physical,academia}. Gates the MOUNTED wiring
// (skillViewerRows visibility, skillName resolution, dynamic skillTabEntries,
// hasPersonalSkills gating) against engine ground truth.
//
// Action menu (3-member party, EDIT off): 7 entries
//   [EQUIP,SPELL,ASSAY,SWAG,SKILL,REVIEW,EXIT] — column-major 2-row.
// EXIT = idx 6. ArrowLeft (idx>=2 ? idx-2) → 4 = SKILL. Enter → viewer (WEAPONRY).
//
// Tab nav: the viewer opens on WEAPONRY (cat 0), cursor on the first picker
// entry (PHYSICAL). The reducer resets the cursor to 0 on a category switch, so
// to land on the cursor positions the physical/academia fixtures captured we
// drive an extra arrow:
//   WEAPONRY (cat0, cursor0=PHYSICAL)
//     → Enter → PHYSICAL (cat1, cursor0=WEAPONRY) → ArrowDown → cursor1=ACADEMIA  [= physical fixture]
//     → Enter → ACADEMIA (cat3, cursor0=WEAPONRY) → ArrowRight → cursor2=EXIT      [= academia fixture]
//     → Enter (EXIT) → back to the action menu.
// THESUS WEAPONRY skills: SWORD(slot1)=10, SHIELD(slot8)=2 — must match the
// fixtures (rendered with those values). See screen-parity.test.ts renderSkillViewer.
// ---------------------------------------------------------------------------
test('SKILL viewer mounted-canvas matches engine fixtures (3 categories + exit)', async ({ page }) => {
  const skills = new Array(30).fill(0) as number[];
  skills[1] = 10; // SWORD
  skills[8] = 2;  // SHIELD
  const skillMembers = [{ ...VIEW_THESUS, skills }, VIEW_MEMBERS[1]!, VIEW_MEMBERS[2]!];

  await page.addInitScript((members) => {
    window.localStorage.setItem(
      'wiz6:active-party',
      JSON.stringify({ schemaVersion: 1, members }),
    );
  }, skillMembers);

  await page.goto('/castle/review-member/0');
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);

  // Action menu, cursor on EXIT (idx 6). ArrowLeft → SKILL (idx 4). Enter → viewer.
  await pressKeys(page, ['ArrowLeft', 'Enter']);
  await expectCanvasMatchesFixture(page, 'skill-viewer-weaponry');

  // → PHYSICAL view, cursor driven to ACADEMIA (matches the physical fixture).
  await pressKeys(page, ['Enter', 'ArrowDown']);
  await expectCanvasMatchesFixture(page, 'skill-viewer-physical');

  // → ACADEMIA view, cursor driven to EXIT (matches the academia fixture).
  await pressKeys(page, ['Enter', 'ArrowRight']);
  await expectCanvasMatchesFixture(page, 'skill-viewer-academia');

  // Enter on EXIT → back to the action menu (read-only: party unchanged).
  await pressKeys(page, ['Enter']);
  await page.waitForTimeout(200);
  await expectCanvasMatchesFixture(page, 'review-member-view');
});

// ---------------------------------------------------------------------------
// Mounted-app pixel parity + mutation for the SWAG BAG manager.
//
// Drives the REAL CharacterViewPage SWAG flow against the committed engine
// fixtures swag-empty + swag-longsword, then verifies the persisted inventory
// reflects the carried→bag move.
//
// Action menu (3-member party): [EQUIP,SPELL,ASSAY,SWAG,SKILL,REVIEW,EXIT],
// column-major 2-row. EXIT=6. SWAG=3 (c1r1): Left(6→4) Left(4→2) Down(2→3).
// SWAG menu (empty bag): [ADD, EXIT] (REMOVE/DROP hidden), cursor on EXIT (1).
//   ArrowUp → ADD (0), Enter → add-picker (cursor on NONE). Per the engine nav
//   (#072), ArrowUp from NONE → TOP item = LONGSWORD (index 0); Enter commits →
//   bag=[LONGSWORD], menu becomes [ADD,REMOVE,DROP,EXIT], cursor EXIT.
// ---------------------------------------------------------------------------
test('SWAG BAG mounted-canvas matches fixtures + persists the carried→bag move', async ({ page }) => {
  await page.addInitScript((members) => {
    window.localStorage.setItem('wiz6:active-party', JSON.stringify({ schemaVersion: 1, members }));
  }, VIEW_MEMBERS);

  await page.goto('/castle/review-member/0');
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);

  // Action menu (cursor EXIT) → SWAG. Empty bag menu must match the fixture.
  await pressKeys(page, ['ArrowLeft', 'ArrowLeft', 'ArrowDown', 'Enter']);
  await expectCanvasMatchesFixture(page, 'swag-empty');

  // ADD (ArrowUp → ADD, Enter → picker), then ArrowUp from NONE → LONGSWORD,
  // Enter commits the carried→bag move. Resulting bag-with-LONGSWORD must match.
  await pressKeys(page, ['ArrowUp', 'Enter']);
  await pressKeys(page, ['ArrowUp', 'Enter']);
  await expectCanvasMatchesFixture(page, 'swag-longsword');

  // Persisted: LONGSWORD (id 8) moved to bag slot 10; carried compacted (slot 0
  // is now LEATHER CUIRASS id 135).
  const partyJson = await page.evaluate(() => window.localStorage.getItem('wiz6:active-party'));
  const party = JSON.parse(partyJson!) as { members: Array<{ inventory: Array<{ itemId: number }> }> };
  const inv = party.members[0]!.inventory;
  expect(inv[10]!.itemId).toBe(8);   // LONGSWORD now in the bag
  expect(inv[0]!.itemId).toBe(135);  // carried compacted up
});
