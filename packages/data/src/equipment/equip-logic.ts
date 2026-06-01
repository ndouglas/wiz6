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

export interface AcResult {
  derivedAc: number;
  bodyAc: number[];
}

/**
 * Base AC (the +0x4548 byte) before any equipped items are applied.
 * RE: wpcvw-equip-internals.json #fun884f-base-ac-formula-and-sign. Lower = better.
 * Base 10; −1 if SPD≥16; −1 more if SPD≥18; −2 if race==5; monk/ninja (class 0xc/0xd)
 * −(min(floor(level/2),20) + floor(skill/10)).
 */
export function computeBaseAc(member: Character): number {
  let ac = 10;
  const spd = member.attributes.spd;
  if (spd >= 16) ac -= 1;
  if (spd >= 18) ac -= 1;
  if (member.race === 5) ac -= 2;
  if (member.class === 0xc || member.class === 0xd) {
    const lvl = Math.min(Math.floor(member.level / 2), 20);
    // martial-arts skill index UNVERIFIED (fighter THESUS never hits this branch).
    const skill = Math.floor((member.skills[0] ?? 0) / 10);
    ac -= lvl + skill;
  }
  return ac;
}

/**
 * Engine-faithful AC recompute (FUN_884f base + per-item byte-0x46 subtraction).
 * RE: wpcvw-equip-internals.json #fun884f-base-ac-formula-and-sign +
 * #per-item-record-field-offsets; wpcvw-equip-action.json #equip-ac-and-weapon-recompute.
 *
 * Engine AC array lives at +0x4548 (8 bytes). The base recompute writes
 * `*(+0x4548)=base`, zeroes +0x4549/+0x454a, and broadcasts `for s in 3..7:
 * *(+0x4548+s)=base`. We surface this as the schema's split fields:
 *   - derivedAc = +0x4548 (record +0x160)
 *   - bodyAc[0..6] = +0x4549..+0x454f (record +0x161..+0x167)
 * so the unequipped base array is `[0,0,base,base,base,base,base]`.
 *
 * Per equipped item the AC bonus (scenario item byte 0x46) is SUBTRACTED:
 *   - weapons (body 0/1): `*(+0x4549) -= byte0x46` → bodyAc[0]
 *   - armor   (body 2..7): `*(+0x4548 + bodySlot) -= byte0x46` → bodyAc[bodySlot-1]
 */
export function computeAc(member: Character, scenarioDb: ScenarioDb): AcResult {
  const base = computeBaseAc(member);
  const bodyAc = [0, 0, base, base, base, base, base];
  const equip = member.equipment ?? [];
  const inv = member.inventory ?? [];
  for (let bodySlot = 0; bodySlot < BODY_SLOT_COUNT; bodySlot++) {
    const invIdx = equip[bodySlot];
    if (invIdx === undefined || invIdx === 0xff) continue;
    const item = inv[invIdx];
    if (!item || item.itemId <= 0) continue;
    const acBonus = scenarioDb.items[item.itemId]?.bytes[0x46] ?? 0;
    // weapons (body0/1) → bodyAc[0]; armor (body2..7) → bodyAc[bodySlot-1].
    const acIdx = bodySlot <= 1 ? 0 : bodySlot - 1;
    bodyAc[acIdx] = (bodyAc[acIdx] ?? base) - acBonus;
  }
  return { derivedAc: base, bodyAc };
}
