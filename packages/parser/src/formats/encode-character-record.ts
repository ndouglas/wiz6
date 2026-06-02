import type { PcfileSlot } from '@wiz6/data';

/**
 * Encode a decoded `PcfileSlot` back to the 432-byte on-disk record format.
 *
 * Strategy: start from the slot's `raw` bytes (preserving all unmapped regions),
 * then overwrite each decoded field at its exact record-relative offset. This
 * guarantees byte-perfect round-trip for the 6 stock characters in `pcfile.dbs`.
 *
 * Field offsets mirror `packages/parser/src/formats/pcfile.ts` exactly.
 * All LE encodings verified against the `decodePcfile` decoder.
 *
 * Unmapped bytes (preserved verbatim from `raw`):
 *   +0x118..+0x121  10 bytes  unknown_0x118 (class-dependent school capacity flags)
 *   +0x19c          1 byte    rendered_portrait_index (global 0..41; the drawn portrait)
 *   +0x1a0          1 byte    high_water_level (class-title threshold count)
 *   +0x1a1          1 byte    sex (not decoded by PcfileSlot — carried in raw only)
 *   +0x1a2..+0x1a5  4 bytes   unknown_0x1a2 (always 0 in stock chars)
 *   +0x1a6          1 byte    unknown_0x1a6 (always 1 in stock chars)
 *   +0x1a7          1 byte    unknown_0x1a7 (always 10 in stock chars)
 *   +0x1a8          1 byte    spells_to_learn (always 0 in stock chars)
 *   +0x1a9          1 byte    unknown_0x1a9 (always 1 in stock chars)
 *   +0x1aa          1 byte    unknown_0x1aa (always 1 in stock chars)
 *   +0x1ae          1 byte    unknown_0x1ae (always 100 in stock chars)
 */
