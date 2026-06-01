/**
 * WPCVW ASSAY logic — the read-only item-inspect descriptor, pure (no I/O/DOM).
 *
 * ASSAY (character-view main-menu option 3, state 0x11) is a READ-ONLY popup that
 * dumps an item's full stat block. NO identify mechanic, NO RNG, NO mutation —
 * the engine loads the canonical scenario record (always carries name1) and prints
 * a category-driven set of labeled stat lines. RE:
 * docs/re/findings/wpcvw-assay-action.json (display fn wpcvw 0x7160).
 *
 * `assayItem` returns a descriptor of exactly the fields the engine's ASSAY popup
 * renders so the composer (Task 5) can pixel-match the fixture
 * (tools/parity/fixtures/engine/assay-longsword.png).
 *
 * Label text: the low-index msg-ids (0x1c3.. category/field labels, 0x60e..
 * category table, 0x157c.. weapon-skill table, 0xbea.. attack modes) are
 * hardcoded here to match the fixture rather than threading the message DB
 * through this pure module — same convention the EQUIP composer follows.
 */
import type { Character } from '../schemas/character.js';
import type { ScenarioDb } from '../schemas/scenario-db.js';
import { itemEligible } from './equip-logic.js';

// Record-byte offsets (verified against the 74-byte scenario item record).
const OFF_WEIGHT = 0x1e; // weight in TENTHS of a pound (byte 50 → 5.0). HIGH.
const OFF_RESIST_FIRST = 0x1f; // resistance/save pairs 0x1f..0x2a (6 averaged pairs).
const OFF_WEAPON_TYPE = 0x3d; // weapon-skill index → 0x157c-base table. HIGH (LONGSWORD=1→SWORD).
const OFF_CATEGORY = 0x3c; // inspect-category enum → 0x60e-base table. HIGH.
const OFF_CURSE = 0x3f; // curse byte (display fn [bp-0x11] = 0x50-0x11). MEDIUM.
const OFF_AC = 0x46; // AC bonus (shared with EQUIP). HIGH.

// Item flags (from InventoryItemSchema / equip-logic).
const ITEM_FLAG_TWO_HANDED = 0x08;

/**
 * Category labels indexed by record byte 0x3c (msg table 0x60e..0x61e). HIGH.
 * The first four (S/E/T/L) are the four weapon families; 4=missile/ammunition;
 * 5..11 the equip-slot armor families; 12+ magical/special.
 */
const CATEGORY_LABELS = [
  'WEAPON (S)', // 0
  'WEAPON (E)', // 1
  'WEAPON (T)', // 2
  'WEAPON (L)', // 3
  'MISSILE', // 4
  'MISC. ITEM', // 5
  'HELMET', // 6
  'BODY ARMOR', // 7
  'LEG ARMOR', // 8
  'GAUNTLETS', // 9
  'BOOTS', // 10
  'SHIELD', // 11
  'MAGICAL', // 12
  'MAGICAL', // 13
  'SPECIAL', // 14
  'SPECIAL', // 15
  'MAGICAL', // 16
] as const;

/** Categories 0..4 are weapons/missiles — they show weaponType + attackModes. */
const WEAPON_CATEGORIES = new Set([0, 1, 2, 3, 4]);

/**
 * Weapon-skill table — msg 0x157c base. The weapon-type line is
 * `WEAPON_SKILL_TABLE[byte 0x3d]`. HIGH for the low indices (LONGSWORD 0x3d=1 →
 * "SWORD"); some exotic weapons carry larger 0x3d values whose mapping is not
 * yet pinned — those fall through to undefined (flagged for the pixel gate).
 */
const WEAPON_SKILL_TABLE = [
  'WAND&DAGGER', // 0 (0x157c)
  'SWORD', // 1
  'AXE', // 2
  'MACE&FLAIL', // 3
  'POLE&STAFF', // 4
  'THROWING', // 5
  'SLING', // 6
  'BOWS', // 7
] as const;

/**
 * Attack-mode sets per weapon CATEGORY (record byte 0x3c). The exact engine
 * source for the SWING/THRUST lines is not pinned to a single record byte
 * (bytes 0x2e..0x35 are all zero for stock weapons); the modes track the
 * weapon FAMILY. MEDIUM confidence — derived to match the LONGSWORD fixture
 * ("SWING"/"THRUST" for category 0); the pixel gate (Task 5/7) will confirm
 * the other families.
 */
const ATTACK_MODES_BY_CATEGORY: Record<number, string[]> = {
  0: ['SWING', 'THRUST'], // WEAPON (S) — swords. CONFIRMED by fixture.
  1: ['SWING', 'THRUST'], // WEAPON (E) — extended/pole. MEDIUM.
  2: ['THROW'], // WEAPON (T) — thrown. MEDIUM.
  3: ['SHOOT'], // WEAPON (L) — launched/bows. MEDIUM.
  4: ['SHOOT'], // MISSILE — ammunition. MEDIUM.
};

