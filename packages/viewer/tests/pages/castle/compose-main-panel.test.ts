import { describe, it, expect } from 'vitest';
import { composeMainPanel } from '../../../src/pages/castle/compose-main-panel.js';
import type { ActivePartyMember } from '@wiz6/data';

function mockMember(): ActivePartyMember {
  return {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name: 'NATHAN',
    race: 9, class: 0, sex: 0, level: 1, xp: 0, gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false, paralyzed: false,
    attributes: { str: 16, int: 8, pie: 12, vit: 10, dex: 8, spd: 8, per: 10, kar: 18 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    savedOldLevel: 0, reaction: 0,
    portraitSlotId: 0,
    rosterCharacterId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  };
}

function cellAt(win: { cells: Uint8Array; widthCells: number }, row: number, col: number): { char: number; attr: number } {
  const i = (row * win.widthCells + col) * 2;
  return { char: win.cells[i]!, attr: win.cells[i + 1]! };
}

describe('composeMainPanel', () => {
  it('returns a 40×20 TileWindow at screen (0, 0)', () => {
    const win = composeMainPanel({ member: mockMember() });
    expect(win.widthCells).toBe(40);
    expect(win.heightCells).toBe(20);
    expect(win.screenX).toBe(0);
    expect(win.screenY).toBe(0);
  });

  it('renders STR label at row 5 col 1 with yellow-highlight attr 0x50', () => {
    const win = composeMainPanel({ member: mockMember() });
    expect(cellAt(win, 5, 1).char).toBe(0x53); // 'S'
    expect(cellAt(win, 5, 1).attr).toBe(0x50);
    expect(cellAt(win, 5, 2).char).toBe(0x54); // 'T'
    expect(cellAt(win, 5, 3).char).toBe(0x52); // 'R'
  });

  it('renders STR value right-aligned at cols 5-6 with white-highlight attr 0x10', () => {
    const win = composeMainPanel({ member: mockMember() });
    // NATHAN has str=16; value renders as "16" at cols 5-6.
    expect(cellAt(win, 5, 5).char).toBe(0x31); // '1'
    expect(cellAt(win, 5, 5).attr).toBe(0x10);
    expect(cellAt(win, 5, 6).char).toBe(0x36); // '6'
  });

  it('right-pads single-digit values with a space at col 5', () => {
    const win = composeMainPanel({ member: mockMember() });
    // INT=8 → col 5 = ' ', col 6 = '8'
    expect(cellAt(win, 6, 5).char).toBe(0x20); // ' '
    expect(cellAt(win, 6, 6).char).toBe(0x38); // '8'
  });

  it('renders all 8 attribute rows STR..KAR from rows 5 through 12', () => {
    const win = composeMainPanel({ member: mockMember() });
    const expected = ['STR', 'INT', 'PIE', 'VIT', 'DEX', 'SPD', 'PER', 'KAR'];
    for (let i = 0; i < expected.length; i++) {
      const label = expected[i]!;
      const row = 5 + i;
      for (let c = 0; c < 3; c++) {
        expect(cellAt(win, row, 1 + c).char).toBe(label.charCodeAt(c));
      }
    }
  });
});
