import { describe, it, expect } from 'vitest';
import { composePartyRow } from '../../../src/pages/castle/compose-party-row.js';
import type { ActivePartyMember } from '@wiz6/data';

function mockMember(name: string, slot: number): ActivePartyMember {
  return {
    id: `aaaaaaaa-aaaa-aaaa-aaaa-${slot.toString().padStart(12, '0')}`,
    name,
    race: 0, class: 0, sex: 0, level: 1, xp: 0, gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false, paralyzed: false,
    attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    savedOldLevel: 0, reaction: 0,
    portraitSlotId: slot,
    rosterCharacterId: `aaaaaaaa-aaaa-aaaa-aaaa-${slot.toString().padStart(12, '0')}`,
  };
}

function cellsAsString(win: { cells: Uint8Array; widthCells: number; heightCells: number }): string {
  let s = '';
  for (let y = 0; y < win.heightCells; y++) {
    for (let x = 0; x < win.widthCells; x++) {
      const charByte = win.cells[(y * win.widthCells + x) * 2]!;
      s += String.fromCharCode(charByte);
    }
    s += '\n';
  }
  return s;
}

describe('composePartyRow', () => {
  it('returns a 40×4 TileWindow at screen (0, 160)', () => {
    const win = composePartyRow({ members: [], currentSlot: 0 });
    expect(win.widthCells).toBe(40);
    expect(win.heightCells).toBe(4);
    expect(win.screenX).toBe(0);
    expect(win.screenY).toBe(160);
  });

  it('renders each party-member name in its mini-cell column', () => {
    const win = composePartyRow({
      members: [mockMember('NATHAN', 0), mockMember('GANDLF', 1)],
      currentSlot: 0,
    });
    const text = cellsAsString(win);
    expect(text).toContain('NATHAN');
    expect(text).toContain('GANDLF');
  });

  it('does not render absent slots', () => {
    const win = composePartyRow({ members: [mockMember('NATHAN', 0)], currentSlot: 0 });
    const text = cellsAsString(win);
    expect(text).toContain('NATHAN');
    expect(text).not.toContain('GANDLF');
  });
});
