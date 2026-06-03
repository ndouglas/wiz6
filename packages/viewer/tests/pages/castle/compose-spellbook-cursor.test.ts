/**
 * compose-spellbook-cursor.test.ts — unit gate for the selection-cursor BLINK
 * gating in composeSpellbookFrame (cursorOn flag).
 *
 * The engine blinks the SPELL viewer's selection cursor (~2-3 frames ON / ~2 OFF,
 * verified by frame-stepping the spellbook-grid/cancel/sublist recipes). The
 * composer renders the ON phase by default (cursorOn defaults true — the static
 * pixel-parity fixtures gate that) and the OFF phase when cursorOn=false (the
 * running CharacterViewPage toggles it via a blink timer). These tests pin the
 * CELL-LEVEL difference: cursorOn=false must drop the cursor block / highlight
 * so the underlying cell shows. Pixel-exactness of each phase is gated separately
 * by tools/parity/spellbook-parity.test.ts (spellbook-cancel ON + -cancel-off).
 *
 * NOTE: these compare CELLS, not pixels (a diagnostic of the gating), so the
 * assertion is "the cursor cell DIFFERS between ON and OFF", not a colour claim.
 */
import { describe, it, expect } from 'vitest';
import { composeSpellbookFrame } from '../../../src/pages/castle/compose-spellbook.js';
import { SPELL_CANCEL_CELL } from '../../../src/pages/castle/character-view-reducer.js';
import type { ActivePartyMember, MessageDb } from '@wiz6/data';

function fakeDb(): MessageDb {
  return { indexedMessages: [] } as unknown as MessageDb;
}

/** A MAGE-ish member known to have Fire-L1 + Mental-L1 known spells is not
 *  needed here — we only assert the cursor cells, which draw regardless of the
 *  known-spell list. An empty-spellbook member is fine. */
function mockMember(): ActivePartyMember {
  return {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name: 'TESTER',
    race: 0, class: 0, sex: 0, level: 1, xp: 0, gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false, paralyzed: false,
    attributes: { str: 10, int: 10, pie: 10, vit: 10, dex: 10, spd: 10, per: 10, kar: 10 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    savedOldLevel: 0, reaction: 0,
    portraitSlotId: 0,
    rosterCharacterId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    spellSlotsKnown: new Array(60).fill(0),
  } as unknown as ActivePartyMember;
}

function cell(win: { cells: Uint8Array; widthCells: number }, col: number, row: number) {
  const i = (row * win.widthCells + col) * 2;
  return { char: win.cells[i]!, attr: win.cells[i + 1]! };
}

const base = { member: mockMember(), db: fakeDb(), spellIdx: 0 } as const;

describe('composeSpellbookFrame cursor-blink gating (cursorOn)', () => {
  it('grid mode: cursorOn=false omits the school-cursor block so the icon cell differs', () => {
    // FIRE = school 0, icon at the main panel `top` window cell (1,14).
    const on = composeSpellbookFrame({ ...base, school: 0, mode: 'grid', cursorOn: true });
    const off = composeSpellbookFrame({ ...base, school: 0, mode: 'grid', cursorOn: false });
    const main = 0; // windows[0] = main panel
    const onCell = cell(on[main]!, 1, 14);
    const offCell = cell(off[main]!, 1, 14);
    // ON = the solid cursor block (wfont0 0x63 @ attr 0x50); OFF = the normal icon.
    expect(onCell.char).toBe(0x63);
    expect(onCell.attr).toBe(0x50);
    expect(offCell).not.toEqual(onCell);
  });

  it('grid mode default (no cursorOn) renders the ON cursor block', () => {
    const def = composeSpellbookFrame({ ...base, school: 0, mode: 'grid' });
    expect(cell(def[0]!, 1, 14)).toEqual({ char: 0x63, attr: 0x50 });
  });

  it('cancel cell: cursorOn=false omits the cursor block at outer (1,12)', () => {
    // outer = windows[2]; CANCEL cursor block at cell (1,12).
    const on = composeSpellbookFrame({ ...base, school: SPELL_CANCEL_CELL, mode: 'grid', cursorOn: true });
    const off = composeSpellbookFrame({ ...base, school: SPELL_CANCEL_CELL, mode: 'grid', cursorOn: false });
    const onCell = cell(on[2]!, 1, 12);
    const offCell = cell(off[2]!, 1, 12);
    expect(onCell).toEqual({ char: 0x63, attr: 0x50 });
    expect(offCell).not.toEqual(onCell);
  });

  it('sublist mode: cursorOn=false drops the selected-spell highlight to black (attr 0x00)', () => {
    // ENERGY-BLAST-less member: the FIRE list is empty, so to exercise the
    // highlight we use a member with a known FIRE spell. Mock a single Fire-L1.
    const m = mockMember();
    (m as unknown as { spellSlotsKnown: number[] }).spellSlotsKnown[0] = 1; // FIRE slot 0 known
    const on = composeSpellbookFrame({ member: m, db: fakeDb(), school: 0, mode: 'sublist', spellIdx: 0, cursorOn: true });
    const off = composeSpellbookFrame({ member: m, db: fakeDb(), school: 0, mode: 'sublist', spellIdx: 0, cursorOn: false });
    const inner = 3; // windows[3] = inner spell list
    // Highlight bar spans inner row 3 (the anchored selected spell). ON = realm
    // attr (FIRE 0x40); OFF = black (0x00).
    const onBar = cell(on[inner]!, 5, 3);
    const offBar = cell(off[inner]!, 5, 3);
    expect(onBar.attr).toBe(0x40);
    expect(offBar.attr).toBe(0x00);
  });
});
