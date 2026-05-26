// packages/viewer/tests/pages/roster/lib/draft.test.ts
import { describe, expect, it } from 'vitest';
import {
  createEmptyDraft,
  isNameValid,
  isRaceValid,
  isBonusRollValid,
  isClassValid,
  isAttributesValid,
  isSkillsValid,
  isSpellsValid,
  isKarmaValid,
  computeTotalAttributes,
  expectedSpellPickCount,
  STARTER_SKILL_POINTS,
  MAX_BONUS_POINTS,
} from '../../../../src/pages/roster/lib/draft.js';

describe('createEmptyDraft', () => {
  it('returns a draft with all nullable fields cleared', () => {
    const d = createEmptyDraft();
    expect(d.name).toBe('');
    expect(d.raceIdx).toBeNull();
    expect(d.classIdx).toBeNull();
    expect(d.bonusPool).toBe(0);
    expect(d.karma).toBe(0);
    expect(d.starterSpells).toEqual([]);
  });
});

describe('isNameValid', () => {
  it('accepts 1..7 ASCII characters', () => {
    expect(isNameValid('A')).toBe(true);
    expect(isNameValid('THESUS')).toBe(true);
    expect(isNameValid('NATEDOG')).toBe(true);
  });
  it('rejects empty', () => {
    expect(isNameValid('')).toBe(false);
  });
  it('rejects > 7 chars', () => {
    expect(isNameValid('TOOLONG1')).toBe(false);
  });
});

describe('isRaceValid', () => {
  it('valid for raceIdx 0..10', () => {
    expect(isRaceValid({ ...createEmptyDraft(), raceIdx: 0 })).toBe(true);
    expect(isRaceValid({ ...createEmptyDraft(), raceIdx: 10 })).toBe(true);
  });
  it('invalid when raceIdx is null', () => {
    expect(isRaceValid(createEmptyDraft())).toBe(false);
  });
});

describe('isBonusRollValid', () => {
  it('valid when bonusPool > 0', () => {
    expect(isBonusRollValid({ ...createEmptyDraft(), bonusPool: 5 })).toBe(true);
  });
  it('invalid when bonusPool is 0', () => {
    expect(isBonusRollValid(createEmptyDraft())).toBe(false);
  });
});

describe('isClassValid', () => {
  it('valid when classIdx is set AND attribute requirements met', () => {
    // Human base: STR 9 IQ 8 PIE 8 VIT 9 DEX 9 SPD 8 PER 8 KAR 0
    // Fighter requires STR=12 minimum; we set attributes.str=12 directly.
    const d = {
      ...createEmptyDraft(),
      raceIdx: 0,
      classIdx: 0,
      attributes: { str: 12, iq: 8, pie: 8, vit: 9, dex: 9, spd: 8, per: 8, kar: 0 },
    };
    expect(isClassValid(d)).toBe(true);
  });
  it('invalid when class requirements not met', () => {
    const d = {
      ...createEmptyDraft(),
      raceIdx: 0,
      classIdx: 13, // Ninja: requires high stats
      attributes: { str: 9, iq: 8, pie: 8, vit: 9, dex: 9, spd: 8, per: 8, kar: 0 },
    };
    expect(isClassValid(d)).toBe(false);
  });
});

describe('isAttributesValid', () => {
  it('valid when sum(bonusDistribution) === bonusPool', () => {
    const d = {
      ...createEmptyDraft(),
      bonusPool: 6,
      bonusDistribution: { str: 1, iq: 1, pie: 1, vit: 1, dex: 1, spd: 1, per: 0, kar: 0 },
    };
    expect(isAttributesValid(d)).toBe(true);
  });
  it('invalid when sum differs from pool', () => {
    const d = {
      ...createEmptyDraft(),
      bonusPool: 6,
      bonusDistribution: { str: 1, iq: 1, pie: 1, vit: 1, dex: 0, spd: 0, per: 0, kar: 0 },
    };
    expect(isAttributesValid(d)).toBe(false);
  });
});

describe('isSkillsValid', () => {
  it('valid when sum(skillPoints) === STARTER_SKILL_POINTS', () => {
    const d = {
      ...createEmptyDraft(),
      skillPoints: { 0: STARTER_SKILL_POINTS },
    };
    expect(isSkillsValid(d)).toBe(true);
  });
  it('invalid when sum < STARTER_SKILL_POINTS', () => {
    const d = { ...createEmptyDraft(), skillPoints: { 0: 1 } };
    expect(isSkillsValid(d)).toBe(false);
  });
});

describe('expectedSpellPickCount', () => {
  it('Mage (class 1) requires 2 picks', () => {
    expect(expectedSpellPickCount(1)).toBe(2);
  });
  it('Fighter (class 0) requires 0 picks', () => {
    expect(expectedSpellPickCount(0)).toBe(0);
  });
  it('Bishop (class 9) requires 2 picks (1 from each of two books)', () => {
    expect(expectedSpellPickCount(9)).toBe(2);
  });
});

describe('isSpellsValid', () => {
  it('valid when correct number of picks for class', () => {
    const d = {
      ...createEmptyDraft(),
      classIdx: 1, // Mage requires 2
      starterSpells: [
        { bookIdx: 0, entryIdx: 0 },
        { bookIdx: 0, entryIdx: 1 },
      ],
    };
    expect(isSpellsValid(d)).toBe(true);
  });
  it('valid for non-casters with no picks', () => {
    expect(isSpellsValid({ ...createEmptyDraft(), classIdx: 0 })).toBe(true);
  });
  it('invalid when too few picks', () => {
    const d = {
      ...createEmptyDraft(),
      classIdx: 1,
      starterSpells: [{ bookIdx: 0, entryIdx: 0 }],
    };
    expect(isSpellsValid(d)).toBe(false);
  });
});

describe('isKarmaValid', () => {
  it('valid when karma > 0', () => {
    expect(isKarmaValid({ ...createEmptyDraft(), karma: 1 })).toBe(true);
  });
});

describe('computeTotalAttributes', () => {
  it('adds bonus distribution to race-base attributes', () => {
    const d = {
      ...createEmptyDraft(),
      raceIdx: 0, // Human: STR 9 INT 8 ...
      bonusDistribution: { str: 2, iq: 0, pie: 0, vit: 0, dex: 0, spd: 0, per: 0, kar: 0 },
    };
    expect(computeTotalAttributes(d)?.str).toBe(11); // 9 + 2
  });
  it('returns null when raceIdx not set', () => {
    expect(computeTotalAttributes(createEmptyDraft())).toBeNull();
  });
});

describe('constants', () => {
  it('MAX_BONUS_POINTS is a number > 0', () => {
    expect(MAX_BONUS_POINTS).toBeGreaterThan(0);
  });
  it('STARTER_SKILL_POINTS is a number > 0', () => {
    expect(STARTER_SKILL_POINTS).toBeGreaterThan(0);
  });
});
