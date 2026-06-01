/**
 * WPCVW EQUIP logic — engine-faithful re-equip computations, pure (no I/O/DOM).
 * RE: docs/re/findings/wpcvw-equip-action.json + wpcvw-equip-internals.json.
 * Body slots: 0=weapon,1=off-hand/shield,2=cloak,3=head,4=chest,5=legs,6=hands,7=feet.
 * AC is lower=better.
 */
import type { Character } from '../schemas/character.js';
import type { ScenarioDb } from '../schemas/scenario-db.js';

export const BODY_SLOT_COUNT = 8;
const ITEM_FLAG_DUAL_WIELD = 0x04;
const ITEM_FLAG_TWO_HANDED = 0x08;
const TWO_HAND_WEAPON_TYPES = new Set([0xb, 0x16, 0xd, 0x17, 0xc, 0x53]);

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

/**
 * Collect inventory indices eligible to fill `bodySlot`, minus already-selected
 * indices, applying 2H-weapon/shield exclusivity. RE: wpcvw-equip-action.json
 * #equip-candidate-collector (wpcvw 0x835e) + #equip-two-handed-and-shield-exclusivity.
 *
 * When filling the off-hand (bodySlot 1): if the weapon already chosen for slot 0
 * is two-handed (flag 0x08 set, or its item-record type byte 0x2d is a 2H weapon
 * type), no off-hand item is offered.
 */
export function equipCandidates(
  member: Character,
  bodySlot: number,
  scenarioDb: ScenarioDb,
  priorSelections: ReadonlyArray<number | null>,
): number[] {
  const inv = member.inventory ?? [];
  const selected = new Set(priorSelections.filter((x): x is number => x != null));
  if (bodySlot === 1) {
    const weaponIdx = priorSelections[0];
    if (weaponIdx != null) {
      const w = inv[weaponIdx];
      const wBytes = w ? (scenarioDb.items[w.itemId]?.bytes ?? []) : [];
      if (
        w &&
        (((w.flags & ITEM_FLAG_TWO_HANDED) !== 0) || TWO_HAND_WEAPON_TYPES.has(wBytes[0x2d] ?? -1))
      )
        return [];
    }
  }
  const out: number[] = [];
  for (let i = 0; i < inv.length; i++) {
    const slot = inv[i]!;
    if (slot.itemId <= 0 || selected.has(i)) continue;
    if (bodySlotForItem(slot.equipSlot, bodySlot, slot.flags) !== bodySlot) continue;
    const bytes = scenarioDb.items[slot.itemId]?.bytes ?? [];
    if (!itemEligible(member, bytes)) continue;
    out.push(i);
  }
  return out;
}
