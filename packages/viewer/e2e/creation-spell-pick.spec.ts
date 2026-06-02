/**
 * creation-spell-pick.spec.ts — E2E tests for the spell-picker screen.
 *
 * Two test groups:
 *
 * 1. Inject-state pixel-parity (6 cases) — inject `mageSpellPick` via
 *    `window.__WIZ6_E2E_STATE__`, fire key sequences to reach each fixture
 *    state, and assert 100% pixel match against the committed engine fixture.
 *
 * 2. Golden-path smoke (1 case) — drive the FULL creation flow from the
 *    character menu with NO injection: CREATE PC → name → race (Elf) → sex
 *    (Male) → class (Mage) → bonus allocator (drain pool, put ≥2 into INT) →
 *    personality → portrait → skill train → spell-pick (2 distinct spells) →
 *    confirm (YES). Asserts that a character ended up in the roster.
 *
 * Grid model (GRID mode, cursor starts on FIRE=school 0):
 *   Row 0 = {FIRE=0, WATER=1, AIR=2},  Row 1 = {EARTH=3, MENTAL=4, MAGIC=5}
 *   ArrowDown (+1, clamp col<2)  ArrowUp (-1, clamp col>0)
 *   ArrowRight (+3, clamp <3)    ArrowLeft (-3, clamp >=3)
 *   Enter → drill into school's sub-list
 *
 * SUB-LIST mode:
 *   ArrowUp/Down navigate within the list; Enter picks highlighted spell.
 *   After pick: if picks_done → SPELLS_DONE → confirm. Else → back to grid.
 */

import { test, expect } from '@playwright/test';
import { gotoCreation, pressKeys, expectCanvasMatchesFixture } from './lib/drive.js';
import { spellPickStateFor } from './lib/creation-states.js';

// ---------------------------------------------------------------------------
// 1. Inject-state pixel-parity cases
// ---------------------------------------------------------------------------
//
// Each case injects the M-Elf Mage at screen='spellPick' (school=0, grid mode),
// fires key sequence to reach the target cursor state, then asserts pixel parity.
//
// Navigation notes (school index after keys):
//   []                      → school 0 FIRE, grid mode
//   [↓]                     → school 1 WATER, grid mode   (ArrowDown = +1 in col 0)
//   [↓,↓]                   → school 2 AIR, grid mode
//   [→]                     → school 3 EARTH, grid mode   (ArrowRight = +3 in col 0)
//   [↓,Enter]               → school 1 WATER, sub-list, selectedIdx 0
//   [↓,Enter,↓]             → school 1 WATER, sub-list, selectedIdx 1

const PARITY_CASES: Array<{ fixture: string; keys: string[] }> = [
  // FIRE grid — start state (no keys needed)
  { fixture: 'creation-spell-pick',           keys: [] },
  // WATER grid — ArrowDown once
  { fixture: 'creation-spell-grid-water',     keys: ['ArrowDown'] },
  // AIR grid — ArrowDown twice
  { fixture: 'creation-spell-grid-air',       keys: ['ArrowDown', 'ArrowDown'] },
  // EARTH grid — ArrowRight once (row 1, col 0)
  { fixture: 'creation-spell-grid-earth',     keys: ['ArrowRight'] },
  // WATER sub-list, spell 0 (CHILL) — ArrowDown to WATER + Enter to drill
  { fixture: 'creation-spell-sublist-chill',  keys: ['ArrowDown', 'Enter'] },
  // WATER sub-list, spell 1 (TERROR) — ArrowDown + Enter + ArrowDown
  { fixture: 'creation-spell-sublist-terror', keys: ['ArrowDown', 'Enter', 'ArrowDown'] },
];

for (const c of PARITY_CASES) {
  test(`spell-pick full-screen parity — ${c.fixture}`, async ({ page }) => {
    // Each fixture was minted from a SEPARATE engine roll, so inject that
    // fixture's own committed sidecar draft (data-driven, can't go stale).
    await gotoCreation(page, spellPickStateFor(c.fixture));
    await pressKeys(page, c.keys);
    await expectCanvasMatchesFixture(page, c.fixture);
  });
}

