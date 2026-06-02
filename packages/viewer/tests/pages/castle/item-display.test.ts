import { describe, it, expect } from 'vitest';
import { scenarioItemName, itemIconGlyph, buildInventoryItems } from '../../../src/pages/castle/item-display.js';
import type { ScenarioDb, ActivePartyMember } from '@wiz6/data';

const db = { items: Array.from({ length: 200 }, (_, i) => ({ index: i, name1: '', name2: '', bytes: [] })) } as unknown as ScenarioDb;
db.items[8]!.name1 = 'LONGSWORD';
db.items[135]!.name1 = 'LEATHER CUIRASS';
db.items[143]!.name1 = 'STEEL HELM';
db.items[133]!.name1 = 'QUILT TUNIC';

describe('item-display', () => {
  it('scenarioItemName resolves name1 by itemId', () => {
    expect(scenarioItemName(db, 8)).toBe('LONGSWORD');
    expect(scenarioItemName(db, 135)).toBe('LEATHER CUIRASS');
  });
  it('scenarioItemName returns empty string for out-of-range id', () => {
    expect(scenarioItemName(db, 9999)).toBe('');
  });

  // The col-38 inventory glyph (and the reused AC-grid icon) is the item's OWN
  // sprite glyph: (cached scenario.dbs byte 61 = spriteIdx) + 1. It is NOT a
  // per-equipSlot table — that only matched THESUS's kit by coincidence.
  // RE: docs/re/findings/wpcvw-inventory-glyph-table.json (render fn wpcvw 0x6c81;
  // col-38 putchar at 0x705e draws invSlot.byte5 + 1, attr 4).
  it('itemIconGlyph is the item sprite index + 1', () => {
    expect(itemIconGlyph(0x01)).toBe(0x02); // LONGSWORD (verified vs save 5)
    expect(itemIconGlyph(0x29)).toBe(0x2a); // LEATHER CUIRASS
    expect(itemIconGlyph(0x2e)).toBe(0x2f); // SANDALS
    expect(itemIconGlyph(0x26)).toBe(0x27); // BUCKLER SHIELD
    expect(itemIconGlyph(0xff)).toBe(0x00); // wraps to a byte
  });

  it('buildInventoryItems skips empty slots, resolves name+icon, caps at 5', () => {
    const member = { inventory: [
      { itemId: 8, weight: 0, equipSlot: 0, spriteIdx: 0x01, quantity: 0, flags: 0 },
      { itemId: 0, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 },
      { itemId: 135, weight: 0, equipSlot: 7, spriteIdx: 0x29, quantity: 0, flags: 0 },
    ] } as unknown as ActivePartyMember;
    expect(buildInventoryItems(member, db)).toEqual([
      { name: 'LONGSWORD', iconChar: 0x02, equippedBodySlot: null },
      { name: 'LEATHER CUIRASS', iconChar: 0x2a, equippedBodySlot: null },
    ]);
  });

  it('uses each item OWN sprite glyph — a helm is not a sword (regression)', () => {
    // Bug: head/cloak/hands/ranged items all rendered the DEFAULT 0x02 sword glyph
    // because the old icon map was equipSlot-indexed + incomplete; and even same-slot
    // items shared one glyph. The glyph is per-item (sprite+1): STEEL HELM (eq6, head)
    // → 0x1a, and QUILT TUNIC (eq7, chest) → 0x2b — distinct from LEATHER CUIRASS's
    // 0x2a despite the same chest slot. Verified vs scenario.dbs item records.
    const member = { inventory: [
      { itemId: 143, weight: 0, equipSlot: 6, spriteIdx: 0x19, quantity: 0, flags: 0 }, // STEEL HELM
      { itemId: 133, weight: 0, equipSlot: 7, spriteIdx: 0x2a, quantity: 0, flags: 0 }, // QUILT TUNIC
    ] } as unknown as ActivePartyMember;
    expect(buildInventoryItems(member, db)).toEqual([
      { name: 'STEEL HELM', iconChar: 0x1a, equippedBodySlot: null },
      { name: 'QUILT TUNIC', iconChar: 0x2b, equippedBodySlot: null },
    ]);
  });

  it('buildInventoryItems tags equippedBodySlot from the equipment array', () => {
    const member = { equipment: [0xff, 0xff, 0xff, 0xff, 1, 0xff, 0xff, 0xff], inventory: [
      { itemId: 8, weight: 0, equipSlot: 0, spriteIdx: 0x01, quantity: 0, flags: 0 },
      { itemId: 135, weight: 0, equipSlot: 7, spriteIdx: 0x29, quantity: 0, flags: 1 },
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
