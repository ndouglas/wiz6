import { beforeEach, describe, expect, it } from 'vitest';
import {
  readActiveParty,
  writeActiveParty,
  addMember,
  dismissAllMembers,
  availableRosterFor,
} from '../../src/lib/active-party-store.js';
import type { ActiveParty, Character, Roster } from '@wiz6/data';

function makeChar(id: string, name: string): Character {
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

const ID = (i: number) => `00000000-0000-0000-0000-${i.toString().padStart(12, '0')}`;

beforeEach(() => {
  window.localStorage.clear();
});

describe('active-party-store', () => {
  it('readActiveParty returns empty on first visit', () => {
    expect(readActiveParty()).toEqual({ schemaVersion: 1, members: [] });
  });

  it('writeActiveParty round-trips via readActiveParty', () => {
    const p: ActiveParty = { schemaVersion: 1, members: [] };
    writeActiveParty(p);
    expect(readActiveParty()).toEqual(p);
  });

  it('addMember appends with portraitSlotId=0 to an empty party', () => {
    addMember(makeChar(ID(1), 'NATHAN'));
    const p = readActiveParty();
    expect(p.members).toHaveLength(1);
    expect(p.members[0]!.id).toBe(ID(1));
    expect(p.members[0]!.portraitSlotId).toBe(0);
  });

  it('addMember allocates smallest unused portraitSlotId', () => {
    addMember(makeChar(ID(1), 'A'));
    addMember(makeChar(ID(2), 'B'));
    addMember(makeChar(ID(3), 'C'));
    expect(readActiveParty().members.map((m) => m.portraitSlotId)).toEqual([0, 1, 2]);
  });

  it('addMember throws when party is full', () => {
    for (let i = 0; i < 6; i++) addMember(makeChar(ID(i), `M${i}`));
    expect(() => addMember(makeChar(ID(99), 'EXTRA'))).toThrow(/full/);
  });

  it('addMember throws when adding a duplicate id', () => {
    addMember(makeChar(ID(1), 'NATHAN'));
    expect(() => addMember(makeChar(ID(1), 'NATHAN-COPY'))).toThrow(/already/);
  });

  it('dismissAllMembers empties the party', () => {
    addMember(makeChar(ID(1), 'A'));
    addMember(makeChar(ID(2), 'B'));
    dismissAllMembers();
    expect(readActiveParty().members).toEqual([]);
  });

  it('availableRosterFor returns roster minus active-party ids', () => {
    addMember(makeChar(ID(1), 'INPARTY'));
    const roster: Roster = {
      schemaVersion: 1,
      characters: [makeChar(ID(1), 'INPARTY'), makeChar(ID(2), 'AVAIL')],
    };
    const result = availableRosterFor(roster.characters, readActiveParty());
    expect(result.map((c) => c.id)).toEqual([ID(2)]);
  });
});
