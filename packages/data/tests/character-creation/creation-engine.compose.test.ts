/**
 * Stage A compose test — proves all Stage-A modules interoperate correctly
 * using a single fixed-seed WichmannHill RNG.
 *
 * This is an integration-level test (no mocks) verifying that:
 *  - The creation-flow modules share state through one RNG instance.
 *  - Running the same sequence twice from identical seeds yields identical results.
 *  - All outputs fall within their documented valid ranges.
 *
 * Seed: WichmannHill(3000, 1, 29999) — the static boot triple documented in
 * wichmann-hill.ts (stream1=0x0bb8=3000 from CS:0x1d3b, stream2=1 (test default
 * for determinism), stream3=0x752f=29999 from CS:0x1d3f).
 */

import { describe, expect, it } from 'vitest';
import {
  WichmannHill,
  RACE_BASE_STATS,
  getRaceBaseStats,
  meetsClassRequirements,
  rollBonus,
  computeDerivedStats,
  rollKarmaWith,
  rollSkillBudget,
  KARMA_MAX,
  KARMA_MIN,
} from '../../src/index.js';

// ---------------------------------------------------------------------------
// Helper: run the representative creation sequence, advancing a single shared
// RNG instance. Returns a snapshot of all key outputs.
// ---------------------------------------------------------------------------

interface CreationSnapshot {
  bonus: number;
  classEligible: boolean;
  level: number;
  xp: number;
  hpInitial: number;
  age: number;
  karma: number;
  skillBudget: number;
}

function runCreationSequence(rng: WichmannHill): CreationSnapshot {
  // 1. Pick Human (race index 0) — seed attrs from RACE_BASE_STATS.
  const raceIdx = 0;
  const raceBase = getRaceBaseStats(raceIdx);

  // Build attrs from race base stats; assign remaining points to STR to meet
  // Fighter minimum of 12 (Human base STR is 9, so we add 3).
  const attrs = {
    str: raceBase.str + 3,  // 12 — exactly meets Fighter STR minimum
    int: raceBase.int,      // 8
    pie: raceBase.pie,      // 8
    vit: raceBase.vit,      // 9
    dex: raceBase.dex,      // 9
    spd: raceBase.spd,      // 8
    per: raceBase.per,      // 8
    kar: raceBase.kar,      // 0 (filled by karma roll later)
  };

  // 2. Roll the stat bonus.
  const bonus = rollBonus(rng);

  // 3. Fighter (class index 0) eligibility check — STR=12 meets the requirement.
  const classIdx = 0;
  const classEligible = meetsClassRequirements(attrs, classIdx);

  // 4. Compute derived stats.
  const derived = computeDerivedStats(rng, classIdx, raceIdx, attrs);

  // 5. Roll karma (no personality-confirm bonus for a scripted test).
  const karma = rollKarmaWith(rng, false);

  // 6. Roll skill budget.
  const skillBudget = rollSkillBudget(rng, classIdx, attrs);

  return {
    bonus,
    classEligible,
    level: derived.level,
    xp: derived.xp,
    hpInitial: derived.hpInitial,
    age: derived.age,
    karma,
    skillBudget,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('creation-engine compose (Stage A)', () => {
  it('bonus falls in the valid set (5..10, 13..18, or 21..26)', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    // Capture just the bonus by cloning; run the full sequence to confirm
    // it does not throw.
    const snap = runCreationSequence(rng);
    const { bonus } = snap;

    const inLow    = bonus >= 5  && bonus <= 10;
    const inMid    = bonus >= 13 && bonus <= 18;
    const inHigh   = bonus >= 21 && bonus <= 26;
    expect(inLow || inMid || inHigh).toBe(true);
  });

  it('Fighter (idx 0) with STR=12 meets class requirements', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    const snap = runCreationSequence(rng);
    expect(snap.classEligible).toBe(true);
  });

  it('computeDerivedStats returns level===1, xp===1, hpInitial>0', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    const snap = runCreationSequence(rng);
    expect(snap.level).toBe(1);
    expect(snap.xp).toBe(1);
    expect(snap.hpInitial).toBeGreaterThan(0);
  });

  it('age from computeDerivedStats falls in 6570..7569', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    const snap = runCreationSequence(rng);
    expect(snap.age).toBeGreaterThanOrEqual(6570);
    expect(snap.age).toBeLessThanOrEqual(7569);
  });

  it('rollKarmaWith returns a value in 0..18', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    const snap = runCreationSequence(rng);
    expect(snap.karma).toBeGreaterThanOrEqual(KARMA_MIN);
    expect(snap.karma).toBeLessThanOrEqual(KARMA_MAX);
  });

  it('rollSkillBudget returns a non-negative value', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    const snap = runCreationSequence(rng);
    expect(snap.skillBudget).toBeGreaterThanOrEqual(0);
  });

  it('creation sequence is fully deterministic: two identical seeds yield identical results', () => {
    // Run the full sequence twice with separately-constructed RNG instances
    // seeded identically. Every output must match.
    const snap1 = runCreationSequence(new WichmannHill(3000, 1, 29999));
    const snap2 = runCreationSequence(new WichmannHill(3000, 1, 29999));

    expect(snap1.bonus).toBe(snap2.bonus);
    expect(snap1.classEligible).toBe(snap2.classEligible);
    expect(snap1.level).toBe(snap2.level);
    expect(snap1.xp).toBe(snap2.xp);
    expect(snap1.hpInitial).toBe(snap2.hpInitial);
    expect(snap1.age).toBe(snap2.age);
    expect(snap1.karma).toBe(snap2.karma);
    expect(snap1.skillBudget).toBe(snap2.skillBudget);
  });

  it('RACE_BASE_STATS[0] is Human with expected attribute floors', () => {
    // Sanity-check the static table used by the sequence above.
    const human = RACE_BASE_STATS[0];
    expect(human.name).toBe('Human');
    expect(human.str).toBe(9);
    expect(human.vit).toBe(9);
  });
});