export function encodeCharacterRecord(slot: PcfileSlot): Uint8Array {
  const RECORD_SIZE = 0x1b0; // 432 bytes
  const out = new Uint8Array(RECORD_SIZE);
  const view = new DataView(out.buffer);

  // Seed from raw (preserves all unmapped bytes verbatim)
  out.set(slot.raw);

  // --- +0x00: name — ASCII null-terminated, 8-byte field ---
  // Zero the name field first, then write the name bytes
  out.fill(0, 0x00, 0x08);
  if (slot.name !== null) {
    const encoder = new TextEncoder();
    const nameBytes = encoder.encode(slot.name);
    out.set(nameBytes.subarray(0, Math.min(7, nameBytes.length)), 0x00);
    // byte 7 stays 0 (null terminator already zeroed above)
  }

  // --- +0x08: ageCounter — u32 LE ---
  view.setUint32(0x08, slot.ageCounter, true);

  // --- +0x0c: xp — u32 LE ---
  view.setUint32(0x0c, slot.xp, true);

  // --- +0x10: mks — u32 LE ---
  view.setUint32(0x10, slot.mks, true);

  // --- +0x14: gold — u32 LE ---
  view.setUint32(0x14, slot.gold, true);

  // --- +0x18: hpCurrent — u16 LE ---
  view.setUint16(0x18, slot.hpCurrent, true);

  // --- +0x1a: hpMax — u16 LE ---
  view.setUint16(0x1a, slot.hpMax, true);

  // --- +0x1c: spCurrent — u16 LE ---
  view.setUint16(0x1c, slot.spCurrent, true);

  // --- +0x1e: spMax — u16 LE ---
  view.setUint16(0x1e, slot.spMax, true);

  // --- +0x20: encumbranceCurrent — u16 LE ---
  view.setUint16(0x20, slot.encumbranceCurrent, true);

  // --- +0x22: encumbranceMax — u16 LE ---
  view.setUint16(0x22, slot.encumbranceMax, true);

  // --- +0x24: level — u16 LE ---
  view.setUint16(0x24, slot.level, true);

  // --- +0x26: levelSecondary — u16 LE ---
  view.setUint16(0x26, slot.levelSecondary, true);

  // --- +0x28: schoolManaCur/schoolManaMax interleaved — 6 x (u16 cur, u16 max) ---
  // Layout: cur[s] at +0x28+s*4, max[s] at +0x2a+s*4
  for (let s = 0; s < 6; s++) {
    view.setUint16(0x28 + s * 4, slot.schoolManaCur[s]!, true);
    view.setUint16(0x2a + s * 4, slot.schoolManaMax[s]!, true);
  }

  // --- +0x40: inventory — 22 slots x 8 bytes ---
  for (let inv = 0; inv < 22; inv++) {
    const slotOff = 0x40 + inv * 8;
    const item = slot.inventory[inv]!;
    view.setUint16(slotOff + 0, item.itemId, true); // [0-1] item_id u16 LE
    out[slotOff + 2] = item.weight;                 // [2] weight u8
    out[slotOff + 3] = item.pad;                    // [3] pad u8 (always 0)
    out[slotOff + 4] = item.equipSlot;              // [4] equip_slot u8
    out[slotOff + 5] = item.spriteIdx;              // [5] sprite_idx u8
    out[slotOff + 6] = item.quantity;               // [6] quantity u8
    out[slotOff + 7] = item.flags;                  // [7] flags u8
  }

  // --- +0x110: equipment — 8-byte body-slot array ---
  for (let eq = 0; eq < 8; eq++) {
    out[0x110 + eq] = slot.equipment[eq]!;
  }

  // --- +0x118..+0x121: unknown_0x118 (10 bytes) — preserved from raw ---

  // --- +0x122: conditions — 10-byte array ---
  for (let c = 0; c < 10; c++) {
    out[0x122 + c] = slot.conditions[c]!;
  }

  // --- +0x12c: attributes — 8 bytes (STR/INT/PIE/VIT/DEX/SPD/PER/KAR) ---
  out[0x12c] = slot.str;
  out[0x12d] = slot.int;
  out[0x12e] = slot.pie;
  out[0x12f] = slot.vit;
  out[0x130] = slot.dex;
  out[0x131] = slot.spd;
  out[0x132] = slot.per;
  out[0x133] = slot.kar;

  // --- +0x134: skills — 30-byte array ---
  for (let sk = 0; sk < 30; sk++) {
    out[0x134 + sk] = slot.skills[sk]!;
  }

  // --- +0x152: schoolRankThresholds — 14-byte array ---
  for (let s = 0; s < 14; s++) {
    out[0x152 + s] = slot.schoolRankThresholds[s]!;
  }

  // --- +0x160: derivedAc — u8 ---
  out[0x160] = slot.derivedAc;

  // --- +0x161: bodyAc — 7-byte array ---
  for (let ba = 0; ba < 7; ba++) {
    out[0x161 + ba] = slot.bodyAc[ba]!;
  }

  // --- +0x168: reaction — u8 ---
  out[0x168] = slot.reaction;

  // --- +0x169: npcRaceReaction — 31-byte array ---
  for (let r = 0; r < 31; r++) {
    out[0x169 + r] = slot.npcRaceReaction[r]!;
  }

  // --- +0x188: spellSlotsKnown — 20-byte array ---
  for (let sp = 0; sp < 20; sp++) {
    out[0x188 + sp] = slot.spellSlotsKnown[sp]!;
  }

  // --- +0x19c: rendered_portrait_index (global 0..41) — preserved from raw ---
  // --- +0x19d: race — u8 ---
  out[0x19d] = slot.race;

  // --- +0x19e: sex — u8 (0=male, 1=female) ---
  out[0x19e] = slot.sex;

  // --- +0x19f: class — u8 ---
  out[0x19f] = slot.class;

  // --- +0x1a0: high_water_level (1 byte) — preserved from raw ---
  // --- +0x1a1: sex (1 byte) — preserved from raw ---
  // --- +0x1a2..+0x1a5: unknown_0x1a2 (4 bytes) — preserved from raw ---
  // --- +0x1a6: unknown_0x1a6 (1 byte) — preserved from raw ---
  // --- +0x1a7: unknown_0x1a7 (1 byte) — preserved from raw ---
  // --- +0x1a8: spells_to_learn (1 byte) — preserved from raw ---
  // --- +0x1a9: unknown_0x1a9 (1 byte) — preserved from raw ---
  // --- +0x1aa: unknown_0x1aa (1 byte) — preserved from raw ---
  // --- +0x1ab: portraitIndex — u8 ---
  out[0x1ab] = slot.portraitIndex;

  // --- +0x1ac: inventoryCount — u8 ---
  out[0x1ac] = slot.inventoryCount;

  // --- +0x1ad: inventoryCountPage2 — u8 ---
  out[0x1ad] = slot.inventoryCountPage2;

  // --- +0x1ae: unknown_0x1ae (1 byte) — preserved from raw ---
  // --- +0x1af: savedOldLevel — u8 ---
  out[0x1af] = slot.savedOldLevel;

  return out;
}
