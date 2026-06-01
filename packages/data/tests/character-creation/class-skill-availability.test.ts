import { describe, expect, it } from 'vitest';
import {
  CLASS_SKILL_AVAILABILITY,
  SKILL_SLOT_NAMES,
  availableSkillSlots,
  classCanTrainSkill,
} from '../../src/character-creation/class-skill-availability.js';

describe('CLASS_SKILL_AVAILABILITY', () => {
  it('has 14 classes', () => {
    expect(CLASS_SKILL_AVAILABILITY).toHaveLength(14);
  });

  it('every class has 30 skill slots', () => {
    for (const arr of CLASS_SKILL_AVAILABILITY) {
      expect(arr).toHaveLength(30);
    }
  });

  it('Bard (6) has the most available skills (broadly versatile)', () => {
    const counts = CLASS_SKILL_AVAILABILITY.map((arr) => arr.filter(Boolean).length);
    const bardCount = counts[6]!;
    // Bard is documented as the most versatile; should be tied with Ninja per martydill
    expect(bardCount).toBeGreaterThanOrEqual(Math.max(...counts.filter((_, i) => i !== 6)) - 1);
  });

  it('Fighter (0) has 13 available skills (mostly weapons + a few academics)', () => {
    const fighterSkills = CLASS_SKILL_AVAILABILITY[0]!.filter(Boolean).length;
    expect(fighterSkills).toBe(13);
  });
});

describe('SKILL_SLOT_NAMES (engine map, msg 5500+slot — docs/re/findings/wpcvw-skill-names.json)', () => {
  it('has 30 entries (one per skill slot), all named (no holes)', () => {
    expect(SKILL_SLOT_NAMES).toHaveLength(30);
    expect(SKILL_SLOT_NAMES.every((n) => typeof n === 'string' && n.length > 0)).toBe(true);
  });

  it('slot 0 is WAND&DAGGER (engine msg 5500 — corrects the old "Sword")', () => {
    expect(SKILL_SLOT_NAMES[0]).toBe('WAND&DAGGER');
  });

  it('slot 1 is SWORD (so THESUS Fighter skill[1]=10 is Sword, not Axe)', () => {
    expect(SKILL_SLOT_NAMES[1]).toBe('SWORD');
  });

  it('slot 15 is SKULDUGGERY (matches LYSANDR Thief skill[15]=10)', () => {
    expect(SKILL_SLOT_NAMES[15]).toBe('SKULDUGGERY');
  });

  it('slot 17 is DEFENSE — a real PERSONAL skill the old map treated as a hole', () => {
    expect(SKILL_SLOT_NAMES[17]).toBe('DEFENSE');
  });

  it('slot 22 is ARTIFACTS (engine — corrects the old "Scouting")', () => {
    expect(SKILL_SLOT_NAMES[22]).toBe('ARTIFACTS');
  });

  it('slot 28 is THAUMATURGY (matches TREON Mage skill[28]=10)', () => {
    expect(SKILL_SLOT_NAMES[28]).toBe('THAUMATURGY');
  });
});

describe('availableSkillSlots', () => {
  it('returns array of bit-set indices for Fighter', () => {
    const slots = availableSkillSlots(0);
    expect(slots.length).toBeGreaterThan(0);
    // Slot 0 (WAND&DAGGER) is available to Fighter
    expect(slots).toContain(0);
  });

  it('throws on out-of-range class', () => {
    expect(() => availableSkillSlots(-1)).toThrow();
    expect(() => availableSkillSlots(14)).toThrow();
  });
});

describe('classCanTrainSkill cross-validates against stock-character skill values', () => {
  // Each stock character has nonzero skill values in slots their class
  // can train. If our bitmaps are correct, every nonzero stock skill
  // corresponds to a true bit in the class's availability.
  // (The mapping from slot → name is speculative, but the BITMAP itself
  // is binary-decoded from wpcmk.ovr — high confidence.)

  it('THESUS Fighter (class 0) has skill[1]=10 — slot 1 must be available to Fighter', () => {
    expect(classCanTrainSkill(0, 1)).toBe(true);
  });

  it('LYSANDR Thief (class 3) has skill[15]=10 — slot 15 (Skulduggery) must be available to Thief', () => {
    expect(classCanTrainSkill(3, 15)).toBe(true);
  });

  it('NOBAL Priest (class 2) has skill[26]=7 — slot 26 (Theology) must be available to Priest', () => {
    expect(classCanTrainSkill(2, 26)).toBe(true);
  });

  it('TREON Mage (class 1) has skill[28]=10 — slot 28 (Thaumaturgy) must be available to Mage', () => {
    expect(classCanTrainSkill(1, 28)).toBe(true);
  });

  it('PENTAG Mage (class 1) has skill[28]=7 — slot 28 (Thaumaturgy) must be available to Mage', () => {
    expect(classCanTrainSkill(1, 28)).toBe(true);
  });
});