// ---------------------------------------------------------------------------
// 2. Golden-path smoke: create a Mage with two distinct spells end-to-end
// ---------------------------------------------------------------------------
//
// Drives the REAL app from the character menu (no injection).
//
// Key sequence translated from CreationPage.integration.test.tsx (Mage caster
// path + Fighter happy-path):
//
//   CharacterMenu (EMPTY → cursor at CREATE PC)
//     Enter                   → MENU_CREATE → screen='name'
//
//   Name (type 4 chars + Enter)
//     M, A, G, E, Enter       → draft.name='MAGE', screen='race'
//
//   Race (vertical list, start at Human=0; Elf=1)
//     ArrowDown               → cursor=1 (Elf)
//     Enter                   → PICK_RACE{1} → bonus roll → screen='sex'
//
//   Sex (start at Male=0)
//     Enter                   → PICK_SEX{0} → screen='class'
//
//   Class (offered list; Elf with min pool≥5 always has Fighter=0 and Mage=1)
//     ArrowDown               → cursor=1 (Mage)
//     Enter                   → PICK_CLASS{1} → screen='bonusAllocator'
//
//   BonusAllocator (cursor starts at STR=0; need to drain pool and get INT≥12)
//     ArrowDown               → cursor=INT (1)
//     ArrowRight ×8           → adds up to 8 to INT (Elf int=10→18; excess is no-op)
//     ArrowDown               → cursor=PIE (2)
//     ArrowRight ×8           → drains remaining pool into PIE
//     ArrowDown               → cursor=VIT (3)
//     ArrowRight ×8           → continue draining
//     ArrowDown               → cursor=DEX (4)
//     ArrowRight ×8           → continue draining
//     Enter                   → ALLOC_CONFIRM (only fires when pool==0)
//                               (if pool not yet 0, this is a no-op beep; the
//                                loop above drains 32 capacity for max pool 26)
//
//   Personality (Enter to accept karma roll)
//     Enter                   → screen='portrait'
//
//   Portrait (starts at index 0; Enter picks it)
//     Enter                   → PICK_PORTRAIT{0} → screen='skillTrain'
//
//   SkillTrain (drain budget with ArrowRight, then Enter exits)
//     ArrowRight ×30          → trains up to 30 skill points (max budget is ~29)
//     Enter                   → SKILLS_DONE → screen='spellPick'
//
//   SpellPick (Mage needs 2 picks from its book)
//     Enter                   → drill into FIRE sub-list (school 0)
//     Enter                   → pick FIRE spell 0 (ENERGY BLAST) → back to grid
//     ArrowDown               → cursor=WATER (school 1)
//     Enter                   → drill into WATER sub-list
//     Enter                   → pick WATER spell 0 → 2/2 → SPELLS_DONE → screen='confirm'
//
//   Confirm (cursor starts at YES)
//     Enter                   → CONFIRM{keep:true} → COMMIT_DONE → characterMenu

test('golden path: create a Mage and pick two distinct spells end-to-end', async ({ page }) => {
  // No injection — real character menu.
  await gotoCreation(page);

  await pressKeys(page, [
    // Character menu → Create PC
    'Enter',

    // Name screen: "MAGE" + Enter
    'M', 'A', 'G', 'E', 'Enter',

    // Race: ArrowDown to Elf (index 1), Enter
    'ArrowDown',
    'Enter',

    // Sex: Enter (Male = first = index 0)
    'Enter',

    // Class: ArrowDown to Mage (2nd offered entry for Elf), Enter
    'ArrowDown',
    'Enter',

    // BonusAllocator: navigate to INT first, drain pool
    // cursor starts at STR (0) → ArrowDown to INT (1)
    'ArrowDown',
    // pump INT: adds up to 8 (Elf int=10, cap=18; Mage needs ≥12, so +2 minimum)
    'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight',
    'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight',
    // ArrowDown to PIE (2), drain remaining pool
    'ArrowDown',
    'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight',
    'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight',
    // ArrowDown to VIT (3)
    'ArrowDown',
    'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight',
    'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight',
    // ArrowDown to DEX (4)
    'ArrowDown',
    'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight',
    'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight',
    // Confirm allocation (Enter; valid only when pool==0)
    'Enter',

    // Personality: Enter to accept karma roll
    'Enter',

    // Portrait: Enter to pick portrait 0
    'Enter',

    // SkillTrain: drain budget with ArrowRight, then Enter to exit
    'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight',
    'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight',
    'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight',
    'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight',
    'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight',
    'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight',
    'Enter',

    // SpellPick: pick FIRE spell 0, then WATER spell 0 (2 distinct picks)
    'Enter',     // drill into FIRE sub-list (school 0)
    'Enter',     // pick FIRE spell 0 → back to grid
    'ArrowDown', // cursor → WATER (school 1)
    'Enter',     // drill into WATER sub-list
    'Enter',     // pick WATER spell 0 → 2/2 → SPELLS_DONE → confirm

    // Confirm: Enter = YES → commit character
    'Enter',
  ]);

  // Wait for the character to be committed (up to 10s for react re-render +
  // localStorage write). The roster is stored as base64-gzipped JSON under
  // 'wiz6:roster'. We wait until it is non-null, then decompress in Node.
  await page.waitForFunction(
    () => window.localStorage.getItem('wiz6:roster') !== null,
    { timeout: 10_000 },
  );

  // Retrieve the raw base64 value and decode it in Node (no browser async needed).
  const b64 = await page.evaluate(() => window.localStorage.getItem('wiz6:roster') ?? '');
  expect(b64.length, 'wiz6:roster should be non-empty after commit').toBeGreaterThan(0);

  // Decompress in Node to extract the character count.
  const { gunzipSync } = await import('zlib');
  const raw = Buffer.from(b64, 'base64');
  const json = gunzipSync(raw).toString('utf-8');
  const roster = JSON.parse(json) as { characters: unknown[] };

  expect(roster.characters.length).toBeGreaterThan(0);
});
