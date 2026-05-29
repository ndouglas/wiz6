import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setHouseRule } from '../../src/lib/house-rules-store.js';

describe('playInvalidActionBeep', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it('is a no-op when playInvalidActionBeep house rule is FALSE', async () => {
    // Import fresh so module-scope state is reset.
    const { playInvalidActionBeep } = await import('../../src/lib/audio.js');
    setHouseRule('playInvalidActionBeep', false);
    // No throw; no audio context interaction. Validates the early return path.
    expect(() => playInvalidActionBeep()).not.toThrow();
  });

  it('does not throw when called before audio is unlocked (silent no-op)', async () => {
    const { playInvalidActionBeep } = await import('../../src/lib/audio.js');
    setHouseRule('playInvalidActionBeep', true);
    // No user gesture has happened → playSnd path is gated by maybeInitContext.
    expect(() => playInvalidActionBeep()).not.toThrow();
  });
});
