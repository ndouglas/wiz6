import { beforeEach, describe, expect, it } from 'vitest';
import {
  readActiveParty,
  writeActiveParty,
  addMember,
  dismissAllMembers,
  dismissMember,
  availableRosterFor,
  updateActiveMember,
} from '../../src/lib/active-party-store.js';
import { readRoster, writeRoster } from '../../src/lib/roster-store.js';
import type { ActiveParty, ActivePartyMember, Character, Roster } from '@wiz6/data';

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

const ID_A = '550e8400-e29b-41d4-a716-446655440000';
const ID_B = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe('dismissMember', () => {
  it('removes the member at the given slot index', () => {
    addMember(makeChar(ID_A, 'NATHAN'));
    addMember(makeChar(ID_B, 'GANDALF'));
    expect(readActiveParty().members).toHaveLength(2);
    dismissMember(0);
    const after = readActiveParty();
    expect(after.members).toHaveLength(1);
    expect(after.members[0]!.name).toBe('GANDALF');
  });

  it('preserves remaining members after dismiss in original relative order', () => {
    addMember(makeChar(ID_A, 'NATHAN'));
    addMember(makeChar(ID_B, 'GANDALF'));
    dismissMember(1); // dismiss GANDALF, NATHAN should remain
    const after = readActiveParty();
    expect(after.members).toHaveLength(1);
    expect(after.members[0]!.name).toBe('NATHAN');
  });

  it('is a no-op on out-of-range slotIndex (negative)', () => {
    addMember(makeChar(ID_A, 'NATHAN'));
    dismissMember(-1);
    expect(readActiveParty().members).toHaveLength(1);
  });

  it('is a no-op on out-of-range slotIndex (>= length)', () => {
    addMember(makeChar(ID_A, 'NATHAN'));
    dismissMember(5);
    expect(readActiveParty().members).toHaveLength(1);
  });

  it('frees the dismissed portraitSlotId for re-allocation on next add', () => {
    addMember(makeChar(ID_A, 'NATHAN'));   // gets portraitSlotId 0
    addMember(makeChar(ID_B, 'GANDALF'));  // gets portraitSlotId 1
    dismissMember(0); // dismiss NATHAN, portraitSlotId 0 freed
    addMember(makeChar('11111111-1111-1111-1111-111111111111', 'TREON'));
    const after = readActiveParty();
    // TREON should pick up portraitSlotId 0 (smallest free).
    const treon = after.members.find((m) => m.name === 'TREON')!;
    expect(treon.portraitSlotId).toBe(0);
  });
});

function fakeMember(overrides: Partial<ActivePartyMember> = {}): ActivePartyMember {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'AAA',
    race: 0,
    class: 0,
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
    reaction: 50,
    sex: 0,
    portraitSlotId: 0,
    rosterCharacterId: '00000000-0000-4000-8000-000000000001',
    ...overrides,
  } as ActivePartyMember;
}

describe('updateActiveMember', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('patches the named fields of the member at slotIndex', () => {
    writeActiveParty({
      schemaVersion: 1,
      members: [fakeMember({ name: 'OLD' })],
    });
    updateActiveMember(0, { name: 'NEW' });
    expect(readActiveParty().members[0]?.name).toBe('NEW');
  });

  it('preserves other members untouched', () => {
    writeActiveParty({
      schemaVersion: 1,
      members: [fakeMember({ name: 'AAA' }), fakeMember({ name: 'BBB', id: '00000000-0000-4000-8000-000000000002' })],
    });
    updateActiveMember(0, { name: 'CCC' });
    const m = readActiveParty().members;
    expect(m[0]?.name).toBe('CCC');
    expect(m[1]?.name).toBe('BBB');
  });

  it('is a no-op on out-of-range slotIndex', () => {
    writeActiveParty({ schemaVersion: 1, members: [fakeMember({ name: 'AAA' })] });
    updateActiveMember(5, { name: 'NEW' });
    expect(readActiveParty().members[0]?.name).toBe('AAA');
  });

  it('throws when the patch produces an invalid member (schema rejects)', () => {
    writeActiveParty({ schemaVersion: 1, members: [fakeMember()] });
    expect(() => updateActiveMember(0, { name: '' })).toThrow();
  });
});

describe('roster↔active sync (#056)', () => {
  beforeEach(() => window.localStorage.clear());

  it('updateActiveMember writes edits through to the linked roster character', () => {
    writeRoster({ schemaVersion: 1, characters: [makeChar(ID_A, 'OLDNAME')] });
    addMember(makeChar(ID_A, 'OLDNAME')); // member.rosterCharacterId = ID_A
    updateActiveMember(0, { name: 'NEWNAME', portraitIndex: 7 });
    const rc = readRoster().characters.find((c) => c.id === ID_A)!;
    expect(rc.name).toBe('NEWNAME');
    expect(rc.portraitIndex).toBe(7);
  });

  it('dismiss persists the member edits back to the roster (not lost)', () => {
    writeRoster({ schemaVersion: 1, characters: [makeChar(ID_A, 'OLDNAME')] });
    addMember(makeChar(ID_A, 'OLDNAME'));
    // An edit that only touched the active party; the dismiss-time sync must persist it.
    const p = readActiveParty();
    writeActiveParty({ ...p, members: [{ ...p.members[0]!, name: 'EDITED' }] });
    dismissMember(0);
    expect(readRoster().characters.find((c) => c.id === ID_A)!.name).toBe('EDITED');
  });

  it('sync is a no-op for a member with no matching roster entry', () => {
    writeRoster({ schemaVersion: 1, characters: [makeChar(ID_A, 'KEEP')] });
    writeActiveParty({
      schemaVersion: 1,
      members: [fakeMember({ rosterCharacterId: '99999999-9999-4999-8999-999999999999' })],
    });
    updateActiveMember(0, { name: 'ZZZ' });
    expect(readRoster().characters[0]!.name).toBe('KEEP');
  });
});
