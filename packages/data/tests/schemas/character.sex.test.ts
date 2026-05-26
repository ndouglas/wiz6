import { describe, expect, it } from 'vitest';
import { CharacterSchema, type Character } from '../../src/schemas/character.js';

/** Minimal valid character without a sex field (simulates a pre-sex stored roster entry). */
const BASE: Omit<Character, 'sex'> = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Tester',
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

describe('CharacterSchema sex field', () => {
  it('accepts sex: 0 (Male)', () => {
    expect(() => CharacterSchema.parse({ ...BASE, sex: 0 })).not.toThrow();
    const result = CharacterSchema.parse({ ...BASE, sex: 0 });
    expect(result.sex).toBe(0);
  });

  it('accepts sex: 1 (Female)', () => {
    expect(() => CharacterSchema.parse({ ...BASE, sex: 1 })).not.toThrow();
    const result = CharacterSchema.parse({ ...BASE, sex: 1 });
    expect(result.sex).toBe(1);
  });

  it('rejects sex: 2 (out of range)', () => {
    expect(() => CharacterSchema.parse({ ...BASE, sex: 2 })).toThrow();
  });

  it('applies default sex: 0 when sex is absent (backwards-compat for stored rosters)', () => {
    const result = CharacterSchema.parse(BASE);
    expect(result.sex).toBe(0);
  });
});
