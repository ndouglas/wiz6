/**
 * Pure helpers to turn a character's stored inventory into the render-ready
 * InventoryItem list (name + body-slot glyph) the WPCVW main panel draws.
 * Names from scenario.dbs (items[id].name1).
 *
 * Icon glyph: the col-38 inventory glyph (and the AC-grid icon it is reused for)
 * is the item's OWN sprite glyph — `spriteIdx + 1`, where spriteIdx is the cached
 * scenario.dbs item byte 61. It is NOT a per-equipSlot table: the engine reads the
 * item's sprite field and increments it (render fn wpcvw 0x6c81, col-38 putchar at
 * 0x705e: char = invSlot.byte5 + 1, attr 4). The previous equipSlot→glyph map only
 * reproduced THESUS's stock kit by coincidence — a STEEL HELM (eq6) rendered the
 * 0x02 sword glyph, and even same-slot items (LEATHER CUIRASS vs QUILT TUNIC, both
 * eq7) share one map entry but have distinct sprites.
 * RE: docs/re/findings/wpcvw-inventory-glyph-table.json.
 */
import type { ScenarioDb, ActivePartyMember } from '@wiz6/data';
import type { InventoryItem } from './compose-main-panel.js';

const INV_MAX_ROWS = 5;

export function scenarioItemName(db: ScenarioDb, itemId: number): string {
  return db.items[itemId]?.name1 ?? '';
}

/** The wfont0 body-slot glyph the engine draws for an item: its sprite index + 1. */
export function itemIconGlyph(spriteIdx: number): number {
  return (spriteIdx + 1) & 0xff;
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
      iconChar: itemIconGlyph(slot.spriteIdx),
      equippedBodySlot: bodySlot === -1 ? null : bodySlot,
      quantity: slot.quantity,
    });
    if (out.length >= INV_MAX_ROWS) break;
  }
  return out;
}
