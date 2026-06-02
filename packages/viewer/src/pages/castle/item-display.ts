/**
 * Pure helpers to turn a character's stored inventory (itemId + equipSlot) into
 * the render-ready InventoryItem list (name + body-slot glyph) the WPCVW main
 * panel draws. Names from scenario.dbs (items[id].name1); icons from a fixed
 * equipSlot → wfont0-glyph map.
 *
 * Verified glyphs (compose-main-panel.ts:154 + screen-parity NATHAN fixture):
 *   slot 0=0x02, 7=0x2a, 8=0x2d, 10=0x2f, 11=0x27. Other equipSlots are
 *   best-effort until a fixture with those item types exists.
 */
import type { ScenarioDb, ActivePartyMember } from '@wiz6/data';
import type { InventoryItem } from './compose-main-panel.js';

const INV_MAX_ROWS = 5;

const EQUIP_SLOT_ICON: Readonly<Record<number, number>> = {
  0: 0x02, 1: 0x02, 2: 0x02, 3: 0x02, // weapons
  7: 0x2a, 8: 0x2d, 10: 0x2f, 11: 0x27, // body, legs, feet, shield
};
const DEFAULT_ICON = 0x02;

export function scenarioItemName(db: ScenarioDb, itemId: number): string {
  return db.items[itemId]?.name1 ?? '';
}

export function equipSlotIcon(equipSlot: number): number {
  return EQUIP_SLOT_ICON[equipSlot] ?? DEFAULT_ICON;
}

export function buildInventoryItems(member: ActivePartyMember, db: ScenarioDb): InventoryItem[] {
  const slots = member.inventory ?? [];
  const equipment = member.equipment ?? [];
  const out: InventoryItem[] = [];
  for (let idx = 0; idx < slots.length; idx++) {
    const slot = slots[idx]!;
    if (slot.itemId <= 0) continue;
    // equipment[bodySlot] holds the inventory index of the item worn there, so
    // the body slot equipping this item is the position of `idx` in equipment[].
    const bodySlot = equipment.indexOf(idx);
    out.push({
      name: scenarioItemName(db, slot.itemId),
      iconChar: equipSlotIcon(slot.equipSlot),
      equippedBodySlot: bodySlot === -1 ? null : bodySlot,
    });
    if (out.length >= INV_MAX_ROWS) break;
  }
  return out;
}
