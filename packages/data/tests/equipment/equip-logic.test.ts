import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bodySlotForItem, bitTest, itemEligible, equipCandidates } from '../../src/equipment/equip-logic.js';
import { ScenarioDbSchema, type ScenarioDb, type Character } from '../../src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..'); // repo root
let _db: ScenarioDb | null = null;
function realScenarioDb(): ScenarioDb {
  if (!_db)
    _db = ScenarioDbSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'extracted', 'scenario', 'scenario.json'), 'utf-8')),
    );
  return _db;
}
function invSlot(itemId: number, equipSlot: number, flags = 0) {
  return { itemId, weight: 0, equipSlot, spriteIdx: 0, quantity: 0, flags };
}
/** THESUS — fighter (class 0), human (race 0), male (sex 0), with his 5 carried items. */
function thesus(): Character {
  const empty = invSlot(0, 0);
  const inventory = [
    invSlot(8, 0), // LONGSWORD  → body0
    invSlot(135, 7), // LEATHER CUIRASS → body4 (chest)
    invSlot(132, 8), // FUR LEGGING → body5
    invSlot(130, 0xa), // SANDALS → body7
    invSlot(141, 0xb), // BUCKLER SHIELD → body1
    ...Array(17).fill(empty),
  ];
  return {
    class: 0,
    race: 0,
    sex: 0,
    level: 1,
    attributes: { str: 18, int: 8, pie: 8, vit: 12, dex: 10, spd: 9, per: 8, kar: 14 },
    skills: Array(30).fill(0),
    inventory,
    name: 'THESUS',
  } as unknown as Character;
}
const emptySelections = (): (number | null)[] => Array(8).fill(null);

describe('bitTest', () => {
  it('tests bit (value&7) of byte (value>>3) of the mask', () => {
    expect(bitTest([0b0000_0001, 0], 0)).toBe(true);
    expect(bitTest([0b0000_0001, 0], 1)).toBe(false);
    expect(bitTest([0, 0b0000_0100], 10)).toBe(true); // 10>>3=1, 10&7=2
  });
});

describe('bodySlotForItem(equipSlot, fillingSlot, flags)', () => {
  it('weapon equipSlots 0,1,2,3,0xc,0x10 → body0', () => {
    for (const s of [0, 1, 2, 3, 0xc, 0x10]) expect(bodySlotForItem(s, 0, 0)).toBe(0);
  });
  it('armor/shield/ranged fixed map', () => {
    expect(bodySlotForItem(4, 1, 0)).toBe(1);
    expect(bodySlotForItem(5, 2, 0)).toBe(2);
    expect(bodySlotForItem(6, 3, 0)).toBe(3);
    expect(bodySlotForItem(7, 4, 0)).toBe(4);
    expect(bodySlotForItem(8, 5, 0)).toBe(5);
    expect(bodySlotForItem(9, 6, 0)).toBe(6);
    expect(bodySlotForItem(0xa, 7, 0)).toBe(7);
    expect(bodySlotForItem(0xb, 1, 0)).toBe(1);
  });
  it('dual-wield weapon (flag 0x04) → body1 when filling slot 1; else weapon stays body0', () => {
    expect(bodySlotForItem(0, 1, 0x04)).toBe(1);
    expect(bodySlotForItem(0, 1, 0)).toBeNull(); // non-dual weapon can't fill off-hand
  });
  it('non-equippable (>=0x11) → null', () => {
    expect(bodySlotForItem(0x11, 0, 0)).toBeNull();
  });
});

describe('itemEligible', () => {
  // classMask = bytes[54..55], raceMask = [56..57], sexMask = [58..59].
  it('passes only when class+race+sex bits are all set', () => {
    const bytes = Array(74).fill(0);
    bytes[54] = 0b0000_0001; // class 0 allowed
    bytes[56] = 0b0000_0001; // race 0 allowed
    bytes[58] = 0b0000_0001; // sex 0 allowed
    expect(itemEligible({ class: 0, race: 0, sex: 0 }, bytes)).toBe(true);
    expect(itemEligible({ class: 1, race: 0, sex: 0 }, bytes)).toBe(false); // class 1 not allowed
  });
});

describe('equipCandidates (THESUS + real scenario.dbs)', () => {
  it('weapon→slot0, chest→slot4, shield→slot1', () => {
    const m = thesus();
    const db = realScenarioDb();
    expect(equipCandidates(m, 0, db, emptySelections())).toContain(0); // LONGSWORD
    expect(equipCandidates(m, 4, db, emptySelections())).toContain(1); // LEATHER CUIRASS
    expect(equipCandidates(m, 1, db, emptySelections())).toContain(4); // BUCKLER SHIELD
  });
  it('excludes indices already selected', () => {
    const m = thesus();
    const db = realScenarioDb();
    const sel = emptySelections();
    sel[0] = 0;
    expect(equipCandidates(m, 1, db, sel)).not.toContain(0);
  });
});
