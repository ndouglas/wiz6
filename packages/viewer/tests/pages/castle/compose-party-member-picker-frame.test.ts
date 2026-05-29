import { describe, it, expect } from 'vitest';
import { composePartyMemberPickerFrame } from '../../../src/pages/castle/compose-party-member-picker-frame.js';
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

describe('composePartyMemberPickerFrame', () => {
  it('returns one or more TileWindows', () => {
    const members = [mockMember('NATHAN', 0), mockMember('GANDALF', 1)];
    const windows = composePartyMemberPickerFrame({
      title: 'REVIEW WHO?',
      members,
      cursorIdx: 0,
      onCancel: false,
    });
    expect(windows.length).toBeGreaterThan(0);
  });

  it('places member name NATHAN at grid (col 2, row 1) in the picker window', () => {
    const members = [mockMember('NATHAN', 0), mockMember('GANDALF', 1)];
    const windows = composePartyMemberPickerFrame({
      title: 'REVIEW WHO?',
      members,
      cursorIdx: 0,
      onCancel: false,
    });
    const pickerWin = windows.find((w) => w.widthCells === 19 && w.heightCells === 5);
    expect(pickerWin).toBeDefined();
    const text = cellsAsString(pickerWin!);
    // Row 1 of the picker window: NATHAN should start at col 2.
    const row1 = text.split('\n')[1]!;
    expect(row1.slice(2, 8)).toBe('NATHAN');
  });

  it('places GANDALF (slot 1) at grid (col 11, row 1)', () => {
    const members = [mockMember('NATHAN', 0), mockMember('GANDALF', 1)];
    const windows = composePartyMemberPickerFrame({
      title: 'REVIEW WHO?',
      members,
      cursorIdx: 0,
      onCancel: false,
    });
    const pickerWin = windows.find((w) => w.widthCells === 19 && w.heightCells === 5);
    const text = cellsAsString(pickerWin!);
    const row1 = text.split('\n')[1]!;
    expect(row1.slice(11, 18)).toBe('GANDALF');
  });

  it('renders the banner title text somewhere in the windows', () => {
    const members = [mockMember('NATHAN', 0)];
    const windows = composePartyMemberPickerFrame({
      title: 'DISMISS WHO?',
      members,
      cursorIdx: 0,
      onCancel: false,
    });
    const allText = windows.map(cellsAsString).join('\n');
    expect(allText).toContain('DISMISS WHO?');
  });
});
