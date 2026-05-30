import { describe, expect, it } from 'vitest';
import {
  HouseRulesSchema,
  STOCK_HOUSE_RULES,
  DEFAULT_HOUSE_RULES,
  HOUSE_RULES_META,
  type HouseRules,
} from '../../src/schemas/house-rules.js';

describe('HouseRulesSchema', () => {
  it('accepts the stock defaults', () => {
    expect(() => HouseRulesSchema.parse(STOCK_HOUSE_RULES)).not.toThrow();
  });

  it('accepts the recommended defaults', () => {
    expect(() => HouseRulesSchema.parse(DEFAULT_HOUSE_RULES)).not.toThrow();
  });

  it('rejects wrong schemaVersion', () => {
    expect(() =>
      HouseRulesSchema.parse({ ...DEFAULT_HOUSE_RULES, schemaVersion: 2 }),
    ).toThrow();
  });

  it('rejects unknown fields by treating them as ignored (zod default strips)', () => {
    const r = HouseRulesSchema.parse({
      ...DEFAULT_HOUSE_RULES,
      bogusField: 'whatever',
    } as HouseRules);
    expect((r as unknown as { bogusField?: unknown }).bogusField).toBeUndefined();
  });

  it('rejects non-boolean pinMaxBonusRoll', () => {
    expect(() =>
      HouseRulesSchema.parse({ ...DEFAULT_HOUSE_RULES, pinMaxBonusRoll: 'yes' as unknown as boolean }),
    ).toThrow();
  });

  it('stock and default differ at pinMaxBonusRoll (stock=false, default=true)', () => {
    expect(STOCK_HOUSE_RULES.pinMaxBonusRoll).toBe(false);
    expect(DEFAULT_HOUSE_RULES.pinMaxBonusRoll).toBe(true);
  });
});

describe('HOUSE_RULES_META', () => {
  it('has one entry per house rule (currently 5)', () => {
    expect(HOUSE_RULES_META).toHaveLength(5);
  });

  it('every meta entry has matching key in HouseRules', () => {
    const validKeys = new Set(Object.keys(DEFAULT_HOUSE_RULES).filter((k) => k !== 'schemaVersion'));
    for (const m of HOUSE_RULES_META) {
      expect(validKeys.has(m.key)).toBe(true);
    }
  });

  it('every meta entry has a non-empty label and description', () => {
    for (const m of HOUSE_RULES_META) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(20);
    }
  });
});

describe('playInvalidActionBeep house rule', () => {
  it('is required by the schema', () => {
    const { schemaVersion: _v, ...rest } = DEFAULT_HOUSE_RULES;
    void _v;
    // Missing the new key must fail validation
    expect(() =>
      HouseRulesSchema.parse({ schemaVersion: 1, ...rest, playInvalidActionBeep: undefined }),
    ).toThrow();
  });

  it('stock value is true (engine plays the beep)', () => {
    expect(STOCK_HOUSE_RULES.playInvalidActionBeep).toBe(true);
  });

  it('default value is true (default ON; users can disable)', () => {
    expect(DEFAULT_HOUSE_RULES.playInvalidActionBeep).toBe(true);
  });

  it('appears in HOUSE_RULES_META', () => {
    const entry = HOUSE_RULES_META.find((m) => m.key === 'playInvalidActionBeep');
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('creation');
    expect(entry?.control).toBe('boolean');
  });
});

describe('engineFaithfulSkillExit house rule', () => {
  it('is required by the schema', () => {
    const { schemaVersion: _v, ...rest } = DEFAULT_HOUSE_RULES;
    void _v;
    expect(() =>
      HouseRulesSchema.parse({ schemaVersion: 1, ...rest, engineFaithfulSkillExit: undefined }),
    ).toThrow();
  });

  it('stock value is true (engine allows exit with leftover points)', () => {
    expect(STOCK_HOUSE_RULES.engineFaithfulSkillExit).toBe(true);
  });

  it('default value is false (port keeps stricter UX)', () => {
    expect(DEFAULT_HOUSE_RULES.engineFaithfulSkillExit).toBe(false);
  });

  it('appears in HOUSE_RULES_META', () => {
    const entry = HOUSE_RULES_META.find((m) => m.key === 'engineFaithfulSkillExit');
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('creation');
    expect(entry?.control).toBe('boolean');
  });
});

describe('allowEditFromCamp house rule', () => {
  it('is part of the schema', () => {
    const parsed = HouseRulesSchema.parse({
      schemaVersion: 1,
      pinMaxBonusRoll: false,
      playInvalidActionBeep: true,
      engineFaithfulSkillExit: false,
      allowEditFromCamp: true,
      recomputeCarryCapacity: false,
    });
    expect(parsed.allowEditFromCamp).toBe(true);
  });

  it('defaults to false in STOCK and DEFAULT', () => {
    expect(STOCK_HOUSE_RULES.allowEditFromCamp).toBe(false);
    expect(DEFAULT_HOUSE_RULES.allowEditFromCamp).toBe(false);
  });

  it('has a HOUSE_RULES_META entry', () => {
    const meta = HOUSE_RULES_META.find((m) => m.key === 'allowEditFromCamp');
    expect(meta).toBeDefined();
    expect(meta?.category).toBe('gameplay');
    expect(meta?.stockValue).toBe(false);
  });
});

describe('recomputeCarryCapacity house rule', () => {
  it('is required by the schema', () => {
    const { schemaVersion: _v, ...rest } = DEFAULT_HOUSE_RULES;
    void _v;
    expect(() =>
      HouseRulesSchema.parse({ schemaVersion: 1, ...rest, recomputeCarryCapacity: undefined }),
    ).toThrow();
  });

  it('stock value is false (engine bug: carry capacity frozen at creation)', () => {
    expect(STOCK_HOUSE_RULES.recomputeCarryCapacity).toBe(false);
  });

  it('default value is true (fix the bug — cap tracks STR/VIT)', () => {
    expect(DEFAULT_HOUSE_RULES.recomputeCarryCapacity).toBe(true);
  });

  it('appears in HOUSE_RULES_META as a gameplay rule', () => {
    const entry = HOUSE_RULES_META.find((m) => m.key === 'recomputeCarryCapacity');
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('gameplay');
    expect(entry?.stockValue).toBe(false);
  });
});
