import {
  DecodedPcfileSchema,
  type DecodedPcfile,
  type PcfileSlot,
} from '@wiz6/data';

/**
 * Decode `pcfile.dbs` bytes into a typed structure. Pure — no I/O.
 *
 * The on-disk record layout matches the in-memory `0x43e8` stride-`0x1B0`
 * BSS char slot exactly (verified by tracing the engine's load routine —
 * `wbase.ovr` does a 432-byte `rep movsw` straight from file buffer to
 * BSS). See `docs/re/pcfile-dbs.md` for the field-offset map.
 *
 * v1 decodes a small set of high-confidence fields. The full 432-byte
 * record is preserved per slot as `raw` so future RE refinements can
 * extract additional fields without re-running this decoder.
 *
 * Validates the decoded structure against `DecodedPcfileSchema`.
 */
export function decodePcfile(bytes: Uint8Array): DecodedPcfile {
  if (bytes.length < 24) {
    throw new Error(`pcfile too short: ${bytes.length} bytes (need at least 24 for header)`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const recordSize = view.getUint16(0x00, true);
  const slotCount = view.getUint16(0x02, true);
  const headerSize = view.getUint32(0x04, true);

  if (recordSize !== 0x1B0) {
    throw new Error(`unexpected pcfile record_size: 0x${recordSize.toString(16)} (expected 0x1B0)`);
  }
  if (slotCount !== 16) {
    throw new Error(`unexpected pcfile slot_count: ${slotCount} (expected 16)`);
  }
  if (headerSize !== 24) {
    throw new Error(`unexpected pcfile header_size: ${headerSize} (expected 24)`);
  }
  const expected = headerSize + slotCount * recordSize;
  if (bytes.length !== expected) {
    throw new Error(`pcfile size mismatch: got ${bytes.length} bytes, expected ${expected}`);
  }

  const status: number[] = [];
  for (let i = 0; i < 16; i++) status.push(bytes[8 + i]!);

  const decoder = new TextDecoder('ascii');
  const slots: PcfileSlot[] = [];
  for (let i = 0; i < 16; i++) {
    const recStart = headerSize + i * recordSize;
    const rec = bytes.subarray(recStart, recStart + recordSize);
    const populated = status[i] === 1;

    let name: string | null = null;
    if (populated) {
      let nameEnd = 0;
      while (nameEnd < 8 && rec[nameEnd] !== 0) nameEnd++;
      name = decoder.decode(rec.subarray(0, nameEnd));
    }

    // School mana: 6 schools interleaved as (cur u16, max u16) pairs.
    // Stats panel loop (wpcvw file+0x0e55+0x4c): for i=0..5:
    //   bx = slot*0x1b0 + i*4; push [bx+0x4410] (cur); push [bx+0x4412] (max).
    // abs 0x4410 = base 0x43e8 + +0x28. Stride = 4 bytes per school.
    const schoolManaCur: number[] = [];
    const schoolManaMax: number[] = [];
    for (let s = 0; s < 6; s++) {
      schoolManaCur.push(view.getUint16(recStart + 0x28 + s * 4, true));
      schoolManaMax.push(view.getUint16(recStart + 0x2a + s * 4, true));
    }

    // Conditions: 10-byte array at +0x122 (abs 0x450a).
    // Priority loop (wpcvw file+0x05c6): for si=0..9: bx=slot*0x1b0+si; [bx+0x450a].
    // conditions[2]=dead, conditions[3]=paralyzed (portrait overrides).
    const conditions: number[] = [];
    for (let c = 0; c < 10; c++) {
      conditions.push(rec[0x122 + c]!);
    }

    // Skills: 14-byte array at +0x134 (abs 0x451c). Cap = 0x32 = 50.
    // skill_roll_check (wpcvw file+0xa4c1): [bx+0x451c+skill_idx]; cmp with 0x32.
    const skills: number[] = [];
    for (let sk = 0; sk < 14; sk++) {
      skills.push(rec[0x134 + sk]!);
    }

    slots.push({
      slot: i,
      populated,
      name,
      ageCounter: view.getUint32(recStart + 0x08, true),
      xp: view.getUint32(recStart + 0x0c, true),
      // Gold is a 32-bit field at +0x14 (abs 0x43fc/0x43fe).
      // Corrected from prior +0x22 u16 which was an unidentified field.
      // give_gold (wpcvw 0x513e) uses 32-bit carry math on abs 0x43fc/0x43fe.
      gold: view.getUint32(recStart + 0x14, true),
      hpCurrent: view.getUint16(recStart + 0x18, true),
      hpMax: view.getUint16(recStart + 0x1A, true),
      spCurrent: view.getUint16(recStart + 0x1C, true),
      spMax: view.getUint16(recStart + 0x1E, true),
      schoolManaCur,
      schoolManaMax,
      level: view.getUint16(recStart + 0x24, true),
      levelSecondary: view.getUint16(recStart + 0x26, true),
      conditions,
      // Attributes: 8-byte block at +0x12c (abs 0x4514).
      // Stats panel loop (wpcvw ndisasm 0x0e55+0x464): reads [bx+0x4514+i] for i=0..7
      // with msgs 0xcc..0xd3 = STR/INT/PIE/VIT/DEX/SPD/PER/KAR.
      str: rec[0x12c]!,
      int: rec[0x12d]!,
      pie: rec[0x12e]!,
      vit: rec[0x12f]!,
      dex: rec[0x130]!,
      spd: rec[0x131]!,
      per: rec[0x132]!,
      kar: rec[0x133]!,
      skills,
      // Reaction at +0x168 (abs 0x4550). HIGH confidence.
      // wmnpc.ovr file+0x671d: reads, computes delta, clamps to 100, writes back.
      reaction: rec[0x168]!,
      // Race at +0x19d (abs 0x4585). Stats panel: mov al,[bx+0x4585]; add ax,0x64 -> msg lookup.
      // NOTE: prior bss_layout "+0x19c" was wrong by 1 byte.
      race: rec[0x19d]!,
      // Alignment at +0x19e (abs 0x4586). Stats panel: mov al,[bx+0x4586]; add ax,0x8c -> msg.
      alignment: rec[0x19e]!,
      // Class at +0x19f (abs 0x4587). Stats panel: mov al,[bx+0x4587]; add ax,0x78 -> msg lookup.
      // NOTE: prior bss_layout "+0x19e" was wrong by 1 byte.
      class: rec[0x19f]!,
      // savedOldLevel at +0x1af (abs 0x4597). MEDIUM confidence.
      // class_change_apply (wpcvw 0x6054): writes *0x4597 = old_level.
      savedOldLevel: rec[0x1af]!,
      raw: Array.from(rec),
    });
  }

  return DecodedPcfileSchema.parse({
    header: { recordSize, slotCount, headerSize, status },
    slots,
  });
}
