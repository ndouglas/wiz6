/**
 * WPCVW EQUIP logic — engine-faithful re-equip computations, pure (no I/O/DOM).
 * RE: docs/re/findings/wpcvw-equip-action.json + wpcvw-equip-internals.json.
 * Body slots: 0=weapon,1=off-hand/shield,2=cloak,3=head,4=chest,5=legs,6=hands,7=feet.
 * AC is lower=better.
 */
import type { Character } from '../schemas/character.js';

export const BODY_SLOT_COUNT = 8;
const ITEM_FLAG_DUAL_WIELD = 0x04;

export function bitTest(mask: ReadonlyArray<number>, value: number): boolean {
  return ((mask[value >> 3] ?? 0) & (1 << (value & 7))) !== 0;
}

export function bodySlotForItem(equipSlot: number, fillingSlot: number, flags: number): number | null {
  const dual = (flags & ITEM_FLAG_DUAL_WIELD) !== 0;
  if ([0, 1, 2, 3, 0xc, 0x10].includes(equipSlot)) {
    if (fillingSlot === 1) return dual ? 1 : null;
    return 0;
  }
  switch (equipSlot) {
    case 4: return 1;
    case 5: return 2;
    case 6: return 3;
    case 7: return 4;
    case 8: return 5;
    case 9: return 6;
    case 0xa: return 7;
    case 0xb: return 1;
    case 0xd: case 0xe: case 0xf: return dual ? 1 : null;
    default: return null;
  }
}

export function itemEligible(
  member: Pick<Character, 'class' | 'race' | 'sex'>,
  itemBytes: ReadonlyArray<number>,
): boolean {
  const classMask = [itemBytes[54] ?? 0, itemBytes[55] ?? 0];
  const raceMask = [itemBytes[56] ?? 0, itemBytes[57] ?? 0];
  const sexMask = [itemBytes[58] ?? 0, itemBytes[59] ?? 0];
  return bitTest(classMask, member.class) && bitTest(raceMask, member.race) && bitTest(sexMask, member.sex);
}
