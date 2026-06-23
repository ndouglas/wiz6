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
    per: 50, kar: 50,
  },
  schoolMana: [0, 0, 0, 0, 0, 0],
  schoolManaMax: [0, 0, 0, 0, 0, 0],
  skills: new Array(30).fill(0),
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

describe('CharacterSchema maze-affliction fields', () => {
  it('defaults statusLevel/poisonAmount/vitRegen/schoolSkill to zeros when absent', () => {
    const parsed = CharacterSchema.parse(VALID);
    expect(parsed.statusLevel).toBe(0);
    expect(parsed.poisonAmount).toBe(0);
    expect(parsed.vitRegen).toEqual([0, 0, 0]);
    expect(parsed.schoolSkill).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('round-trips explicit afflicted values', () => {
    const afflicted: Character = {
      ...VALID,
      statusLevel: 2,
      poisonAmount: 5,
      vitRegen: [1, 2, 3],
      schoolSkill: [10, 20, 30, 40, 50, 60],
    };
    const parsed = CharacterSchema.parse(afflicted);
    expect(parsed.statusLevel).toBe(2);
    expect(parsed.poisonAmount).toBe(5);
    expect(parsed.vitRegen).toEqual([1, 2, 3]);
    expect(parsed.schoolSkill).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it('rejects when vitRegen array is wrong length', () => {
    expect(() => CharacterSchema.parse({ ...VALID, vitRegen: [0, 0] })).toThrow();
  });

  it('rejects when schoolSkill array is wrong length', () => {
    expect(() => CharacterSchema.parse({ ...VALID, schoolSkill: [0] })).toThrow();
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
