/**
 * Per-class starting equipment issued at character creation (pure, no I/O).
 * RE: docs/re/findings/creation-starting-equipment.json.
 *
 * The kit is a HARDCODED per-class table in wpcmk.ovr (`wpcmk_issue_class_kit`
 * @ 0x3c49) — NOT read from newgame.dbs. Each class gets 5 items, all CARRIED
 * (never auto-equipped; the equipment array stays all-0xff). Verified byte-exact
 * against the stock characters (Fighter kit == THESUS's inventory).
 *
 * `give_one_item` (wpcmk 0x3aec) loads each item's scenario.dbs record and
 * writes the 8-byte inventory slot: weight (scenario weight), equipSlot
 * (scenario byte 0x3c), spriteIdx (byte 0x3d), quantity (stack/charge:
 * byte0x16*byte0x17 + word0x14), and flags translated from the scenario
 * item-flags byte 0x3b (0x08→0x04, 0x04→0x08, 0x10→0x10, 0x20→0x20, 0x02→0x40).
 * Equipped-bit (0x01) is NOT set (carried). We reproduce that slot build here.
 */
import type { ScenarioDb } from '../schemas/scenario-db.js';
import type { InventoryItem } from '../schemas/character.js';

export const INVENTORY_SLOTS = 22;

/** Class index (0=Fighter..13=Ninja) → 5 starting item ids (scenario.dbs index). */
export const STARTING_KITS: readonly (readonly number[])[] = [
  [8, 135, 132, 130, 141],  // 0  Fighter   LONGSWORD, LEATHER CUIRASS, FUR LEGGING, SANDALS, BUCKLER SHIELD
  [18, 122, 123, 130, 335], // 1  Mage      STAFF, ROBES(U), ROBES(L), SANDALS, MAGIC MISSILE
  [24, 122, 123, 130, 316], // 2  Priest    QUARTERSTAFF, ROBES(U), ROBES(L), SANDALS, LT.HEAL
  [6, 120, 121, 131, 27],   // 3  Thief     CUTLASS, CLOTH SHIRT, CLOTH PANTS, BUSKINS, DIRK
  [31, 33, 126, 127, 131],  // 4  Ranger    SHORT BOW, ELM ARROW, SUEDE DOUBLET, SUEDE PANTS, BUSKINS
  [18, 122, 123, 130, 326], // 5  Alchemist STAFF, ROBES(U), ROBES(L), SANDALS, STINK BOMB
  [29, 30, 120, 121, 55],   // 6  Bard      SLING, BULLET STONE, CLOTH SHIRT, CLOTH PANTS, LUTE
  [1, 122, 123, 130, 241],  // 7  Psionic   DAGGER, ROBES(U), ROBES(L), SANDALS, SHADOW CLOAK
  [22, 124, 125, 130, 138], // 8  Valkyrie  SPEAR, FUR HALTER, CHAMOIS SKIRT, SANDALS, LEATHER HELM
  [24, 122, 123, 130, 163], // 9  Bishop    QUARTERSTAFF, ROBES(U), ROBES(L), SANDALS, MITRE
  [9, 133, 134, 131, 143],  // 10 Lord      BROADSWORD, QUILT TUNIC, QUILT LEGGING, BUSKINS, STEEL HELM
  [10, 4, 122, 123, 130],   // 11 Samurai   KATANA, WAKIZASHI, ROBES(U), ROBES(L), SANDALS
  [25, 47, 122, 123, 130],  // 12 Monk      BO, SHURIKEN, ROBES(U), ROBES(L), SANDALS
  [47, 160, 158, 159, 161], // 13 Ninja     SHURIKEN, NINJA COWL, NINJA GARB(U), NINJA GARB(L), TABI BOOTS
];

function emptySlot(): InventoryItem {
  return { itemId: 0, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 };
}

/** Build one carried inventory slot for `itemId` from its scenario.dbs record,
 *  mirroring give_one_item (wpcmk 0x3aec). */
function kitSlot(scenarioDb: ScenarioDb, itemId: number): InventoryItem {
  const item = scenarioDb.items[itemId];
  if (!item) return { ...emptySlot(), itemId };
  const b = item.bytes;
  const scenFlags = b[0x3b] ?? 0;
  let flags = 0;
  if (scenFlags & 0x08) flags |= 0x04; // stackable/thrown
  if (scenFlags & 0x04) flags |= 0x08; // two-handed
  if (scenFlags & 0x10) flags |= 0x10;
  if (scenFlags & 0x20) flags |= 0x20;
  if (scenFlags & 0x02) flags |= 0x40; // class-locked
  // quantity (stack/charge): byte0x16 * byte0x17 + word0x14.
  const quantity = ((b[0x16] ?? 0) * (b[0x17] ?? 0) + ((b[0x14] ?? 0) | ((b[0x15] ?? 0) << 8))) & 0xff;
  return {
    itemId,
    weight: item.weight & 0xff,
    equipSlot: item.equipSlot & 0xff,
    spriteIdx: (b[0x3d] ?? 0) & 0xff,
    quantity,
    flags,
  };
}

/**
 * The 22-slot starting inventory for a class: the 5 kit items (carried,
 * packed in slots 0..4) + empty slots. Items are NOT equipped.
 */
export function buildStartingInventory(classIdx: number, scenarioDb: ScenarioDb): InventoryItem[] {
  const kit = STARTING_KITS[classIdx] ?? [];
  const inv = kit.map((id) => kitSlot(scenarioDb, id));
  while (inv.length < INVENTORY_SLOTS) inv.push(emptySlot());
  return inv;
}

/** Carried weight (record +0x20): sum(weight × max(quantity,1)) over occupied
 *  slots — the engine's give_one_item encumbrance accumulator. */
export function startingEncumbrance(inventory: ReadonlyArray<InventoryItem>): number {
  return inventory.reduce(
    (sum, it) => (it.itemId > 0 ? sum + it.weight * Math.max(it.quantity, 1) : sum),
    0,
  );
}
