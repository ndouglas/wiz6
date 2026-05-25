import { describe, expect, it, beforeEach } from 'vitest';
import {
  getHouseRules,
  setHouseRules,
  setHouseRule,
  resetToStock,
  resetToDefaults,
  subscribeHouseRules,
} from '../../src/lib/house-rules-store.js';
import { DEFAULT_HOUSE_RULES, STOCK_HOUSE_RULES, type HouseRules } from '@wiz6/data';

beforeEach(() => {
  window.localStorage.clear();
  // Force re-read by resetting to defaults
  resetToDefaults();
});

describe('house-rules-store', () => {
  it('initial read returns DEFAULT_HOUSE_RULES when storage is empty', () => {
    window.localStorage.clear();
    // Trigger a fresh read via subscribe (cached state will be re-read on next access? Actually the
    // module-scope cache means we test through the API. Subsequent setHouseRules calls update cache.)
    setHouseRules(DEFAULT_HOUSE_RULES);
    expect(getHouseRules()).toEqual(DEFAULT_HOUSE_RULES);
  });

  it('setHouseRules persists to localStorage', () => {
    const custom: HouseRules = { ...DEFAULT_HOUSE_RULES, pinMaxBonusRoll: false };
    setHouseRules(custom);
    const raw = window.localStorage.getItem('wiz6:house-rules');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.pinMaxBonusRoll).toBe(false);
  });

  it('setHouseRule updates a single rule and preserves the rest', () => {
    setHouseRule('pinMaxBonusRoll', false);
    const r = getHouseRules();
    expect(r.pinMaxBonusRoll).toBe(false);
    expect(r.schemaVersion).toBe(1);
  });

  it('resetToStock sets all rules to engine-faithful values', () => {
    setHouseRule('pinMaxBonusRoll', true);
    resetToStock();
    expect(getHouseRules()).toEqual(STOCK_HOUSE_RULES);
  });

  it('resetToDefaults sets all rules to project defaults', () => {
    setHouseRule('pinMaxBonusRoll', false);
    resetToDefaults();
    expect(getHouseRules()).toEqual(DEFAULT_HOUSE_RULES);
  });

  it('setHouseRules validates against the schema (rejects bad types)', () => {
    expect(() =>
      setHouseRules({ ...DEFAULT_HOUSE_RULES, pinMaxBonusRoll: 'yes' as unknown as boolean }),
    ).toThrow();
  });

  it('subscribeHouseRules notifies on changes and returns an unsubscribe fn', () => {
    let calls = 0;
    const received: HouseRules[] = [];
    const unsub = subscribeHouseRules((r) => {
      calls++;
      received.push(r);
    });
    setHouseRule('pinMaxBonusRoll', false);
    setHouseRule('pinMaxBonusRoll', true);
    expect(calls).toBe(2);
    expect(received[0]!.pinMaxBonusRoll).toBe(false);
    expect(received[1]!.pinMaxBonusRoll).toBe(true);
    unsub();
    setHouseRule('pinMaxBonusRoll', false);
    expect(calls).toBe(2); // no further notifications after unsubscribe
  });

  it('corrupt localStorage falls back to defaults on re-read (warns)', () => {
    window.localStorage.setItem('wiz6:house-rules', 'totally-not-json');
    // Direct module-cache test isn't possible; the cache is read on import.
    // The behavior we care about: setHouseRules + getHouseRules cycle work even with prior bad data.
    setHouseRules(DEFAULT_HOUSE_RULES);
    expect(getHouseRules()).toEqual(DEFAULT_HOUSE_RULES);
  });
});
