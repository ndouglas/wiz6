/**
 * WPCVW camp SWAG action — the per-character "SWAG BAG" manager (pure, no I/O).
 * RE: docs/re/findings/wpcvw-swag-action.json.
 *
 * The bag is NOT a party pool: it's the upper 12 slots of the same 22-slot
 * `inventory` array. Carried inventory = slots 0..9 (cap 10); SWAG BAG = slots
 * 10..21 (cap 12). Each region is a packed list (items first, empties after);
 * the engine tracks counts at +0x4594 (carried) / +0x4595 (bag), which we derive
 * from the packed regions rather than store.
 *
 * Actions (engine-faithful):
 *   - ADD: move a non-equipped CARRIED item → bag (append), compacting carried
 *     (and fixing up equipment indices — the DROP/unequip core @ 0x17f7).
 *   - REMOVE: move a BAG item → carried (append), compacting the bag.
 *   - DROP: destroy a non-class-locked BAG item, compacting the bag.
 * Equipped items can't be ADDed; class-locked items can't be DROPped (the caller
 * beeps and no-ops — see `swagItemAddable` / `swagItemDroppable`).
 */
import type { Character, InventoryItem } from '../schemas/character.js';

export const CARRIED_CAP = 10; // slots 0..9
export const BAG_CAP = 12;     // slots 10..21
export const BAG_BASE = 10;    // bag region starts at array index 10
export const INVENTORY_SIZE = CARRIED_CAP + BAG_CAP; // 22

const FLAG_EQUIPPED = 0x01;     // bit0 — equipped (ADD refuses)
const FLAG_CLASS_LOCKED = 0x40; // bit6 — class-locked (DROP refuses)
const EMPTY_EQUIP = 0xff;

function emptySlot(): InventoryItem {
  return { itemId: 0, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 };
}

function inv(member: Pick<Character, 'inventory'>): InventoryItem[] {
  const a = (member.inventory ?? []).slice();
  while (a.length < INVENTORY_SIZE) a.push(emptySlot());
  return a;
}

/** An item present in a region, with its picker index. */
export interface SlotRef {
  /** Carried: array index 0..9. Bag: bag-relative 0..11 (array index = 10+idx). */
  idx: number;
  item: InventoryItem;
}

/** Number of carried items (packed slots 0..9 with itemId > 0). */
export function carriedCount(member: Pick<Character, 'inventory'>): number {
  const a = inv(member);
  let n = 0;
  for (let i = 0; i < CARRIED_CAP; i++) if ((a[i]?.itemId ?? 0) > 0) n++;
  return n;
}

/** Number of bag items (packed slots 10..21 with itemId > 0). */
export function bagCount(member: Pick<Character, 'inventory'>): number {
  const a = inv(member);
  let n = 0;
  for (let i = 0; i < BAG_CAP; i++) if ((a[BAG_BASE + i]?.itemId ?? 0) > 0) n++;
  return n;
}

/** Carried items in slot order: `idx` is the array index (0..9). */
export function carriedItems(member: Pick<Character, 'inventory'>): SlotRef[] {
  const a = inv(member);
  const out: SlotRef[] = [];
  for (let i = 0; i < CARRIED_CAP; i++) {
    const item = a[i]!;
    if (item.itemId > 0) out.push({ idx: i, item });
  }
  return out;
}

/** Bag items in slot order: `idx` is bag-relative (0..11; array = 10+idx). */
export function bagItems(member: Pick<Character, 'inventory'>): SlotRef[] {
  const a = inv(member);
  const out: SlotRef[] = [];
  for (let i = 0; i < BAG_CAP; i++) {
    const item = a[BAG_BASE + i]!;
    if (item.itemId > 0) out.push({ idx: i, item });
  }
  return out;
}

/** An item can be ADDed to the bag iff it is not currently equipped (bit0). */
export function swagItemAddable(item: InventoryItem): boolean {
  return (item.flags & FLAG_EQUIPPED) === 0;
}

