import { describe, expect, it, beforeEach } from 'vitest';
import {
  readRoster,
  writeRoster,
  addCharacter,
  removeCharacter,
  updateCharacter,
  syncFromSave,
} from '../../src/lib/roster-store.js';
import type { Character, Roster, Save } from '@wiz6/data';

function makeCharacter(id: string, name: string, level = 1): Character {
  return {
    id, name, race: 0, class: 0, level, xp: 0, gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false, paralyzed: false,
    attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    savedOldLevel: 0, reaction: 0,
  };
}

const ID_A = '550e8400-e29b-41d4-a716-446655440000';
const ID_B = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

beforeEach(() => {
  window.localStorage.clear();
});

describe('roster-store', () => {
  it('readRoster returns an empty roster when nothing stored', () => {
    expect(readRoster()).toEqual({ schemaVersion: 1, characters: [] });
  });

  it('writeRoster persists, readRoster round-trips', () => {
    const r: Roster = { schemaVersion: 1, characters: [makeCharacter(ID_A, 'Thesus')] };
    writeRoster(r);
    expect(readRoster()).toEqual(r);
  });

  it('addCharacter appends to the roster', () => {
    addCharacter(makeCharacter(ID_A, 'Thesus'));
    addCharacter(makeCharacter(ID_B, 'Loras'));
    const r = readRoster();
    expect(r.characters.map((c) => c.id)).toEqual([ID_A, ID_B]);
  });

  it('addCharacter rejects a duplicate id', () => {
    addCharacter(makeCharacter(ID_A, 'Thesus'));
    expect(() => addCharacter(makeCharacter(ID_A, 'Imposter'))).toThrow();
  });

  it('removeCharacter drops the entry by id; no-op if missing', () => {
    addCharacter(makeCharacter(ID_A, 'Thesus'));
    addCharacter(makeCharacter(ID_B, 'Loras'));
    removeCharacter(ID_A);
    expect(readRoster().characters.map((c) => c.id)).toEqual([ID_B]);
    removeCharacter('missing-id');
    expect(readRoster().characters.map((c) => c.id)).toEqual([ID_B]);
  });

  it('updateCharacter replaces the matching entry by id', () => {
    addCharacter(makeCharacter(ID_A, 'Thesus', 1));
    updateCharacter(makeCharacter(ID_A, 'Thesus', 5));
    expect(readRoster().characters[0]!.level).toBe(5);
  });

  it('syncFromSave updates roster entries whose ids match save party-member rosterCharacterId', () => {
    addCharacter(makeCharacter(ID_A, 'Thesus', 1));
    addCharacter(makeCharacter(ID_B, 'Loras', 1));

    const save: Save = {
      schemaVersion: 1,
      metadata: { slotName: 's', timestamp: '2026-05-25T12:00:00.000Z', portVersion: '0.0.0' },
      party: [
        { ...makeCharacter(ID_A, 'Thesus', 7), rosterCharacterId: ID_A },
        // Member B has no rosterCharacterId — should NOT sync back
        { ...makeCharacter(ID_B, 'Loras', 9) },
      ],
      position: { zone: 0, level: 0, x: 0, y: 0, globalX: 0, globalY: 0, facing: 0 },
      scenarioFlags: {}, mazeState: {},
    };

    syncFromSave(save);
    const after = readRoster();
    expect(after.characters.find((c) => c.id === ID_A)!.level).toBe(7); // synced
    expect(after.characters.find((c) => c.id === ID_B)!.level).toBe(1); // unchanged
  });

  it('readRoster returns empty + warning on corrupt data', () => {
    window.localStorage.setItem('wiz6:roster', 'totally-bogus');
    expect(readRoster()).toEqual({ schemaVersion: 1, characters: [] });
  });
});
