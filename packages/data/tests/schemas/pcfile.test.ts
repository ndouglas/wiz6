import { describe, expect, it } from 'vitest';
import {
  PcfileHeaderSchema,
  PcfileSlotSchema,
  DecodedPcfileSchema,
  type PcfileSlot,
} from '../../src/schemas/pcfile.js';

const validHeader = {
  recordSize: 0x01B0,
  slotCount: 16,
  headerSize: 24,
  status: [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

function emptySlot(slot: number): PcfileSlot {
  return {
    slot, populated: false, name: null,
    ageCounter: 0,
    xp: 0,
    gold: 0,
    hpCurrent: 0, hpMax: 0,
    spCurrent: 0, spMax: 0,
    schoolManaCur: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    level: 0, levelSecondary: 0,
    conditions: new Array(10).fill(0),
    race: 0, alignment: 0, class: 0,
    str: 0, int: 0, pie: 0, vit: 0, dex: 0, spd: 0, per: 0, kar: 0,
    skills: new Array(14).fill(0),
    reaction: 0,
    savedOldLevel: 0,
    raw: new Array(432).fill(0),
  };
}

describe('PcfileHeaderSchema', () => {
  it('accepts valid header', () => {
    expect(() => PcfileHeaderSchema.parse(validHeader)).not.toThrow();
  });
  it('rejects wrong status length', () => {
    expect(() => PcfileHeaderSchema.parse({ ...validHeader, status: [1, 1, 1] })).toThrow();
  });
  it('rejects out-of-range recordSize', () => {
    expect(() => PcfileHeaderSchema.parse({ ...validHeader, recordSize: 0x10000 })).toThrow();
  });
});

describe('PcfileSlotSchema', () => {
  it('accepts a valid empty slot', () => {
    expect(() => PcfileSlotSchema.parse(emptySlot(0))).not.toThrow();
  });
  it('accepts a valid populated slot (THESUS with real decoded values)', () => {
    const populated: PcfileSlot = {
      ...emptySlot(0),
      populated: true,
      name: 'THESUS',
      ageCounter: 6590,
      xp: 0,
      // Gold at +0x14: 0 for all stock chars. CORRECTED from prior +0x22 u16 = 2700.
      gold: 0,
      hpCurrent: 8, hpMax: 8,
      spCurrent: 126, spMax: 126,
      // School mana: all 0 for fighters (no spell schools).
      schoolManaCur: [0, 0, 0, 0, 0, 0],
      schoolManaMax: [0, 0, 0, 0, 0, 0],
      level: 1, levelSecondary: 1,
      // Conditions: all zeros (healthy, no afflictions). conditions[2]=dead=0, [3]=paralyzed=0.
      conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      // Race/class/attributes confirmed by wpcvw stats panel ASM traces.
      race: 0,       // Human
      alignment: 0,  // Good (tentative)
      class: 0,      // Fighter
      str: 18, int: 8, pie: 8, vit: 12, dex: 10, spd: 9, per: 8, kar: 14,
      // Skills: fighter primary skill[1]=10, skill[8]=2.
      skills: [0, 10, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0],
      // Reaction: 20 for THESUS (stock starting value per pcfile.dbs).
      reaction: 20,
      // savedOldLevel: 0 (never changed class).
      savedOldLevel: 0,
    };
    expect(() => PcfileSlotSchema.parse(populated)).not.toThrow();
  });
  it('rejects raw of wrong length', () => {
    expect(() => PcfileSlotSchema.parse({ ...emptySlot(0), raw: [0] })).toThrow();
  });
  it('accepts null name on empty slot', () => {
    expect(() => PcfileSlotSchema.parse(emptySlot(5))).not.toThrow();
  });
});

describe('DecodedPcfileSchema', () => {
  it('accepts a roster of 16 slots', () => {
    const decoded = {
      header: validHeader,
      slots: Array.from({ length: 16 }, (_, i) => emptySlot(i)),
    };
    expect(() => DecodedPcfileSchema.parse(decoded)).not.toThrow();
  });
  it('rejects when slot count != 16', () => {
    const decoded = {
      header: validHeader,
      slots: Array.from({ length: 6 }, (_, i) => emptySlot(i)),
    };
    expect(() => DecodedPcfileSchema.parse(decoded)).toThrow();
  });
});
