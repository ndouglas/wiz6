import { describe, expect, it } from 'vitest';
import {
  CARRIED_CAP,
  BAG_CAP,
  BAG_BASE,
  carriedCount,
  bagCount,
  carriedItems,
  bagItems,
  swagItemAddable,
  swagItemDroppable,
  canSwagAdd,
  canSwagRemove,
  canSwagDrop,
  swagAdd,
  swagRemove,
  swagDrop,
} from '../../src/character-view/swag-bag.js';
import type { Character, InventoryItem } from '../../src/schemas/character.js';

function slot(itemId: number, flags = 0): InventoryItem {
  return { itemId, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags };
}
const EMPTY = slot(0);

/** Build a 22-slot inventory from carried + bag item-id lists (packed). */
function makeMember(carried: InventoryItem[], bag: InventoryItem[] = [], equipment?: number[]): Character {
  const inventory: InventoryItem[] = [];
  for (let i = 0; i < CARRIED_CAP; i++) inventory.push(carried[i] ?? { ...EMPTY });
  for (let i = 0; i < BAG_CAP; i++) inventory.push(bag[i] ?? { ...EMPTY });
  return {
    name: 'T', race: 0, class: 0, sex: 0, level: 1, xp: 0, gold: 0,
    attributes: { str: 10, int: 10, pie: 10, vit: 10, dex: 10, spd: 10, per: 10, kar: 10 },
    skills: new Array(30).fill(0),
    inventory,
    ...(equipment ? { equipment } : {}),
  } as unknown as Character;
}

describe('SWAG counts + lists', () => {
  it('derives carried/bag counts from the packed regions', () => {
    const m = makeMember([slot(8), slot(135), slot(132)], [slot(50)]);
    expect(carriedCount(m)).toBe(3);
    expect(bagCount(m)).toBe(1);
  });

  it('carriedItems / bagItems return the right indices', () => {
    const m = makeMember([slot(8), slot(135)], [slot(50), slot(51)]);
    expect(carriedItems(m).map((s) => s.idx)).toEqual([0, 1]);
    expect(carriedItems(m).map((s) => s.item.itemId)).toEqual([8, 135]);
    expect(bagItems(m).map((s) => s.idx)).toEqual([0, 1]); // bag-relative
    expect(bagItems(m).map((s) => s.item.itemId)).toEqual([50, 51]);
  });
});

describe('SWAG guards + gating', () => {
  it('addable = not equipped (bit0); droppable = not class-locked (bit6)', () => {
    expect(swagItemAddable(slot(8, 0x00))).toBe(true);
    expect(swagItemAddable(slot(8, 0x01))).toBe(false); // equipped
    expect(swagItemDroppable(slot(8, 0x00))).toBe(true);
    expect(swagItemDroppable(slot(8, 0x40))).toBe(false); // class-locked
    expect(swagItemDroppable(slot(8, 0x02))).toBe(true); // cursed-but-not-locked CAN be dropped from bag
  });

  it('ADD off when bag full or carried empty', () => {
    expect(canSwagAdd(makeMember([slot(8)], []))).toBe(true);
    expect(canSwagAdd(makeMember([], [slot(50)]))).toBe(false); // nothing carried
    const fullBag = Array.from({ length: BAG_CAP }, (_, i) => slot(50 + i));
    expect(canSwagAdd(makeMember([slot(8)], fullBag))).toBe(false); // bag full
  });

  it('REMOVE off when bag empty or carried full', () => {
    expect(canSwagRemove(makeMember([slot(8)], [slot(50)]))).toBe(true);
    expect(canSwagRemove(makeMember([slot(8)], []))).toBe(false); // bag empty
    const fullCarried = Array.from({ length: CARRIED_CAP }, (_, i) => slot(8 + i));
    expect(canSwagRemove(makeMember(fullCarried, [slot(50)]))).toBe(false); // carried full
  });

  it('DROP off when bag empty', () => {
    expect(canSwagDrop(makeMember([slot(8)], [slot(50)]))).toBe(true);
    expect(canSwagDrop(makeMember([slot(8)], []))).toBe(false);
  });
});

describe('swagAdd', () => {
  it('moves a carried item to the bag and compacts carried', () => {
    const m = makeMember([slot(8), slot(135), slot(132)], [slot(50)]);
    const next = swagAdd(m, 1); // move item 135 (carried idx 1)
    expect(carriedItems(next).map((s) => s.item.itemId)).toEqual([8, 132]); // 135 gone, compacted
    expect(bagItems(next).map((s) => s.item.itemId)).toEqual([50, 135]); // appended
    expect(carriedCount(next)).toBe(2);
    expect(bagCount(next)).toBe(2);
  });

  it('fixes up equipment indices past the removed carried slot', () => {
    // carried [8,135,132]; equipment body0 → idx2 (item 132). Remove idx0 (item 8).
    const m = makeMember([slot(8), slot(135), slot(132)], [], [2, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    const next = swagAdd(m, 0);
    // item 132 shifted from idx2 → idx1; equipment[0] must follow to 1.
    expect(next.equipment![0]).toBe(1);
    expect(carriedItems(next).map((s) => s.item.itemId)).toEqual([135, 132]);
  });

  it('is immutable (original member unchanged)', () => {
    const m = makeMember([slot(8), slot(135)], []);
    swagAdd(m, 0);
    expect(carriedCount(m)).toBe(2);
    expect(bagCount(m)).toBe(0);
  });
});

describe('swagRemove', () => {
  it('moves a bag item back to carried (append) and compacts the bag', () => {
    const m = makeMember([slot(8)], [slot(50), slot(51)]);
    const next = swagRemove(m, 0); // remove bag idx 0 (item 50)
    expect(carriedItems(next).map((s) => s.item.itemId)).toEqual([8, 50]); // appended
    expect(bagItems(next).map((s) => s.item.itemId)).toEqual([51]); // compacted
    expect(carriedCount(next)).toBe(2);
    expect(bagCount(next)).toBe(1);
  });
});

describe('swagDrop', () => {
  it('destroys a bag item and compacts the bag (no carried copy)', () => {
    const m = makeMember([slot(8)], [slot(50), slot(51), slot(52)]);
    const next = swagDrop(m, 1); // drop bag idx 1 (item 51)
    expect(bagItems(next).map((s) => s.item.itemId)).toEqual([50, 52]); // 51 destroyed
    expect(carriedItems(next).map((s) => s.item.itemId)).toEqual([8]); // carried unchanged
    expect(bagCount(next)).toBe(2);
  });

  it('placing item 21 (last bag slot) stays in range after a full-bag add', () => {
    // 11 bag items + 1 carried → ADD fills bag slot 21; bag count 12 (full).
    const bag11 = Array.from({ length: 11 }, (_, i) => slot(50 + i));
    const m = makeMember([slot(8)], bag11);
    const next = swagAdd(m, 0);
    expect(bagCount(next)).toBe(BAG_CAP); // 12
    expect(next.inventory![BAG_BASE + BAG_CAP - 1]!.itemId).toBe(8); // landed in slot 21
  });
});
