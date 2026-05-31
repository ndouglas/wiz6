import type { CreationState, DraftState } from '../../src/pages/roster/creation/state.js';

/** Injection partial = { screen, draft } only (JSON-serializable; no rng). */
export type CreationStatePartial = Partial<CreationState> & { draft?: Partial<DraftState> };

/**
 * The exact M-Elf Mage the creation-spell-* engine fixtures were captured from.
 * MUST match tools/parity/spell-screen-parity.test.ts's mageDraft(). Portrait 0
 * and derived.age = 20*365 are fixture-critical.
 */
export const mageSpellPick: CreationStatePartial = {
  screen: 'spellPick',
  draft: {
    name: 'MAGE',
    race: 1,    // Elf
    sex: 0,     // Male
    class: 1,   // Mage
    attributes: { str: 7, int: 18, pie: 11, vit: 7, dex: 9, spd: 9, per: 8, kar: 5 },
    bonusPool: 0,
    portrait: 0,
    spellPicks: [],
    derived: { hpInitial: 2, stamina: 63, level: 1, secondAge: 1, age: 20 * 365 },
  },
};
