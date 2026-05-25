import { describe, expect, it } from 'vitest';
import { CharacterSchema, PartyMemberSchema, type Character, type PartyMember } from '../../src/schemas/character.js';

const VALID: Character = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Thesus',
  race: 0,
  class: 0,
  level: 1,
  xp: 0,
  gold: 0,
  conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  dead: false,
  paralyzed: false,
  attributes: {
    str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12,
    personality: 50, karma: 50,
  },
  schoolMana: [0, 0, 0, 0, 0, 0],
  schoolManaMax: [0, 0, 0, 0, 0, 0],
  skills: new Array(14).fill(0),
  savedOldLevel: 0,
  reaction: 0,
};

describe('CharacterSchema', () => {
  it('accepts a fully-populated valid character', () => {
    expect(() => CharacterSchema.parse(VALID)).not.toThrow();
  });

  it('rejects when id is not a UUID', () => {
    expect(() => CharacterSchema.parse({ ...VALID, id: 'not-a-uuid' })).toThrow();
  });

  it('rejects when name is empty', () => {
    expect(() => CharacterSchema.parse({ ...VALID, name: '' })).toThrow();
  });

  it('rejects when conditions array is wrong length', () => {
    expect(() => CharacterSchema.parse({ ...VALID, conditions: [0, 0, 0] })).toThrow();
  });

  it('rejects when skills array is wrong length', () => {
    expect(() => CharacterSchema.parse({ ...VALID, skills: [0] })).toThrow();
  });

  it('rejects when schoolMana array is wrong length', () => {
    expect(() => CharacterSchema.parse({ ...VALID, schoolMana: [0] })).toThrow();
  });

  it('rejects out-of-range u8 attribute values', () => {
    expect(() => CharacterSchema.parse({
      ...VALID,
      attributes: { ...VALID.attributes, str: 256 },
    })).toThrow();
  });

  it('rejects negative xp', () => {
    expect(() => CharacterSchema.parse({ ...VALID, xp: -1 })).toThrow();
  });
});

describe('PartyMemberSchema', () => {
  const BASE: PartyMember = { ...VALID };

  it('accepts a party member without rosterCharacterId (one-off snapshot)', () => {
    expect(() => PartyMemberSchema.parse(BASE)).not.toThrow();
  });

  it('accepts a party member with a UUID rosterCharacterId', () => {
    const withRef: PartyMember = {
      ...BASE,
      rosterCharacterId: '550e8400-e29b-41d4-a716-446655440000',
    };
    expect(() => PartyMemberSchema.parse(withRef)).not.toThrow();
  });

  it('rejects a non-UUID rosterCharacterId', () => {
    expect(() => PartyMemberSchema.parse({ ...BASE, rosterCharacterId: 'nope' })).toThrow();
  });
});