/**
 * Equip-slot labels (msg 0x1c9..0x1d0). Maps the item's `equipSlot` byte (record
 * byte 60) to the displayed slot label. Weapons (equipSlot 0..4) show 1HAND
 * (or 2HAND when the two-handed flag is set); armor maps to its body label.
 * LONGSWORD equipSlot=0, not two-handed → "1HAND" (HIGH).
 */
function equipSlotLabel(equipSlot: number, twoHanded: boolean): string | undefined {
  // Weapon / missile slots → 1HAND or 2HAND.
  if ([0, 1, 2, 3, 4, 0xc, 0xd, 0xe, 0xf, 0x10].includes(equipSlot)) {
    return twoHanded ? '2HAND' : '1HAND';
  }
  switch (equipSlot) {
    case 5:
      return 'BODY'; // cloak — shares the BODY label.
    case 6:
      return 'HEAD';
    case 7:
      return 'BODY';
    case 8:
      return 'LEGS';
    case 9:
      return 'HANDS';
    case 0xa:
      return 'FEET';
    case 0xb:
      return '1HAND'; // shield → off-hand.
    default:
      return undefined; // non-equippable (scrolls/keys/consumables).
  }
}

/** The two packed resistance/save header strings the engine renders literally. */
const RESISTANCE_HEADER_ROW1 = 'HEDGHFLDFRM MF'; // msg 0x1c6 + 0x1c7.
const RESISTANCE_HEADER_ROW2 = 'FMPTRABPVBLSMN'; // msg 0x1c8.

export interface AssayDescriptor {
  /** Item name1 — the canonical/identified scenario name (record bytes 0..15). */
  name: string;
  /** Category header label (record byte 0x3c → CATEGORY_LABELS). */
  categoryLabel: string;
  /** Weapon-skill type, e.g. "SWORD" (weapons/missiles only; record byte 0x3d). */
  weaponType?: string | undefined;
  /** Attack modes, e.g. ["SWING","THRUST"] (weapons/missiles only). */
  attackModes?: string[] | undefined;
  /** Equip-slot label, e.g. "1HAND" (equippable items only; record byte 60). */
  equipSlotLabel?: string | undefined;
  /** Weight in pounds (record byte 0x1e / 10 → tenths; LONGSWORD 50 → 5.0). */
  weight: number;
  /** AC bonus (record byte 0x46). Surfaced for every item the engine reads it. */
  ac: number;
  /** The two packed resistance/save header strings (render literally). */
  resistanceHeaders: [string, string];
  /** Six resistance/save values = averaged consecutive pairs of bytes 0x1f..0x2a, capped 99. */
  resistances: number[];
  /** Whether this item is CURSED (record byte 0x3f != 0). Engine shows a CURSE: line. */
  curse: boolean;
  /** USABLE-BY: the engine's class/race/sex eligibility test (shared with EQUIP). */
  usableBy: boolean;
}

/**
 * Build the read-only ASSAY descriptor for `itemId` as inspected by `member`.
 * Pure — reads the scenario record + member class/race/sex only.
 *
 * RE: docs/re/findings/wpcvw-assay-action.json.
 */
export function assayItem(
  itemId: number,
  member: Pick<Character, 'class' | 'race' | 'sex'>,
  scenarioDb: ScenarioDb,
): AssayDescriptor {
  const item = scenarioDb.items[itemId];
  const bytes = item?.bytes ?? [];

  const category = bytes[OFF_CATEGORY] ?? 0;
  const categoryLabel = CATEGORY_LABELS[category] ?? 'MISC. ITEM';
  const isWeapon = WEAPON_CATEGORIES.has(category);

  const weaponType = isWeapon ? WEAPON_SKILL_TABLE[bytes[OFF_WEAPON_TYPE] ?? 0] : undefined;
  const attackModes = isWeapon ? ATTACK_MODES_BY_CATEGORY[category] : undefined;

  // Two-handed-ness is carried by the cached inventory flag bit 0x08, not the
  // scenario record; ASSAY reads the scenario record only, so the descriptor
  // reports 1HAND for weapon slots. LONGSWORD is 1HAND (matches the fixture);
  // genuine 2H weapons (flag 0x08) would need the caller to thread the flag —
  // flagged for the pixel gate to confirm if a 2H weapon is ever assayed.
  const equipSlot = item?.equipSlot ?? 0;
  const slotLabel = equipSlotLabel(equipSlot, false);

  const resistances: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = bytes[OFF_RESIST_FIRST + i * 2] ?? 0;
    const b = bytes[OFF_RESIST_FIRST + i * 2 + 1] ?? 0;
    resistances.push(Math.min(Math.floor((a + b) / 2), 99));
  }

  return {
    name: item?.name1 ?? '',
    categoryLabel,
    weaponType,
    attackModes,
    equipSlotLabel: slotLabel,
    weight: (bytes[OFF_WEIGHT] ?? 0) / 10,
    ac: bytes[OFF_AC] ?? 0,
    resistanceHeaders: [RESISTANCE_HEADER_ROW1, RESISTANCE_HEADER_ROW2],
    resistances,
    curse: (bytes[OFF_CURSE] ?? 0) !== 0,
    usableBy: itemEligible(member, bytes),
  };
}
