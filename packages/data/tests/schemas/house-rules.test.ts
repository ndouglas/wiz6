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

  // (pinMaxBonusRoll was removed at the wpcmk Stage-D cutover; the schema
  // currently carries no house rules beyond schemaVersion.)
});

describe('HOUSE_RULES_META', () => {
  it('is empty until a house rule is (re-)added', () => {
    expect(HOUSE_RULES_META).toHaveLength(0);
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
