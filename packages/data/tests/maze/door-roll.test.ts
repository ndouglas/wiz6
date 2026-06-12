import { describe, it, expect } from 'vitest';
import { DOOR_ROLL } from '../../src/maze/door-roll.js';

describe('DOOR_ROLL constants', () => {
  it('matches the asm-confirmed values', () => {
    expect(DOOR_ROLL.strainMax).toBe(18);       // 0x12
    expect(DOOR_ROLL.skillCap).toBe(95);         // 0x5f
    expect(DOOR_ROLL.maxTumblers).toBe(6);
    expect(DOOR_ROLL.skulduggerySkillIndex).toBe(15);
    expect(DOOR_ROLL.fatigueOdds).toBe(50);      // rng(50)==0
    expect(DOOR_ROLL.jamOdds).toBe(3);           // rng(3)==0
    expect(DOOR_ROLL.thiefClasses).toEqual([3, 6, 13]);
  });
});
