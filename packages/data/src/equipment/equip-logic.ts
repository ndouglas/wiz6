/**
 * WPCVW EQUIP logic — engine-faithful re-equip computations, pure (no I/O/DOM).
 * RE: docs/re/findings/wpcvw-equip-action.json + wpcvw-equip-internals.json.
 * Body slots: 0=weapon,1=off-hand/shield,2=cloak,3=head,4=chest,5=legs,6=hands,7=feet.
 * AC is lower=better.
 */
import type { Character, InventoryItem } from '../schemas/character.js';
import type { ScenarioDb } from '../schemas/scenario-db.js';

/** A blank inventory slot (itemId 0). Used to pad the carried region after a
 *  reorder so the inventory keeps its fixed 22-slot length. */
function emptyInventorySlot(): InventoryItem {
  return { itemId: 0, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 };
}

export const BODY_SLOT_COUNT = 8;
// Only the carried region (inventory slots 0..9) is equippable; slots 10..21 are
// the SWAG BAG (see character-view/swag-bag.ts). Bound candidate scans here so
// bagged items never appear as equip candidates.
const CARRIED_SLOT_COUNT = 10;
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
      // Off-hand is disqualified if the equipped main weapon is two-handed: either
      // the explicit flag 0x08, OR a pole weapon (equipSlot 3) whose sprite/type
      // byte (+0x442d = inventory `spriteIdx`, cached scenario byte 61) is in the
      // "occupies both hands" set. RE: wpcvw-equip-action.json#equip-two-handed-and-shield-exclusivity.
      if (
        w &&
        (((w.flags & ITEM_FLAG_TWO_HANDED) !== 0) ||
          (w.equipSlot === 3 && TWO_HAND_WEAPON_TYPES.has(w.spriteIdx)))
      )
        return [];
    }
  }
  const out: number[] = [];
  const carried = Math.min(inv.length, CARRIED_SLOT_COUNT);
  for (let i = 0; i < carried; i++) {
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
    // The engine stores each bodyAc slot as a u8 and applies `*(+0x4548+slot)
    // -= byte0x46` (a raw byte decrement). When the running value underflows
    // past 0 it WRAPS mod 256 (e.g. the magical/shield slot starts at 0, so a
    // +1-protection buckler yields 0xFF, not -1). Mask to u8 to match the
    // engine's byte arithmetic — and to keep the value in the schema's 0..255
    // range so it round-trips through ActivePartyMemberSchema.
    bodyAc[acIdx] = ((bodyAc[acIdx] ?? base) - acBonus) & 0xff;
  }
  return { derivedAc: base, bodyAc };
}

/** Attribute keys in code-order (Phase-3 grant codes 1..8 → index code−1). */
const ATTRIBUTE_KEYS = ['str', 'int', 'pie', 'vit', 'dex', 'spd', 'per', 'kar'] as const;
const ATTRIBUTE_CAP = 0x14;

/**
 * Phase-3 special equip-granted bumps, keyed on the grant code at item record
 * byte 0x44. Applied per selected (equipped) inventory item.
 *
 * MEDIUM-confidence, unexercised by stock gear (stock fighter gear has grant
 * code 0 = no-op) — see wpcvw-equip-internals.json#phase3-special-grant-table;
 * flagged for live verification.
 *
 * Codes:
 *   1..8  → bump attributes[code−1] (STR..KAR), capped at 0x14.
 *   9     → raise a resist/save floor to 4 (engine +0x4591). No schema field; no-op here.
 *   10    → raise a resist/save floor to 4 (engine +0x4592). No schema field; no-op here.
 *   11    → CURE/CLEANSE: clear all conditions (10-byte condition array) + clear dead/paralyzed.
 *   12    → XP/value adjustment: subtract 365 from xp (clamped ≥ 0).
 *   13    → permanent HP boost rng(d6) [0..5] + 2 → +2..7 to hpMax and hpCurrent.
 *           Requires `rng` (returns 0..5); a no-op when rng is absent.
 */
