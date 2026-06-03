/**
 * spellbook-flow.spec.ts — e2e pixel parity for the camp SPELL read-only
 * spellbook viewer (WPCVW SPELL action, #073 Stage 4).
 *
 * Drives the REAL CharacterViewPage SPELL flow against the committed engine
 * fixtures `spellbook-grid-fire` (school grid, cursor on FIRE) and
 * `spellbook-sublist-fire` (drilled into FIRE: ENERGY BLAST highlighted,
 * COST 2). This is the runtime-wiring gate the vitest spellbook-parity test
 * can't provide — it catches a stale seed, mis-wired key handling, or a wrong
 * route in the MOUNTED app.
 *
 * Seed (NO hardcoded char fields — the stale-seed trap): TREON is loaded from
 * the PINNED pcfile via the SAME bridge the Stage-2 parity test uses
 * (decodePcfile → pcfileSlotToCharacter on populated slot 4 = M-Dracon MAGE).
 * That keeps TREON's stats / inventory / portrait / spellSlotsKnown bit-exact
 * with the roster the fixtures were captured from, so the composed char-sheet +
 * spellbook overlay matches pixel-for-pixel. Two filler members pad the party to
 * 3 so the action menu includes REVIEW (party_size >= 2) — giving the 7-entry
 * [EQUIP,SPELL,ASSAY,SWAG,SKILL,REVIEW,EXIT] menu the SPELL nav assumes. The
 * filler members never affect the spellbook pixels (composeSpellbookFrame reads
 * only the viewed member, TREON at slot 0).
 *
 * Drive (action menu, cursor on EXIT idx 6; column-major 2-row):
 *   ArrowLeft x3  → EXIT(6) → SKILL(4) → ASSAY(2) → EQUIP(0)
 *   ArrowDown     → EQUIP(0) → SPELL(1)
 *   Enter         → opens the spellbook on the FIRE school grid (school 0)  [grid fixture]
 *   Enter         → drills into FIRE (ENERGY BLAST selected, COST 2)        [sublist fixture]
 * FIRE is grid cell 0 (the default cursor), so no grid nav is needed before
 * drilling — matching the captured fixtures.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { pressKeys, expectCanvasMatchesFixture, loadFixtureRgba } from './lib/drive.js';
import { waitForNonBlankCanvas, waitForStableCanvas, captureCanvas } from './lib/canvas.js';
import { compareRgba } from '../../../tools/parity/diff-image.js';
import { decodePcfile, pcfileSlotToCharacter } from '../../parser/src/index.js';

const REPO_ROOT = resolve(new URL(import.meta.url).pathname, '..', '..', '..', '..');
const PINNED_PCFILE = resolve(REPO_ROOT, 'test-fixtures', 'original', 'pcfile.dbs');

const TREON_UUID = '00000000-0000-4000-8000-000000000005';

/** TREON = pinned roster populated-slot 4 (THESUS/TEMPEST/LYSANDR/NOBAL/TREON/
 *  PENTAG). Loaded via the pcfile bridge so all char-sheet + known-spell fields
 *  match the fixtures' roster exactly. Returned as a slot-0 ActivePartyMember. */
function loadTreon() {
  const pc = decodePcfile(new Uint8Array(readFileSync(PINNED_PCFILE)));
  const populated = pc.slots.filter((s) => s.populated);
  const slot = populated[4];
  if (!slot) throw new Error('pinned pcfile has no populated slot 4 (TREON)');
  const c = pcfileSlotToCharacter(slot, TREON_UUID);
  return { ...c, rosterCharacterId: TREON_UUID, portraitSlotId: 0 };
}

/** A minimal filler member — only pads the party so REVIEW appears. Never the
 *  viewed member, so its fields don't affect the spellbook pixels. */
function filler(name: string, portraitSlotId: number) {
  return {
    id: `00000000-0000-4000-8000-00000000010${portraitSlotId}`,
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
    portraitIndex: 0,
    hpCurrent: 8,
    hpMax: 8,
    staminaCurrent: 100,
    staminaMax: 100,
    age: 6570,
    portraitSlotId,
  };
}

