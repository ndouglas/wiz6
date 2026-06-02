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

const EMPTY_INV_ITEM = {
  itemId: 0, weight: 0, pad: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0,
};

function emptySlot(slot: number): PcfileSlot {
  return {
    slot, populated: false, name: null,
    ageCounter: 0,
    xp: 0,
    // mks (Monster Kill Statistic). Manual p. 23: kill counter. 0 for stock chars.
    mks: 0,
    gold: 0,
    hpCurrent: 0, hpMax: 0,
    spCurrent: 0, spMax: 0,
    // encumbranceCurrent: current load in tenths of a pound. martydill cross-ref.
    encumbranceCurrent: 0,
    // encumbranceMax: max carry capacity in tenths of a pound. martydill cross-ref.
    encumbranceMax: 0,
    schoolManaCur: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    level: 0, levelSecondary: 0,
    conditions: new Array(10).fill(0),
    race: 0, sex: 0, class: 0,
    str: 0, int: 0, pie: 0, vit: 0, dex: 0, spd: 0, per: 0, kar: 0,
    // skills: 30 bytes (EXTENDED from 14). Prior 'derived_stats_block' was skill continuation.
    skills: new Array(30).fill(0),
    // bodyAc: 7-byte per-body-slot AC. Manual p. 25. Stock unarmored = [0,0,10,10,10,10,10].
    bodyAc: [0, 0, 10, 10, 10, 10, 10],
    schoolRankThresholds: new Array(14).fill(0),
    derivedAc: 10,
    reaction: 0,
    npcRaceReaction: new Array(31).fill(0),
    spellSlotsKnown: new Array(20).fill(0),
    portraitIndex: 0,
    inventoryCount: 0,
    // inventoryCountPage2: page-2 item count. martydill cross-ref. 0 for stock chars.
    inventoryCountPage2: 0,
    savedOldLevel: 0,
    // Inventory: 22 empty slots. inventory_count in raw = 0; all item_ids = 0.
    inventory: new Array(22).fill(EMPTY_INV_ITEM),
    // Equipment: 8 slots all 0xFF = unequipped.
    equipment: new Array(8).fill(0xFF),
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
      // mks (Monster Kill Statistic): 0 for stock chars (no kills yet).
      mks: 0,
      // Gold at +0x14: 0 for all stock chars. CORRECTED from prior +0x22 u16 = 2700.
      gold: 0,
      // encumbranceCurrent: 295 (29.5 lbs). THESUS carries 5 items. martydill cross-ref.
      encumbranceCurrent: 295,
      // encumbranceMax: 2700 (270 lbs). THESUS has STR=18 (max strength). martydill cross-ref.
      encumbranceMax: 2700,
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
      sex: 0,        // male (+0x19e)
      class: 0,      // Fighter
      str: 18, int: 8, pie: 8, vit: 12, dex: 10, spd: 9, per: 8, kar: 14,
      // Skills (30 bytes): fighter primary skill[1]=10(Axe per martydill), skill[8]=2(Bow).
      // Remaining 16 bytes (the old 'derived_stats_block') now decoded as skills 14-29.
      skills: [0, 10, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      // bodyAc[7] at +0x161. Manual p. 25: AC sub-components. Stock unarmored = [0,0,10,10,10,10,10].
      bodyAc: [0, 0, 10, 10, 10, 10, 10],
      // schoolRankThresholds: class-derived values at +0x152. MEDIUM confidence.
      schoolRankThresholds: [0, 8, 4, 8, 4, 8, 8, 8, 8, 28, 8, 48, 4, 0],
      // derivedAc: base 10 at +0x160. No SPD bonus, not Faerie, not Monk/Ninja.
      derivedAc: 10,
      // Reaction: 20 for THESUS (stock starting value per pcfile.dbs).
      reaction: 20,
      // npcRaceReaction: 31 entries all = 20 (no prior NPC encounters).
      npcRaceReaction: new Array(31).fill(20),
      // spellSlotsKnown: all zero for fighters (no spell schools).
      spellSlotsKnown: new Array(20).fill(0),
      // portraitIndex: 10 for THESUS.
      portraitIndex: 10,
      // inventoryCount: 5 starting items.
      inventoryCount: 5,
      // savedOldLevel: 0 (never changed class).
      savedOldLevel: 0,
      // Inventory: THESUS has 5 starting items (LONGSWORD/LEATHER CUIRASS/FUR LEGGING/SANDALS/BUCKLER).
      // Confirmed by pcfile.dbs decode + 100% scenario.dbs cross-check on weight/equipSlot/spriteIdx.
      inventory: [
        { itemId: 8,   weight: 50,  pad: 0, equipSlot: 0,  spriteIdx: 1,  quantity: 0, flags: 0 }, // LONGSWORD
        { itemId: 135, weight: 140, pad: 0, equipSlot: 7,  spriteIdx: 41, quantity: 0, flags: 0 }, // LEATHER CUIRASS
        { itemId: 132, weight: 50,  pad: 0, equipSlot: 8,  spriteIdx: 44, quantity: 0, flags: 0 }, // FUR LEGGING
        { itemId: 130, weight: 15,  pad: 0, equipSlot: 10, spriteIdx: 46, quantity: 0, flags: 0 }, // SANDALS
        { itemId: 141, weight: 40,  pad: 0, equipSlot: 11, spriteIdx: 38, quantity: 0, flags: 0 }, // BUCKLER SHIELD
        ...new Array(17).fill(EMPTY_INV_ITEM),
      ],
      // Equipment: all 0xFF (items in inventory but not pre-equipped).
      equipment: new Array(8).fill(0xFF),
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
