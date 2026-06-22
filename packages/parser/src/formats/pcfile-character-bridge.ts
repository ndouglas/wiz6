import type { Character, PcfileInventoryItem, PcfileSlot } from '@wiz6/data';

// ---------------------------------------------------------------------------
// Isomorphic base64 helpers — NO node:Buffer / node:* imports.
// Use globalThis.btoa / globalThis.atob (present in Node 16+ and all browsers).
// ---------------------------------------------------------------------------

/** Encode a number[] (or Uint8Array) of byte values to a base64 string. */
function bytesToBase64(bytes: number[] | Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

/** Decode a base64 string back into a number[]. */
function base64ToNumberArray(b64: string): number[] {
  const s = atob(b64);
  const out = new Array<number>(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Record offsets for fields the engine keeps but PcfileSlot only preserves in `raw`. */
const OFF_RENDERED_PORTRAIT = 0x19c; // global portrait index 0..41 (the drawn portrait)
// Sex is +0x19e (0 = male, 1 = female), now a first-class PcfileSlot.sex field.
// Confirmed against the engine ADD PARTY picker (TEMPEST renders 'F'; +0x19e == 1
// only for her among the pinned roster). OFF_SEX is also written into `raw` so an
// app-built slot round-trips byte-exactly through encodeCharacterRecord.
const OFF_SEX = 0x19e;

/**
 * Convert a decoded PCFILE.DBS slot into a roster `Character`.
 *
 * Engine fields map field-for-field. Two fields live only in `raw`:
 *   - rendered portrait at +0x19c  → Character.portraitIndex (the GLOBAL index the
 *     engine actually draws; NOT slot.portraitIndex, which is the +0x1ab creation default)
 *   - sex at +0x19e                → Character.sex (1 = female)
 *
 * @param slot a populated PcfileSlot (caller filters out empty slots).
 * @param id   the UUID to assign (fresh on import; deterministic in tests).
 */
export function pcfileSlotToCharacter(slot: PcfileSlot, id: string): Character {
  return {
    id,
    name: slot.name ?? '',
    race: slot.race,
    class: slot.class,
    level: slot.level,
    savedOldLevel: slot.savedOldLevel,
    xp: slot.xp,
    gold: slot.gold,
    conditions: [...slot.conditions],
    dead: slot.conditions[2] !== 0,
    paralyzed: slot.conditions[3] !== 0,
    attributes: {
      str: slot.str, int: slot.int, pie: slot.pie, vit: slot.vit,
      dex: slot.dex, spd: slot.spd, per: slot.per, kar: slot.kar,
    },
    schoolMana: [...slot.schoolManaCur],
    schoolManaMax: [...slot.schoolManaMax],
    // Known-spell bitset (record +0x188, 20 bytes; spell-table index i known iff
    // bit i&7 of byte i>>3). Without this the camp SPELL spellbook viewer sees no
    // learned spells for imported casters. RE: wpcvw-known-spells.json.
    spellSlotsKnown: [...slot.spellSlotsKnown],
    skills: [...slot.skills],
    reaction: slot.reaction,
    sex: (slot.sex === 1 ? 1 : 0),
    portraitIndex: slot.raw[OFF_RENDERED_PORTRAIT]!,
    // Maze per-turn affliction fields, read straight from the raw record. The
    // Character schema models them (#089); they live only in `raw` on the slot.
    statusLevel: slot.raw[0x1a1] ?? 0,
    poisonAmount: slot.raw[0x1a5] ?? 0,
    vitRegen: [slot.raw[0x1a2] ?? 0, slot.raw[0x1a3] ?? 0, slot.raw[0x1a4] ?? 0],
    schoolSkill: [0, 1, 2, 3, 4, 5].map((s) => slot.raw[0x11c + s] ?? 0),
    hpCurrent: slot.hpCurrent,
    hpMax: slot.hpMax,
    staminaCurrent: slot.spCurrent,
    staminaMax: slot.spMax,
    age: slot.ageCounter,
    mks: slot.mks,
    encumbranceCurrent: slot.encumbranceCurrent,
    encumbranceMax: slot.encumbranceMax,
    bodyAc: [...slot.bodyAc],
    // Stored derived AC (record +0x160). Without this the char-view AC total
    // falls back to 10 (drawArmorClass `?? 10`), which only matches Fighter-base
    // characters — a Faerie Ninja's stored 8 rendered as 10. RE: +0x4548 base AC.
    derivedAc: slot.derivedAc,
    // School rank thresholds: 14-byte array at +0x152..+0x15f.
    // Carries through so the reverse bridge can reconstruct them byte-exactly.
    schoolRankThresholds: [...slot.schoolRankThresholds],
    // Carried inventory + equipped body-slots. Previously omitted, so every
    // character loaded from a pcfile (viewer roster import via pc-file-io.ts)
    // came through with an empty pack — the review screen + equip menu showed
    // nothing even when the record held items (e.g. freshly-created class kits).
    // The parity tests never caught this because they hardcode `inventory`.
    inventory: slot.inventory.map((it) => ({
      itemId: it.itemId,
      weight: it.weight,
      equipSlot: it.equipSlot,
      spriteIdx: it.spriteIdx,
      quantity: it.quantity,
      flags: it.flags,
    })),
    equipment: [...slot.equipment],
    // Retain the original 432-byte record as base64 so that characterToPcfileSlot
    // can restore raw-only regions (+0xf0 combat/AC block, +0x118..+0x121 school
    // capacity) that the Character schema does not model. Without this, those bytes
    // are zeroed on re-export — a real engine bug (school capacity 0 = no spells).
    // RE: docs/re/findings/character-residual-read-vs-recompute.json (#082).
    pcfileRaw: bytesToBase64(slot.raw),
  };
}

const EMPTY_ITEM: PcfileInventoryItem = {
  itemId: 0, weight: 0, pad: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0,
};

/**
 * Synthesize a full PcfileSlot (including a 432-byte `raw`) from a roster
 * Character, ready for `encodeCharacterRecord`. App-created characters have no
 * `raw`, so we build one: zeroed, with the two raw-only engine fields written —
 * rendered portrait at +0x19c and sex at +0x19e. Fields our Character schema
 * does not model are defaulted (empty inventory, 0xFF equipment, base AC 10).
 *
 * sex (+0x19e) is set directly on the slot; encodeCharacterRecord writes it back
 * to +0x19e, and we also stamp raw[+0x19e] so the round-trip is byte-exact.
 */
export function characterToPcfileSlot(c: Character, slotIndex: number): PcfileSlot {
  // Seed raw from the original on-disk record if available (imported characters),
  // so raw-only regions (+0xf0..+0x10f combat/AC block, +0x118..+0x121 school
  // capacity) are preserved verbatim. For port-created characters (no pcfileRaw),
  // fall back to the zeroed-raw path — synthesis of these fields is a follow-up.
  const raw = c.pcfileRaw
    ? base64ToNumberArray(c.pcfileRaw)
    : new Array<number>(432).fill(0);
  raw[OFF_RENDERED_PORTRAIT] = (c.portraitIndex ?? 0) & 0xff;
  raw[OFF_SEX] = c.sex & 0xff;

  return {
    slot: slotIndex,
    populated: true,
    name: c.name,
    ageCounter: c.age ?? 0,
    xp: c.xp,
    mks: c.mks ?? 0,
    gold: c.gold,
    hpCurrent: c.hpCurrent ?? 0,
    hpMax: c.hpMax ?? 0,
    spCurrent: c.staminaCurrent ?? 0,
    spMax: c.staminaMax ?? 0,
    encumbranceCurrent: c.encumbranceCurrent ?? 0,
    encumbranceMax: c.encumbranceMax ?? 0,
    schoolManaCur: [...c.schoolMana],
    schoolManaMax: [...c.schoolManaMax],
    level: c.level,
    levelSecondary: c.level,
    conditions: [...c.conditions],
    race: c.race,
    sex: c.sex & 0xff, // +0x19e
    class: c.class,
    str: c.attributes.str,
    int: c.attributes.int,
    pie: c.attributes.pie,
    vit: c.attributes.vit,
    dex: c.attributes.dex,
    spd: c.attributes.spd,
    per: c.attributes.per,
    kar: c.attributes.kar,
    skills: [...c.skills],
    bodyAc: c.bodyAc ? [...c.bodyAc] : [0, 0, 10, 10, 10, 10, 10],
    reaction: c.reaction,
    npcRaceReaction: c.npcRaceReaction ? [...c.npcRaceReaction] : new Array<number>(31).fill(c.reaction),
    spellSlotsKnown: c.spellSlotsKnown ? [...c.spellSlotsKnown] : new Array<number>(20).fill(0),
    // +0x1ab creation default portrait index. When pcfileRaw is present, recover
    // the original creation default directly from the raw bytes (raw is already
    // seeded from pcfileRaw, so raw[0x1ab] holds the original on-disk value;
    // encodeCharacterRecord will stamp it back). Fall back to c.portraitIndex (the
    // rendered portrait from +0x19c) for port-created characters without pcfileRaw.
    portraitIndex: raw[0x1ab] ?? (c.portraitIndex ?? 0),
    // inventoryCount / inventoryCountPage2 are not on the Character schema; derive them
    // from inventory so the roundtrip is byte-exact at +0x1ac/+0x1ad.
    // Engine definition: inventoryCount = number of occupied slots (itemId > 0) in slots 0..9;
    // inventoryCountPage2 = occupied slots in 10..21. Matches the stock record values (all 5,0).
    inventoryCount: c.inventory
      ? c.inventory.slice(0, 10).filter((it) => it.itemId > 0).length
      : 0,
    inventoryCountPage2: c.inventory
      ? c.inventory.slice(10, 22).filter((it) => it.itemId > 0).length
      : 0,
    derivedAc: c.derivedAc ?? 10,
    savedOldLevel: c.savedOldLevel,
    schoolRankThresholds: c.schoolRankThresholds ? [...c.schoolRankThresholds] : new Array<number>(14).fill(0),
    inventory: c.inventory
      ? c.inventory.map((it) => ({ ...it, pad: 0 }))
      : new Array(22).fill(null).map(() => ({ ...EMPTY_ITEM })),
    equipment: c.equipment ? [...c.equipment] : new Array<number>(8).fill(0xff),
    raw,
  };
}