/** A bag item can be DROPped (destroyed) iff it is not class-locked (bit6). */
export function swagItemDroppable(item: InventoryItem): boolean {
  return (item.flags & FLAG_CLASS_LOCKED) === 0;
}

/** ADD enabled iff bag has room AND there is something carried to add. */
export function canSwagAdd(member: Pick<Character, 'inventory'>): boolean {
  return bagCount(member) < BAG_CAP && carriedCount(member) > 0;
}

/** REMOVE enabled iff the bag is non-empty AND carried has room. */
export function canSwagRemove(member: Pick<Character, 'inventory'>): boolean {
  return bagCount(member) > 0 && carriedCount(member) < CARRIED_CAP;
}

/** DROP enabled iff the bag is non-empty. */
export function canSwagDrop(member: Pick<Character, 'inventory'>): boolean {
  return bagCount(member) > 0;
}

/** Remove carried slot `carriedIdx` (0..9), compacting the carried region and
 *  fixing up equipment indices that pointed past it (the 0x17f7 carried core). */
function compactCarried(a: InventoryItem[], equipment: number[], carriedIdx: number): void {
  for (let i = carriedIdx; i < CARRIED_CAP - 1; i++) a[i] = a[i + 1]!;
  a[CARRIED_CAP - 1] = emptySlot();
  for (let s = 0; s < equipment.length; s++) {
    const e = equipment[s]!;
    if (e === EMPTY_EQUIP) continue;
    if (e === carriedIdx) equipment[s] = EMPTY_EQUIP;
    else if (e > carriedIdx && e < CARRIED_CAP) equipment[s] = e - 1;
  }
}

/** Remove bag slot `bagIdx` (bag-relative 0..11), compacting the bag region. */
function compactBag(a: InventoryItem[], bagIdx: number): void {
  for (let i = bagIdx; i < BAG_CAP - 1; i++) a[BAG_BASE + i] = a[BAG_BASE + i + 1]!;
  a[BAG_BASE + BAG_CAP - 1] = emptySlot();
}

function cloneEquipment(member: Pick<Character, 'equipment'>): number[] {
  const e = (member.equipment ?? []).slice();
  while (e.length < 8) e.push(EMPTY_EQUIP);
  return e;
}

/**
 * ADD: move the carried item at array index `carriedIdx` into the bag (append),
 * then compact the carried region + fix up equipment indices. Caller must ensure
 * the item is addable (`swagItemAddable`) and `canSwagAdd`. Immutable.
 */
export function swagAdd(member: Character, carriedIdx: number): Character {
  const m = structuredClone(member);
  const a = inv(m);
  const equipment = cloneEquipment(m);
  const item = a[carriedIdx];
  if (!item || item.itemId <= 0) return member; // nothing to move
  const bagInsert = BAG_BASE + bagCount(m);
  a[bagInsert] = { ...item };
  compactCarried(a, equipment, carriedIdx);
  m.inventory = a;
  m.equipment = equipment;
  return m;
}

/**
 * REMOVE: move the bag item at bag-relative `bagIdx` back into carried (append),
 * then compact the bag. Caller must ensure `canSwagRemove`. Immutable.
 */
export function swagRemove(member: Character, bagIdx: number): Character {
  const m = structuredClone(member);
  const a = inv(m);
  const bagArrayIdx = BAG_BASE + bagIdx;
  const item = a[bagArrayIdx];
  if (!item || item.itemId <= 0) return member;
  const carriedInsert = carriedCount(m);
  a[carriedInsert] = { ...item };
  compactBag(a, bagIdx);
  m.inventory = a;
  return m;
}

/**
 * DROP: permanently destroy the bag item at bag-relative `bagIdx`, compacting
 * the bag. Caller must ensure the item is droppable (`swagItemDroppable`).
 * Immutable.
 */
export function swagDrop(member: Character, bagIdx: number): Character {
  const m = structuredClone(member);
  const a = inv(m);
  const item = a[BAG_BASE + bagIdx];
  if (!item || item.itemId <= 0) return member;
  compactBag(a, bagIdx);
  m.inventory = a;
  return m;
}
