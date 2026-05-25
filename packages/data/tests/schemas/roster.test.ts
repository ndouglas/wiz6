import { describe, expect, it } from 'vitest';
import { RosterSchema, type Roster } from '../../src/schemas/roster.js';
import type { Character } from '../../src/schemas/character.js';

const C: Character = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Hawkwind',
  race: 0, class: 0, level: 1, xp: 0, gold: 0,
  conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  dead: false, paralyzed: false,
  attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, personality: 50, karma: 50 },
  schoolMana: [0, 0, 0, 0, 0, 0],
  skills: new Array(14).fill(0),
  savedOldLevel: 0, reaction: 0,
};

describe('RosterSchema', () => {
  it('accepts an empty roster', () => {
    const r: Roster = { schemaVersion: 1, characters: [] };
    expect(() => RosterSchema.parse(r)).not.toThrow();
  });

  it('accepts a roster with characters', () => {
    const r: Roster = { schemaVersion: 1, characters: [C] };
    expect(() => RosterSchema.parse(r)).not.toThrow();
  });

  it('rejects wrong schemaVersion', () => {
    expect(() => RosterSchema.parse({ schemaVersion: 2, characters: [] })).toThrow();
  });

  it('rejects characters with duplicate ids', () => {
    expect(() => RosterSchema.parse({
      schemaVersion: 1,
      characters: [C, { ...C, name: 'Twin' }],
    })).toThrow();
  });
});
