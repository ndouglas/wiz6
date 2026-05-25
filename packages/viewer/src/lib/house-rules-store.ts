import {
  HouseRulesSchema,
  DEFAULT_HOUSE_RULES,
  STOCK_HOUSE_RULES,
  type HouseRules,
} from '@wiz6/data';

/**
 * localStorage-backed house-rules state.
 *
 * Mirrors the pattern in `audio.ts` (mute toggle): module-scope cached
 * value + listener set + subscribe API for React components.
 *
 * Schema is versioned (HouseRulesSchema.schemaVersion === 1). Corrupt or
 * old-version data falls back to DEFAULT_HOUSE_RULES with a console.warn.
 */
const KEY = 'wiz6:house-rules';

function readFromStorage(): HouseRules {
  if (typeof window === 'undefined') return DEFAULT_HOUSE_RULES;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return DEFAULT_HOUSE_RULES;
    const parsed = JSON.parse(raw);
    return HouseRulesSchema.parse(parsed);
  } catch (e) {
    console.warn('[house-rules-store] invalid data; falling back to defaults', e);
    return DEFAULT_HOUSE_RULES;
  }
}

let cached: HouseRules = readFromStorage();
const listeners = new Set<(r: HouseRules) => void>();

/** Read the current house rules. Cheap — returns the cached value. */
export function getHouseRules(): HouseRules {
  return cached;
}

/** Replace the entire house-rules object. Validates against the schema. */
export function setHouseRules(next: HouseRules): void {
  const validated = HouseRulesSchema.parse(next);
  cached = validated;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(validated));
    } catch {
      /* localStorage may be unavailable; updates still notify in-memory listeners. */
    }
  }
  for (const fn of listeners) fn(cached);
}

/** Update a single rule. Type-safe via keyof + value type. */
export function setHouseRule<K extends keyof Omit<HouseRules, 'schemaVersion'>>(
  key: K,
  value: HouseRules[K],
): void {
  setHouseRules({ ...cached, [key]: value });
}

/** Reset to engine-faithful (stock) behavior on every rule. */
export function resetToStock(): void {
  setHouseRules(STOCK_HOUSE_RULES);
}

/** Reset to the project's recommended defaults (engine + curated QoL). */
export function resetToDefaults(): void {
  setHouseRules(DEFAULT_HOUSE_RULES);
}

/** Subscribe to changes. Returns an unsubscribe function. */
export function subscribeHouseRules(fn: (r: HouseRules) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
