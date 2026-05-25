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
    xp: 0, level: 0, levelSecondary: 0,
    hpCurrent: 0, hpMax: 0, spCurrent: 0, gold: 0,
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
  it('accepts a valid populated slot', () => {
    const populated: PcfileSlot = {
      ...emptySlot(0),
      populated: true,
      name: 'THESUS',
      xp: 6590,
      level: 8, levelSecondary: 8,
      hpCurrent: 126, hpMax: 126,
      spCurrent: 295, gold: 2700,
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
