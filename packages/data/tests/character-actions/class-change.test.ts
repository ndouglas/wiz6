import { describe, it, expect } from 'vitest';
import { applyClassChange } from '../../src/character-actions/class-change.js';
import type { ActivePartyMember } from '../../src/schemas/active-party.js';

// Deterministic RNG stub — returns 0 for every uniform() call. Lets us
// compute exact post-change derived stats without WichmannHill state.
class ZeroRng {
  uniform(_n: number): number {
    return 0;
  }
}

function makeFighter(overrides: Partial<ActivePartyMember> = {}): ActivePartyMember {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    name: 'TEST',
    race: 0, // Human
    class: 0, // Fighter
    level: 7,
    savedOldLevel: 0,
    xp: 12345,
    gold: 100,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false,
    paralyzed: false,
    attributes: {
      str: 15, int: 10, pie: 10, vit: 14, dex: 12, spd: 11, per: 10, kar: 10,
    },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    reaction: 50,
    inventory: new Array(22).fill({ itemId: 0, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 }),
    equipment: [0, 1, 255, 255, 255, 255, 255, 255], // weapon + shield equipped
    sex: 0,
    portraitSlotId: 0,
    rosterCharacterId: '00000000-0000-4000-8000-000000000000',
    ...overrides,
  };
}

describe('applyClassChange', () => {
  it('resets level to 1', () => {
    const result = applyClassChange(new ZeroRng(), makeFighter(), 1);
    expect(result.level).toBe(1);
  });

  it('wipes XP to 0', () => {
    const result = applyClassChange(new ZeroRng(), makeFighter(), 1);
    expect(result.xp).toBe(0);
  });

  it('saves previous level into savedOldLevel', () => {
    const result = applyClassChange(new ZeroRng(), makeFighter({ level: 7 }), 1);
    expect(result.savedOldLevel).toBe(7);
  });

  it('level >= 250 sets savedOldLevel to 0 (engine releases the throttle for extreme levels)', () => {
    const result = applyClassChange(new ZeroRng(), makeFighter({ level: 999 }), 1);
    expect(result.savedOldLevel).toBe(0);
    // Lock the strict `<` comparison: level == 250 already trips the threshold.
    expect(applyClassChange(new ZeroRng(), makeFighter({ level: 250 }), 1).savedOldLevel).toBe(0);
  });

  it('changes the class to the new id', () => {
    const result = applyClassChange(new ZeroRng(), makeFighter({ class: 0 }), 5);
    expect(result.class).toBe(5);
  });

  it('unequips everything (equipment all 255)', () => {
    const result = applyClassChange(
      new ZeroRng(),
      makeFighter({ equipment: [0, 1, 2, 3, 4, 5, 6, 7] }),
      1,
    );
    expect(result.equipment).toEqual([255, 255, 255, 255, 255, 255, 255, 255]);
  });

  it('preserves attributes byte-for-byte', () => {
    const before = makeFighter();
    const result = applyClassChange(new ZeroRng(), before, 1);
    expect(result.attributes).toEqual(before.attributes);
  });

  it('preserves name, race, sex, portraitIndex, age, conditions, inventory items, skills, reaction', () => {
    const before = makeFighter({
      name: 'NATHAN',
      race: 2,
      sex: 1,
      portraitIndex: 7,
      age: 7000,
      conditions: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      skills: new Array(30).fill(0).map((_, i) => (i < 5 ? 25 : 0)),
      reaction: 75,
    });
    const result = applyClassChange(new ZeroRng(), before, 1);
    expect(result.name).toBe('NATHAN');
    expect(result.race).toBe(2);
    expect(result.sex).toBe(1);
    expect(result.portraitIndex).toBe(7);
    expect(result.age).toBe(7000);
    expect(result.conditions).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(result.inventory).toEqual(before.inventory);
    expect(result.skills).toEqual(before.skills);
    expect(result.reaction).toBe(75);
  });

  it('recomputes hpCurrent equal to hpMax', () => {
    const result = applyClassChange(new ZeroRng(), makeFighter(), 1);
    expect(result.hpCurrent).toBe(result.hpMax);
  });

  it('recomputes staminaCurrent equal to staminaMax', () => {
    const result = applyClassChange(new ZeroRng(), makeFighter(), 1);
    expect(result.staminaCurrent).toBe(result.staminaMax);
  });

  it('preserves portraitSlotId and rosterCharacterId (active-party-only fields)', () => {
    const result = applyClassChange(
      new ZeroRng(),
      makeFighter({ portraitSlotId: 3, rosterCharacterId: 'a-roster-uuid' }),
      1,
    );
    expect(result.portraitSlotId).toBe(3);
    expect(result.rosterCharacterId).toBe('a-roster-uuid');
  });

  it('clears bit 0x01 of every inventory item flag byte (engine FUN_8e35)', () => {
    const before = makeFighter({
      inventory: new Array(22).fill({
        itemId: 100, weight: 5, equipSlot: 0, spriteIdx: 1, quantity: 1,
        flags: 0x07, // 0x01 (equipped/cursed?) + 0x02 + 0x04
      }),
    });
    const result = applyClassChange(new ZeroRng(), before, 1);
    // Every item should have bit 0x01 cleared; other bits preserved.
    for (const item of result.inventory ?? []) {
      expect(item.flags & 0x01).toBe(0);
      expect(item.flags & 0x06).toBe(0x06); // 0x02 + 0x04 preserved
    }
  });

  it('chained class-change at level 1 sets savedOldLevel=1 (engine-faithful — throttle escape exploit)', () => {
    const r1 = applyClassChange(new ZeroRng(), makeFighter({ level: 7 }), 1);
    expect(r1.savedOldLevel).toBe(7);
    const r2 = applyClassChange(new ZeroRng(), r1, 0);
    expect(r2.savedOldLevel).toBe(1);
  });
});
