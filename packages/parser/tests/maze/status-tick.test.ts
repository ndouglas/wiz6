import { describe, it, expect } from 'vitest';
import { applyMazeTurnStatus, type StatusTickMember } from '../../src/maze/status-tick.js';
import { WichmannHill } from '@wiz6/data';

function member(over: Partial<StatusTickMember> = {}): StatusTickMember {
  return {
    hpCurrent: 20, hpMax: 20, staminaCurrent: 50, staminaMax: 50,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    statusLevel: 0, poisonAmount: 0, vitRegen: [0, 0, 0],
    schoolMana: [0, 0, 0, 0, 0, 0], schoolManaMax: [9, 9, 9, 9, 9, 9],
    schoolSkill: [0, 0, 0, 0, 0, 0],
    ...over,
  };
}
const rng = () => new WichmannHill(1, 2, 3); // deterministic; reseed per test

describe('applyMazeTurnStatus', () => {
  it('no-op when turn % 10 !== 5', () => {
    const r = applyMazeTurnStatus([member({ staminaCurrent: 50 })], 4, rng());
    expect(r.roster[0]!.staminaCurrent).toBe(50);
  });

  it('drains selected slot by poisonAmount+1 on its turn (un-afflicted = 1)', () => {
    // turn 5 -> selected slot 0
    const r = applyMazeTurnStatus([member({ staminaCurrent: 50 })], 5, rng());
    expect(r.roster[0]!.staminaCurrent).toBe(49);
    // turn 15 -> selected slot 1; slot 0 NOT drained
    const r2 = applyMazeTurnStatus([member({ staminaCurrent: 50 }), member({ staminaCurrent: 50 })], 15, rng());
    expect(r2.roster[0]!.staminaCurrent).toBe(50);
    expect(r2.roster[1]!.staminaCurrent).toBe(49);
  });

  it('drain uses poisonAmount+1 and clamps at 0', () => {
    const r = applyMazeTurnStatus([member({ staminaCurrent: 2, poisonAmount: 7 })], 5, rng());
    expect(r.roster[0]!.staminaCurrent).toBe(0); // 2 - 8 -> clamp 0
  });

  it('slot wraps mod 60 (turn 65 -> slot 0)', () => {
    const r = applyMazeTurnStatus([member({ staminaCurrent: 50 })], 65, rng());
    expect(r.roster[0]!.staminaCurrent).toBe(49);
  });

  it('skips members with statusLevel >= 3 entirely', () => {
    const r = applyMazeTurnStatus([member({ staminaCurrent: 50, statusLevel: 3, conditions: [5, 0, 0, 0, 0, 0, 0, 0, 0, 0] })], 5, rng());
    expect(r.roster[0]!.staminaCurrent).toBe(50);
    expect(r.roster[0]!.conditions[0]).toBe(5); // not decayed
  });

  it('decays conditions by 1, floors at 0, skips 0 and 0xFF', () => {
    const r = applyMazeTurnStatus([member({ conditions: [5, 0, 0xff, 1, 0, 0, 0, 0, 0, 0] })], 5, rng());
    expect(r.roster[0]!.conditions).toEqual([4, 0, 0xff, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('HP regen = vitRegen[0]-[1]-[2], capped at hpMax', () => {
    const r = applyMazeTurnStatus([member({ hpCurrent: 10, hpMax: 20, vitRegen: [5, 1, 0] })], 5, rng());
    expect(r.roster[0]!.hpCurrent).toBe(14); // 10 + (5-1-0)
    const cap = applyMazeTurnStatus([member({ hpCurrent: 19, hpMax: 20, vitRegen: [5, 0, 0] })], 5, rng());
    expect(cap.roster[0]!.hpCurrent).toBe(20); // capped
  });

  it('death when HP regen drives HP < 1 (negative net)', () => {
    const r = applyMazeTurnStatus([member({ hpCurrent: 1, hpMax: 20, vitRegen: [0, 5, 0] })], 5, rng());
    expect(r.roster[0]!.hpCurrent).toBe(0);
    expect(r.roster[0]!.staminaCurrent).toBe(0);
    expect(r.roster[0]!.statusLevel).toBe(3);
  });

  it('stamina-empty sets conditions[2] = 6 + rng.uniform(6) (6..11)', () => {
    const r = applyMazeTurnStatus([member({ staminaCurrent: 1, poisonAmount: 0 })], 5, rng());
    expect(r.roster[0]!.staminaCurrent).toBe(0);
    expect(r.roster[0]!.conditions[2]).toBeGreaterThanOrEqual(6);
    expect(r.roster[0]!.conditions[2]).toBeLessThanOrEqual(11);
  });

  it('mana regen only for the selected member, skill-0 bumped, capped', () => {
    const r = applyMazeTurnStatus([member({ schoolMana: [0, 0, 0, 0, 0, 0], schoolSkill: [4, 0, 0, 0, 0, 0] })], 5, rng());
    // selected slot 0: school 0 += rng.uniform(5) in 0..4; capped at 9
    expect(r.roster[0]!.schoolMana[0]).toBeGreaterThanOrEqual(0);
    expect(r.roster[0]!.schoolMana[0]).toBeLessThanOrEqual(4);
  });

  it('allDead is true iff no member has statusLevel === 0', () => {
    expect(applyMazeTurnStatus([member({ statusLevel: 0 })], 4, rng()).allDead).toBe(false);
    expect(applyMazeTurnStatus([member({ statusLevel: 3 })], 4, rng()).allDead).toBe(true);
  });

  it('does not mutate the input roster', () => {
    const input = [member({ staminaCurrent: 50 })];
    applyMazeTurnStatus(input, 5, rng());
    expect(input[0]!.staminaCurrent).toBe(50);
  });
});
