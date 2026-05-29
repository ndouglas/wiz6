import { describe, it, expect } from 'vitest';
import { composeCharacterViewFrame } from '../../../src/pages/castle/compose-character-view-frame.js';
import type { ActivePartyMember, MessageDb } from '@wiz6/data';

function fakeDb(messages: Record<number, string>): MessageDb {
  return {
    indexedMessages: Object.entries(messages).map(([id, decodedText]) => ({
      id: Number(id),
      decodedText,
    })),
  } as unknown as MessageDb;
}

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

describe('composeCharacterViewFrame', () => {
  it('returns exactly 3 TileWindows (main, stats, party-row)', () => {
    const db = fakeDb({
      301: 'EQUIP', 302: 'SPELL', 303: 'TRADE', 304: 'ASSAY',
      305: 'SWAG', 306: 'MERGE', 307: 'USE', 308: 'DROP',
      309: 'SKILL', 310: 'EDIT', 311: 'REVIEW', 312: 'EXIT',
      0x64: 'HUMAN', 0x78: 'FIGHTER', 0x8c: 'MALE',
    });
    const windows = composeCharacterViewFrame({
      members: [mockMember('NATHAN', 0)],
      currentSlot: 0,
      cursorIdx: 11,
      db,
    });
    expect(windows).toHaveLength(3);
  });

  it('places the stats panel at (160, 32)', () => {
    const db = fakeDb({ 0x64: 'HUMAN', 0x78: 'FIGHTER', 0x8c: 'MALE' });
    const windows = composeCharacterViewFrame({
      members: [mockMember('NATHAN', 0)],
      currentSlot: 0,
      cursorIdx: 11,
      db,
    });
    const stats = windows.find((w) => w.screenX === 160 && w.screenY === 32);
    expect(stats).toBeDefined();
  });
});
