import { describe, it, expect } from 'vitest';
import { scenarioItemName, equipSlotIcon, buildInventoryItems } from '../../../src/pages/castle/item-display.js';
import type { ScenarioDb, ActivePartyMember } from '@wiz6/data';

const db = { items: Array.from({ length: 200 }, (_, i) => ({ index: i, name1: '', name2: '', bytes: [] })) } as unknown as ScenarioDb;
db.items[8]!.name1 = 'LONGSWORD';
db.items[135]!.name1 = 'LEATHER CUIRASS';

describe('item-display', () => {
  it('scenarioItemName resolves name1 by itemId', () => {
    expect(scenarioItemName(db, 8)).toBe('LONGSWORD');
    expect(scenarioItemName(db, 135)).toBe('LEATHER CUIRASS');
  });
  it('scenarioItemName returns empty string for out-of-range id', () => {
    expect(scenarioItemName(db, 9999)).toBe('');
  });
  it('equipSlotIcon maps the verified fighter-kit slots', () => {
    expect(equipSlotIcon(0)).toBe(0x02);
    expect(equipSlotIcon(7)).toBe(0x2a);
    expect(equipSlotIcon(8)).toBe(0x2d);
    expect(equipSlotIcon(10)).toBe(0x2f);
    expect(equipSlotIcon(11)).toBe(0x27);
  });
  it('buildInventoryItems skips empty slots, resolves name+icon, caps at 5', () => {
    const member = { inventory: [
      { itemId: 8, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 },
      { itemId: 0, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 },
      { itemId: 135, weight: 0, equipSlot: 7, spriteIdx: 0, quantity: 0, flags: 0 },
    ] } as unknown as ActivePartyMember;
    expect(buildInventoryItems(member, db)).toEqual([
      { name: 'LONGSWORD', iconChar: 0x02, equippedBodySlot: null },
      { name: 'LEATHER CUIRASS', iconChar: 0x2a, equippedBodySlot: null },
    ]);
  });
  it('buildInventoryItems tags equippedBodySlot from the equipment array', () => {
    const member = { equipment: [0xff, 0xff, 0xff, 0xff, 1, 0xff, 0xff, 0xff], inventory: [
      { itemId: 8, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 },
      { itemId: 135, weight: 0, equipSlot: 7, spriteIdx: 0, quantity: 0, flags: 1 },
    ] } as unknown as ActivePartyMember;
    // equipment[4] = inventory index 1 → the cuirass is worn in body slot 4.
    expect(buildInventoryItems(member, db)).toEqual([
      { name: 'LONGSWORD', iconChar: 0x02, equippedBodySlot: null },
      { name: 'LEATHER CUIRASS', iconChar: 0x2a, equippedBodySlot: 4 },
    ]);
  });
  it('buildInventoryItems returns [] when member has no inventory', () => {
    expect(buildInventoryItems({} as ActivePartyMember, db)).toEqual([]);
  });
});
