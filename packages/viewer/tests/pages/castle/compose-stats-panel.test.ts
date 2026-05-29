import { describe, it, expect } from 'vitest';
import { composeStatsPanel } from '../../../src/pages/castle/compose-stats-panel.js';
import type { ActivePartyMember, MessageDb } from '@wiz6/data';

function fakeDb(messages: Record<number, string>): MessageDb {
  return {
    indexedMessages: Object.entries(messages).map(([id, decodedText]) => ({
      id: Number(id),
      decodedText,
    })),
  } as unknown as MessageDb;
}

function mockMember(name: string): ActivePartyMember {
  return {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name,
    race: 0, class: 0, sex: 0, level: 5, xp: 100, gold: 50,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false, paralyzed: false,
    attributes: { str: 12, int: 13, pie: 14, vit: 15, dex: 16, spd: 17, per: 18, kar: 50 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    savedOldLevel: 0, reaction: 0,
    portraitSlotId: 0,
    rosterCharacterId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
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

describe('composeStatsPanel', () => {
  it('returns a 20×16 TileWindow at screen (160, 32)', () => {
    const db = fakeDb({ 0x64: 'HUMAN', 0x78: 'FIGHTER', 0x8c: 'MALE' });
    const win = composeStatsPanel(mockMember('NATHAN'), db);
    expect(win.widthCells).toBe(20);
    expect(win.heightCells).toBe(16);
    expect(win.screenX).toBe(160);
    expect(win.screenY).toBe(32);
  });

  it('renders the character name in the panel', () => {
    const db = fakeDb({ 0x64: 'HUMAN', 0x78: 'FIGHTER', 0x8c: 'MALE' });
    const win = composeStatsPanel(mockMember('NATHAN'), db);
    expect(cellsAsString(win)).toContain('NATHAN');
  });

  it('renders attribute values STR=12 INT=13 etc.', () => {
    const db = fakeDb({ 0x64: 'HUMAN', 0x78: 'FIGHTER', 0x8c: 'MALE' });
    const win = composeStatsPanel(mockMember('NATHAN'), db);
    const text = cellsAsString(win);
    expect(text).toContain('12');
    expect(text).toContain('13');
    expect(text).toContain('18');
  });
});
