import { describe, expect, it } from 'vitest';
import {
  SPELL_PICKER_CLASSES,
  classHasSpellPicker,
  STARTER_SPELLS_ARE_PLAYER_SELECTED,
} from '../../src/character-creation/starter-spells.js';

/**
 * Tests for starter-spells finding: no static per-class spell pool.
 *
 * RE evidence (wpcmk.ovr 0x1b28):
 *   e8 8b a0   ; call 0xbbb6 -> ui_window_create (wroot 0x011a)
 * Confirmed by: TREON and PENTAG (both Mage) have different spellSlotsKnown
 * in pcfile.dbs.
 */
describe('STARTER_SPELLS_ARE_PLAYER_SELECTED', () => {
  it('is true — spells are player-selected, not class-static', () => {
    expect(STARTER_SPELLS_ARE_PLAYER_SELECTED).toBe(true);
  });
});

describe('SPELL_PICKER_CLASSES', () => {
  it('contains exactly 6 spell-capable class indices', () => {
    expect(SPELL_PICKER_CLASSES.size).toBe(6);
  });

  it('contains Mage (1)', () => {
    expect(SPELL_PICKER_CLASSES.has(1)).toBe(true);
  });

  it('contains Priest (2)', () => {
    expect(SPELL_PICKER_CLASSES.has(2)).toBe(true);
  });

  it('contains Alchemist (5)', () => {
    expect(SPELL_PICKER_CLASSES.has(5)).toBe(true);
  });

  it('contains Bard (6)', () => {
    expect(SPELL_PICKER_CLASSES.has(6)).toBe(true);
  });

  it('contains Psionic (7)', () => {
    expect(SPELL_PICKER_CLASSES.has(7)).toBe(true);
  });

  it('contains Bishop (9)', () => {
    expect(SPELL_PICKER_CLASSES.has(9)).toBe(true);
  });

  it('does NOT contain Fighter (0)', () => {
    expect(SPELL_PICKER_CLASSES.has(0)).toBe(false);
  });

  it('does NOT contain Thief (3)', () => {
    expect(SPELL_PICKER_CLASSES.has(3)).toBe(false);
  });
});

describe('classHasSpellPicker', () => {
  it('returns true for Mage (1)', () => {
    expect(classHasSpellPicker(1)).toBe(true);
  });

  it('returns false for Fighter (0)', () => {
    expect(classHasSpellPicker(0)).toBe(false);
  });

  it('returns false for Ranger (4)', () => {
    expect(classHasSpellPicker(4)).toBe(false);
  });

  it('returns false for Samurai (11)', () => {
    expect(classHasSpellPicker(11)).toBe(false);
  });
});
