import {
  DecodedPcfileSchema,
  type DecodedPcfile,
  type PcfileInventoryItem,
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

    // Skills: 30-byte array at +0x134..+0x151 (abs 0x451c..0x4539). Cap = 0x32 = 50.
    // EXTENDED from 14 to 30: prior 'derived_stats_block' at +0x142..+0x151 is skill continuation.
    // Empirically confirmed: LYSANDR skills[15]=10(Skulduggery), NOBAL skills[26]=7(Theology),
    // TREON skills[28]=10(Thaumaturgy), PENTAG skills[28]=7(Thaumaturgy).
    // skill_roll_check (wpcvw file+0xa4c1): [bx+0x451c+skill_idx]; cmp with 0x32.
    const skills: number[] = [];
    for (let sk = 0; sk < 30; sk++) {
      skills.push(rec[0x134 + sk]!);
    }

    // Inventory: 22 slots x 8 bytes at +0x40 (abs 0x4428..0x44ef).
    // Per-slot: [0-1]=item_id(u16), [2]=weight, [3]=0, [4]=equip_slot, [5]=sprite_idx,
    //           [6]=quantity, [7]=flags.
    // wpcvw.ovr file+0x18DC/0x23D8: add ax, 0x4428 (inventory base).
    // file+0x207E/0x210A/0x20BC/0x22DC: reads bytes 4/5/6/7 of first slot.
    // 100% cross-check: byte2==item.weight, byte4==item.equipSlot, byte5==item.spriteIdx.
    const inventory: PcfileInventoryItem[] = [];
    for (let inv = 0; inv < 22; inv++) {
      const slotOff = 0x40 + inv * 8;
      inventory.push({
        itemId: view.getUint16(recStart + slotOff, true),
        weight: rec[slotOff + 2]!,
        pad: rec[slotOff + 3]!,
        equipSlot: rec[slotOff + 4]!,
        spriteIdx: rec[slotOff + 5]!,
        quantity: rec[slotOff + 6]!,
        flags: rec[slotOff + 7]!,
      });
    }

    // Equipment: 8-byte body-slot array at +0x110 (abs 0x44f8..0x44ff).
    // Each byte = inventory index (0..21) of equipped item, or 0xFF = empty.
    // Slots: [0]=weapon [1]=shield [2]=head [3]=body [4]=legs [5]=hands [6]=feet [7]=cloak.
    // wpcvw.ovr file+0x81E8: mov al,[bx+0x44f8] (read weapon slot).
    // file+0x8327: mov [bx+0x44f8], al (write on equip).
    // All stock chars = [0xFF x8] (items in inventory but not pre-equipped).
    const equipment: number[] = [];
    for (let eq = 0; eq < 8; eq++) {
      equipment.push(rec[0x110 + eq]!);
    }

    // Per-NPC-race reaction array: 31 bytes at +0x169 (abs 0x4551..0x456f).
    // Initialized to base reaction; updated per-race by wmnpc.ovr after encounters.
    // HIGH confidence.
    const npcRaceReaction: number[] = [];
    for (let r = 0; r < 31; r++) {
      npcRaceReaction.push(rec[0x169 + r]!);
    }

    // Sparse caster-data region: 20 bytes at +0x188 (abs 0x4570..0x4583).
    // All zeros for fighters/thief; casters have sparse nonzero values.
    // Likely spell-known counts or spell-slot tracking. LOW confidence.
    const spellSlotsKnown: number[] = [];
    for (let sp = 0; sp < 20; sp++) {
      spellSlotsKnown.push(rec[0x188 + sp]!);
    }

    // School rank thresholds: 14 bytes at +0x152 (abs 0x453a..0x4547).
    // Written by wpcmk creation init via class-formula. MEDIUM confidence.
    const schoolRankThresholds: number[] = [];
    for (let s = 0; s < 14; s++) {
      schoolRankThresholds.push(rec[0x152 + s]!);
    }

    // bodyAc: 7-byte per-body-slot AC array at +0x161..+0x167 (abs 0x4549..0x454f).
    // Manual p. 25: AC sub-components = Magical+Head+Chest+Legs+Hands+Feet+Encumbrance/Shield.
    // Stock chars (unarmored): first 2 bytes = 0, bytes 3-7 = 10.
    const bodyAc: number[] = [];
    for (let ba = 0; ba < 7; ba++) {
      bodyAc.push(rec[0x161 + ba]!);
    }

    slots.push({
      slot: i,
      populated,
      name,
      ageCounter: view.getUint32(recStart + 0x08, true),
      xp: view.getUint32(recStart + 0x0c, true),
      // Monster Kill Statistic (MKS). Manual p. 23: kill counter. At +0x10 (abs 0x43f8/0x43fa).
      // wmexe.ovr increments per kill. All stock chars = 0.
      mks: view.getUint32(recStart + 0x10, true),
      // Gold is a 32-bit field at +0x14 (abs 0x43fc/0x43fe).
      // Corrected from prior +0x22 u16 which was an unidentified field.
      // give_gold (wpcvw 0x513e) uses 32-bit carry math on abs 0x43fc/0x43fe.
      gold: view.getUint32(recStart + 0x14, true),
      hpCurrent: view.getUint16(recStart + 0x18, true),
      hpMax: view.getUint16(recStart + 0x1A, true),
      spCurrent: view.getUint16(recStart + 0x1C, true),
      spMax: view.getUint16(recStart + 0x1E, true),
      // encumbranceCurrent: current load in tenths of a pound. At +0x20 (abs 0x4408).
      // martydill/pcfile_editor.py cross-ref. wpcvw accumulates inventory item weights here.
      // Stock: THESUS=295, TEMPEST=295, LYSANDR=225, NOBAL=136, TREON=128, PENTAG=128.
      encumbranceCurrent: view.getUint16(recStart + 0x20, true),
      // encumbranceMax: max carry capacity in tenths of a pound. At +0x22.
      // martydill cross-ref. Scales with STR: THESUS(STR=18)=2700, LYSANDR(STR=7)=1125.
      encumbranceMax: view.getUint16(recStart + 0x22, true),
      schoolManaCur,
      schoolManaMax,
      level: view.getUint16(recStart + 0x24, true),
      levelSecondary: view.getUint16(recStart + 0x26, true),
      conditions,
      // Attributes: 8-byte block at +0x12c (abs 0x4514).
      // Stats panel loop (wpcvw ndisasm 0x0e55+0x464): reads [bx+0x4514+i] for i=0..7
      // with msgs 0xcc..0xd3 = STR/INT/PIE/VIT/DEX/SPD/PER/KAR.
      // PER=Personality, KAR=Karma (manual p. 11: distinct named primary stats).
      str: rec[0x12c]!,
      int: rec[0x12d]!,
      pie: rec[0x12e]!,
      vit: rec[0x12f]!,
      dex: rec[0x130]!,
      spd: rec[0x131]!,
      per: rec[0x132]!,
      kar: rec[0x133]!,
      skills,
      bodyAc,
      schoolRankThresholds,
      // Derived AC at +0x160 (abs 0x4548). HIGH confidence.
      // wpcvw derived_ac (file+0xaa94): base 10; SPD>=16 -1, SPD>=18 -1, Faerie -2, Monk/Ninja -(level/2).
      derivedAc: rec[0x160]!,
      // Reaction at +0x168 (abs 0x4550). HIGH confidence.
      // wmnpc.ovr file+0x671d: reads, computes delta, clamps to 100, writes back.
      reaction: rec[0x168]!,
      npcRaceReaction,
      spellSlotsKnown,
      // Race at +0x19d (abs 0x4585). Stats panel: mov al,[bx+0x4585]; add ax,0x64 -> msg lookup.
      // NOTE: prior bss_layout "+0x19c" was wrong by 1 byte.
      race: rec[0x19d]!,
      // Sex at +0x19e (abs 0x4586): 0=male, 1=female. Msg-table +0x8c -> M/F label.
      sex: rec[0x19e]!,
      // Class at +0x19f (abs 0x4587). Stats panel: mov al,[bx+0x4587]; add ax,0x78 -> msg lookup.
      // NOTE: prior bss_layout "+0x19e" was wrong by 1 byte.
      class: rec[0x19f]!,
      // portraitIndex at +0x1ab (abs 0x4593). MEDIUM confidence.
      // Values align with portrait indices 0-13 (14 portraits available).
      // Stock: THESUS=10, TEMPEST=8, LYSANDR=13, NOBAL=10, TREON=9, PENTAG=7.
      portraitIndex: rec[0x1ab]!,
      // inventoryCount at +0x1ac (abs 0x4594). HIGH confidence.
      inventoryCount: rec[0x1ac]!,
      // inventoryCountPage2 at +0x1ad (abs 0x4595). MEDIUM confidence.
      // martydill: page-2 item count. Stock chars all = 0.
      inventoryCountPage2: rec[0x1ad]!,
      // savedOldLevel at +0x1af (abs 0x4597). MEDIUM confidence.
      // class_change_apply (wpcvw 0x6054): writes *0x4597 = old_level.
      savedOldLevel: rec[0x1af]!,
      inventory,
      equipment,
      raw: Array.from(rec),
    });
  }

  return DecodedPcfileSchema.parse({
    header: { recordSize, slotCount, headerSize, status },
    slots,
  });
}
