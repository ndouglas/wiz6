import { describe, expect, it, beforeEach } from 'vitest';
import {
  getHouseRules,
  setHouseRules,
  resetToStock,
  resetToDefaults,
  subscribeHouseRules,
} from '../../src/lib/house-rules-store.js';
import { DEFAULT_HOUSE_RULES, STOCK_HOUSE_RULES } from '@wiz6/data';

beforeEach(() => {
  window.localStorage.clear();
  // Force re-read by resetting to defaults
  resetToDefaults();
});

describe('house-rules-store', () => {
  it('initial read returns DEFAULT_HOUSE_RULES when storage is empty', () => {
    window.localStorage.clear();
    setHouseRules(DEFAULT_HOUSE_RULES);
    expect(getHouseRules()).toEqual(DEFAULT_HOUSE_RULES);
  });

  it('setHouseRules persists to localStorage', () => {
    setHouseRules(DEFAULT_HOUSE_RULES);
    const raw = window.localStorage.getItem('wiz6:house-rules');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.schemaVersion).toBe(1);
  });

  it('resetToStock sets all rules to engine-faithful values', () => {
    resetToStock();
    expect(getHouseRules()).toEqual(STOCK_HOUSE_RULES);
  });

  it('resetToDefaults sets all rules to project defaults', () => {
    resetToDefaults();
    expect(getHouseRules()).toEqual(DEFAULT_HOUSE_RULES);
  });

  it('setHouseRules validates against the schema (rejects missing schemaVersion)', () => {
    expect(() =>
      setHouseRules({ schemaVersion: 2 } as unknown as typeof DEFAULT_HOUSE_RULES),
    ).toThrow();
  });

  it('subscribeHouseRules notifies on changes and returns an unsubscribe fn', () => {
    let calls = 0;
    const unsub = subscribeHouseRules(() => {
      calls++;
    });
    setHouseRules(DEFAULT_HOUSE_RULES);
    setHouseRules(STOCK_HOUSE_RULES);
    expect(calls).toBe(2);
    unsub();
    setHouseRules(DEFAULT_HOUSE_RULES);
    expect(calls).toBe(2); // no further notifications after unsubscribe
  });

  it('corrupt localStorage falls back to defaults on re-read (warns)', () => {
    window.localStorage.setItem('wiz6:house-rules', 'totally-not-json');
    setHouseRules(DEFAULT_HOUSE_RULES);
    expect(getHouseRules()).toEqual(DEFAULT_HOUSE_RULES);
  });
});