test('camp SPELL spellbook mounted-canvas matches engine (FIRE grid + FIRE sublist)', async ({
  page,
}) => {
  const members = [loadTreon(), filler('FILLER1', 1), filler('FILLER2', 2)];

  // Freeze the spellbook cursor blink so the canvas matches the ON-phase
  // fixtures deterministically (the free-running blink would otherwise flicker
  // the cursor between ON/OFF and race expectCanvasMatchesFixture).
  await page.addInitScript(() => {
    (window as unknown as { __WIZ6_FREEZE_BLINK__?: boolean }).__WIZ6_FREEZE_BLINK__ = true;
  });

  // Inject the active party BEFORE navigation. CharacterViewPage reads
  // readActiveParty().members; TREON (slot 0) is the viewed member and supplies
  // the spellSlotsKnown bitset knownSpellsBySchool() reads for the SPELL viewer.
  await page.addInitScript((m) => {
    window.localStorage.setItem('wiz6:active-party', JSON.stringify({ schemaVersion: 1, members: m }));
  }, members);

  await page.goto('/castle/review-member/0');
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);

  // Action menu (cursor on EXIT idx 6). Left x3 → EQUIP(0), Down → SPELL(1),
  // Enter opens the spellbook on the FIRE school grid (school 0, cursor cell 0).
  await pressKeys(page, ['ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowDown', 'Enter']);
  await expectCanvasMatchesFixture(page, 'spellbook-grid-fire');

  // Enter drills into FIRE → sublist (ENERGY BLAST selected, COST 2).
  await pressKeys(page, ['Enter']);
  await expectCanvasMatchesFixture(page, 'spellbook-sublist-fire');
});

// CANCEL cell: from the FIRE grid, RIGHT (FIRE→EARTH) RIGHT (EARTH→off the grid
// → CANCEL) puts the cursor on the CANCEL sentinel (realm label "CANCEL", empty
// list; the selection cursor block moves onto the spell-panel power cell rather
// than any school icon — engine blinks it, we render the ON phase). ENTER on
// CANCEL exits the spellbook back to the
// char-view action menu — the same as ESC. We assert the CANCEL fixture, then
// that ENTER leaves the spell screen (canvas no longer matches the cancel frame).
test('camp SPELL CANCEL cell: RIGHT RIGHT reaches CANCEL, ENTER exits the spellbook', async ({
  page,
}) => {
  const members = [loadTreon(), filler('FILLER1', 1), filler('FILLER2', 2)];
  await page.addInitScript(() => {
    (window as unknown as { __WIZ6_FREEZE_BLINK__?: boolean }).__WIZ6_FREEZE_BLINK__ = true;
  });
  await page.addInitScript((m) => {
    window.localStorage.setItem('wiz6:active-party', JSON.stringify({ schemaVersion: 1, members: m }));
  }, members);

  await page.goto('/castle/review-member/0');
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);

  // Action menu → SPELL → FIRE grid (same reach as above).
  await pressKeys(page, ['ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowDown', 'Enter']);
  await expectCanvasMatchesFixture(page, 'spellbook-grid-fire');

  // RIGHT (FIRE→EARTH) RIGHT (EARTH→CANCEL) → the CANCEL cell.
  await pressKeys(page, ['ArrowRight', 'ArrowRight']);
  await expectCanvasMatchesFixture(page, 'spellbook-cancel');

  // ENTER on CANCEL exits the spellbook → action menu: the canvas must change
  // (no longer the CANCEL spell screen). The action-menu pixels are TREON's and
  // have no committed fixture, so we assert "left the spell screen" by diffing
  // against the CANCEL frame (must be < 100% match).
  await pressKeys(page, ['Enter']);
  await waitForStableCanvas(page, 'canvas');
  const cap = await captureCanvas(page, 'canvas');
  const cancelFrame = loadFixtureRgba('spellbook-cancel');
  const stillCancel = compareRgba(new Uint8Array(cap.rgba), cancelFrame, { tolerance: 0 });
  expect(
    stillCancel.matchPct,
    `after ENTER on CANCEL the canvas should leave the spell screen (got ${stillCancel.matchPct.toFixed(2)}% vs cancel)`,
  ).toBeLessThan(100);
});
