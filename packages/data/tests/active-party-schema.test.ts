import { describe, expect, it } from 'vitest';
import { ActivePartySchema, ActivePartyMemberSchema } from '../src/schemas/active-party.js';

const VALID_MEMBER = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'NATHAN',
  race: 9, class: 0, sex: 0, level: 1, xp: 0, gold: 0,
  conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  dead: false, paralyzed: false,
  attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
  schoolMana: [0, 0, 0, 0, 0, 0],
  schoolManaMax: [0, 0, 0, 0, 0, 0],
  skills: new Array(30).fill(0),
  savedOldLevel: 0, reaction: 0,
  statusLevel: 0, poisonAmount: 0,
  vitRegen: [0, 0, 0], schoolSkill: [0, 0, 0, 0, 0, 0],
  portraitSlotId: 0,
};

describe('ActivePartySchema', () => {
  it('accepts an empty party', () => {
    expect(ActivePartySchema.parse({ schemaVersion: 1, members: [] })).toEqual({
      schemaVersion: 1, members: [],
    });
  });

  it('accepts a single-member party', () => {
    const p = { schemaVersion: 1, members: [VALID_MEMBER] };
    expect(ActivePartySchema.parse(p)).toEqual(p);
  });

  it('rejects more than 6 members', () => {
    const tooMany = { schemaVersion: 1, members: new Array(7).fill(VALID_MEMBER) };
    expect(() => ActivePartySchema.parse(tooMany)).toThrow();
  });

  it('rejects portraitSlotId out of range 0..5', () => {
    const bad = { ...VALID_MEMBER, portraitSlotId: 6 };
    expect(() => ActivePartyMemberSchema.parse(bad)).toThrow();
  });

  it('rejects schemaVersion != 1', () => {
    expect(() => ActivePartySchema.parse({ schemaVersion: 2, members: [] })).toThrow();
  });
});