export function applyPhase3Grants(
  member: Character,
  selections: ReadonlyArray<number | null>,
  scenarioDb: ScenarioDb,
  rng?: () => number,
): void {
  const inv = member.inventory ?? [];
  for (const invIdx of selections) {
    if (invIdx == null) continue;
    const it = inv[invIdx];
    if (!it || it.itemId <= 0) continue;
    const code = scenarioDb.items[it.itemId]?.bytes[0x44] ?? 0;
    if (code <= 0) continue;
    if (code <= 8) {
      const key = ATTRIBUTE_KEYS[code - 1];
      if (key) member.attributes[key] = Math.min((member.attributes[key] ?? 0) + 1, ATTRIBUTE_CAP);
      continue;
    }
    switch (code) {
      case 9: // resist/save floor (+0x4591) — no schema field; no-op.
      case 10: // resist/save floor (+0x4592) — no schema field; no-op.
        break;
      case 11: // CURE/CLEANSE-ALL: clear all conditions.
        if (member.conditions) member.conditions = member.conditions.map(() => 0);
        member.dead = false;
        member.paralyzed = false;
        break;
      case 12: // XP/value adjustment: subtract 365.
        if (member.xp != null) member.xp = Math.max(member.xp - 365, 0);
        break;
      case 13: // permanent HP boost: rng(d6)[0..5] + 2.
        if (rng) {
          const boost = rng() + 2;
          if (member.hpMax != null) member.hpMax += boost;
          if (member.hpCurrent != null) member.hpCurrent += boost;
        }
        break;
      default:
        break;
    }
  }
}

/**
 * Full re-equip commit: Phase-1 reset, apply per-slot selections, recompute AC,
 * apply Phase-3 grants. Immutable — returns a clone, never mutates `member`.
 * RE: wpcvw-equip-action.json #equip-write-mutation +
 * #equip-screen-is-reequip-wizard; wpcvw-equip-internals.json
 * #bit0-equipped-vs-cursed-overload-and-persistence + #phase3-special-grant-table.
 *
 * Phase-1: equipment ← [0xff × 8]; every inventory item `flags &= 0xfe`
 *          (clear bit0 = equipped/cursed-low; PRESERVE bit1 0x02 = genuine curse).
 * Phase-3: applyPhase3Grants (see helper; MEDIUM-confidence, unexercised by stock gear).
 * Reorder: the carried region (slots 0..9) is PHYSICALLY reordered — equipped
 *          items to the front in body-slot order, then remaining carried items;
 *          equipment[bodySlot] points to the item's NEW front index, that item
 *          `flags |= 0x01`. SWAG bag (slots 10..21) untouched. RE:
 *          wpcvw-post-equip-view.json #equip-physically-reorders-carried-inventory.
 * AC:      recompute via computeAc → derivedAc + bodyAc (on the reordered record).
 */
export function applyEquipSelections(
  member: Character,
  selections: ReadonlyArray<number | null>,
  scenarioDb: ScenarioDb,
  rng?: () => number,
): Character {
  const m: Character = structuredClone(member);
  const origInv = m.inventory ?? [];
  for (const it of origInv) it.flags &= 0xfe; // Phase-1: clear bit0, keep bit1.

  // Phase-3 grants reference the OLD inventory indices in `selections`, and they
  // mutate attributes/conditions/hp (never inventory order) — apply them before
  // the reorder below, while `selections` still indexes `origInv`.
  applyPhase3Grants(m, selections, scenarioDb, rng);

  // The engine PHYSICALLY REORDERS the carried region (slots 0..9): equipped
  // items move to the FRONT in body-slot order, then the remaining carried items
  // follow; equipment[bodySlot] points to the item's NEW front index. The SWAG
  // bag (slots 10..21) is untouched. RE: wpcvw-post-equip-view.json
  // #equip-physically-reorders-carried-inventory.
  const equipment: number[] = Array(BODY_SLOT_COUNT).fill(0xff);
  const newCarried: InventoryItem[] = [];
  const used = new Set<number>();
  for (let bodySlot = 0; bodySlot < BODY_SLOT_COUNT; bodySlot++) {
    const invIdx = selections[bodySlot];
    if (invIdx == null) continue;
    const it = origInv[invIdx];
    if (!it || it.itemId <= 0) continue;
    it.flags |= 0x01; // equipped bit.
    equipment[bodySlot] = newCarried.length;
    newCarried.push(it);
    used.add(invIdx);
  }
  for (let i = 0; i < CARRIED_SLOT_COUNT; i++) {
    if (used.has(i)) continue;
    const it = origInv[i];
    if (it && it.itemId > 0) newCarried.push(it);
  }
  while (newCarried.length < CARRIED_SLOT_COUNT) newCarried.push(emptyInventorySlot());
  m.inventory = [...newCarried.slice(0, CARRIED_SLOT_COUNT), ...origInv.slice(CARRIED_SLOT_COUNT)];
  m.equipment = equipment;

  const ac = computeAc(m, scenarioDb);
  m.derivedAc = ac.derivedAc;
  m.bodyAc = ac.bodyAc;
  return m;
}
