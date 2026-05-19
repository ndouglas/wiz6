import { describe, expect, it } from 'vitest';
import { describePlan, type Plan } from '../src/index.js';

describe('describePlan', () => {
  it('returns a Plan describing what would be parsed for a given originalDir', () => {
    const plan: Plan = describePlan({ originalDir: '/path/to/original' });
    expect(plan.originalDir).toBe('/path/to/original');
    expect(plan.schemaVersion).toBe(1);
    expect(Array.isArray(plan.steps)).toBe(true);
  });
});
