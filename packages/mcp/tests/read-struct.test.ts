// Regression tests for dosbox_read_struct — character_record field alignment.
//
// Ground truth: NUG (Male Elf Ninja, save 1, game_state=0x10/wpcmk).
// DGROUP 0x5470 = creation scratch buffer (physical 119992 in save 1).
//
// Raw bytes confirmed via dosbox_read_memory (independent of the struct decoder):
//   race @record+0x19d = 0x01 (Elf)
//   sex @record+0x19e = 0x00 (Male; the +0x8c msg-table M/F byte)
//   class @record+0x19f = 0x0d (13, Ninja in canonical @wiz6/data CLASS order)
//   portrait_table_index @record+0x1a1 = 0x00
//   attributes @record+0x12c = [0x0c,0x0a,0x0a,0x0c,0x0c,0x0c,0x08,0x0d]
//                               = STR12,INT10,PIE10,VIT12,DEX12,SPD12,PER8,KAR13
//
// Previously the MCP returned {race:13, class:0, attributes:[12,12,8,13,4,0,0,0]}
// — all wrong. The bug was in the struct-decode path (likely cumulative packing
// or a stale MCP session); root cause: decodeBssStruct was not honoring the
// explicit per-field `offset`. The fix confirmed all three struct fields are
// read at their declared offsets, not at sequential / packed positions.
//
// See docs/re/findings/wpcmk-nug-ground-truth-validation.json for full context.

import { describe, expect, it } from 'vitest';
import {
  decodeBssStruct,
  CHARACTER_RECORD,
  buildStructRegistry,
  ALL_STRUCTS,
} from '@wiz6/data';

/**
 * Build a zeroed 432-byte character_record buffer, write the NUG ground-truth
 * bytes at the verified offsets, and return it.
 *
 * Offsets are the authoritative struct offsets from character-record.ts,
 * cross-checked against wpcvw.ovr ASM traces and confirmed by independent
 * dosbox_read_memory raw dumps against save 1 at physical 119992.
 */
function makeNugBuffer(): Uint8Array {
  const buf = new Uint8Array(CHARACTER_RECORD.bytes); // 432 bytes

  // name: "NUG" (ASCII, NUL-terminated, 8-byte field at +0x00)
  buf[0] = 0x4e; // N
  buf[1] = 0x55; // U
  buf[2] = 0x47; // G

  // attributes at +0x12c (abs 0x4514): [STR,INT,PIE,VIT,DEX,SPD,PER,KAR]
  // Evidence: stats-panel loop [bx+0x4514+i] i=0..7
  buf[0x12c] = 12; // STR
  buf[0x12d] = 10; // INT
  buf[0x12e] = 10; // PIE
  buf[0x12f] = 12; // VIT
  buf[0x130] = 12; // DEX
  buf[0x131] = 12; // SPD
  buf[0x132] =  8; // PER
  buf[0x133] = 13; // KAR

  // race at +0x19d (abs 0x4585): 1 = Elf
  // Evidence: mov al,[bx+0x4585]; add ax,0x64 -> msg lookup
  buf[0x19d] = 1;

  // sex at +0x19e (abs 0x4586): 0 = Male (msg-table +0x8c -> M/F label)
  buf[0x19e] = 0;

  // class at +0x19f (abs 0x4587): 13 = Ninja (canonical @wiz6/data CLASS_REQUIREMENTS order)
  // Evidence: mov al,[bx+0x4587]; add ax,0x78 -> msg lookup
  buf[0x19f] = 13;

  // high_water_level at +0x1a0: 0
  buf[0x1a0] = 0;

  // portrait_table_index at +0x1a1 (abs 0x4589): 0
  // Evidence: mov al,[bx+0x4589]; shl ax; cs:0x526[v*2] table lookup (NOT sex — sex is +0x19e)
  buf[0x1a1] = 0;

  return buf;
}

describe('decodeBssStruct — character_record field alignment (NUG ground truth)', () => {
  const registry = buildStructRegistry(ALL_STRUCTS);

  it('decodes name, race, class, sex from correct offsets', () => {
    const buf = makeNugBuffer();
    const decoded = decodeBssStruct(CHARACTER_RECORD, buf, 0, registry);
    expect(decoded.name).toBe('NUG');
    // race must come from +0x19d (not +0x19f or any cumulative position)
    expect(decoded.race).toBe(1); // Elf
    // class must come from +0x19f (not +0x1a1 or any cumulative position)
    expect(decoded.class).toBe(13); // Ninja
    // sex must come from +0x19e (NOT +0x1a1 — that's portrait_table_index now)
    expect(decoded.sex).toBe(0); // Male
    expect(decoded.portrait_table_index).toBe(0);
  });

  it('decodes attributes from +0x12c — not from cumulative/sequential position', () => {
    // A sequential packer would start attributes at a cumulative offset that
    // skips the gap between encumbrance_max (+0x24) and inventory (+0x40),
    // landing well before 0x12c. The correct offset is explicit: 0x12c.
    //
    // The previous buggy MCP output was attrs:[12,12,8,13,4,0,0,0]
    // which are the bytes at buffer[0x130..0x137] — wrong.
    // Correct is buffer[0x12c..0x133] = [12,10,10,12,12,12,8,13].
    const buf = makeNugBuffer();
    const decoded = decodeBssStruct(CHARACTER_RECORD, buf, 0, registry);
    expect(decoded.attributes).toEqual([12, 10, 10, 12, 12, 12, 8, 13]);
  });

  it('race/class/sex values do not bleed into each other', () => {
    // The reported bug returned race=13 (the class value) and class=0 (the sex
    // value). This test verifies each byte comes from its declared offset and
    // not from the field that happens to be next in the buffer.
    const buf = makeNugBuffer();
    const decoded = decodeBssStruct(CHARACTER_RECORD, buf, 0, registry);
    // If decoder reads race from +0x19f instead of +0x19d, it would get 13 (wrong)
    expect(decoded.race).not.toBe(13);
    // If decoder reads race from +0x1a1 instead of +0x19d, it would get 0 (wrong)
    expect(decoded.race).not.toBe(0);
    // race must be 1 (Elf byte placed at +0x19d)
    expect(decoded.race).toBe(1);
    // class must be 13 (placed at +0x19f), not 0 (placed at +0x1a1)
    expect(decoded.class).toBe(13);
    expect(decoded.class).not.toBe(0);
  });

  it('attributes first element is STR=12, not VIT=12 at a shifted position', () => {
    // Place unique values at every attribute position to rule out coincidental
    // matches. STR=11, INT=10, PIE=9, VIT=8, DEX=7, SPD=6, PER=5, KAR=4.
    const buf = new Uint8Array(CHARACTER_RECORD.bytes);
    buf[0x12c] = 11; // STR
    buf[0x12d] = 10; // INT
    buf[0x12e] =  9; // PIE
    buf[0x12f] =  8; // VIT
    buf[0x130] =  7; // DEX
    buf[0x131] =  6; // SPD
    buf[0x132] =  5; // PER
    buf[0x133] =  4; // KAR
    // Also put non-zero values at the bytes just before and after to catch drift
    buf[0x12b] = 0xff;
    buf[0x134] = 0xaa;

    const decoded = decodeBssStruct(CHARACTER_RECORD, buf, 0, registry);
    expect(decoded.attributes).toEqual([11, 10, 9, 8, 7, 6, 5, 4]);
  });

  it('fields with non-adjacent offsets do not clobber each other', () => {
    // level (+0x24) comes BEFORE school_mana_cur (+0x28) in the buffer,
    // but school_mana_cur appears BEFORE level in the fields array.
    // If the decoder used field declaration order for sequential packing,
    // level would end up past the mana fields at a cumulative position
    // (around +0x3c) instead of its declared +0x24.
    const buf = new Uint8Array(CHARACTER_RECORD.bytes);
    // Write sentinel values at declared offsets
    buf[0x24] = 3; buf[0x25] = 0; // level = 3
    buf[0x26] = 3; buf[0x27] = 0; // level_secondary = 3
    // Leave mana fields as zero
    const decoded = decodeBssStruct(CHARACTER_RECORD, buf, 0, registry);
    expect(decoded.level).toBe(3);
    expect(decoded.level_secondary).toBe(3);
    // With sequential packing, these would both be 0 (reading zeros from 0x3c/0x3e)
  });
});

describe('decodeBssStruct — school_mana_cur/max interleaved layout', () => {
  // Engine layout (pcfile.ts, wpcvw.ovr): schools are stored interleaved.
  // At +0x28+school*4: cur[school] (u16 LE)
  // At +0x2a+school*4: max[school] (u16 LE)
  //
  // School 0 = Fire: cur@0x28, max@0x2a
  // School 1 = Water: cur@0x2c, max@0x2e
  // School 2 = Air: cur@0x30, max@0x32
  // School 3 = Earth: cur@0x34, max@0x36
  // School 4 = Mental: cur@0x38, max@0x3a
  // School 5 = Divine: cur@0x3c, max@0x3e
  //
  // The BssStruct declares both as sequential u16 arrays (stride 2).
  // With stride 2, school_mana_cur reads [cur0, max0, cur1, max1, cur2, max2]
  // mixing cur and max values. That is the bug in the mana field definitions.

  const registry = buildStructRegistry(ALL_STRUCTS);

  it('school_mana_cur reads cur values at the interleaved stride-4 positions', () => {
    const buf = new Uint8Array(CHARACTER_RECORD.bytes);
    // Set Fire (school 0): cur=3, max=5
    buf[0x28] = 3; buf[0x29] = 0; // cur0
    buf[0x2a] = 5; buf[0x2b] = 0; // max0
    // Set Air (school 2): cur=2, max=4
    buf[0x30] = 2; buf[0x31] = 0; // cur2
    buf[0x32] = 4; buf[0x33] = 0; // max2

    const decoded = decodeBssStruct(CHARACTER_RECORD, buf, 0, registry);

    // With the correct stride-4 layout:
    // school_mana_cur should be [3, 0, 2, 0, 0, 0] (Fire=3, Water=0, Air=2, ...)
    // school_mana_max should be [5, 0, 4, 0, 0, 0]
    //
    // With the buggy stride-2 layout:
    // school_mana_cur reads [3, 5, 0, 0, 2, 4] — mixing cur and max!
    expect(decoded.school_mana_cur).toEqual([3, 0, 2, 0, 0, 0]);
    expect(decoded.school_mana_max).toEqual([5, 0, 4, 0, 0, 0]);
  });

  it('school_mana_max reads max values and does not overlap with cur', () => {
    const buf = new Uint8Array(CHARACTER_RECORD.bytes);
    // Fire: cur=1, max=2; Water: cur=3, max=4
    buf[0x28] = 1; buf[0x29] = 0;
    buf[0x2a] = 2; buf[0x2b] = 0;
    buf[0x2c] = 3; buf[0x2d] = 0;
    buf[0x2e] = 4; buf[0x2f] = 0;

    const decoded = decodeBssStruct(CHARACTER_RECORD, buf, 0, registry);
    // cur = [1, 3, 0, 0, 0, 0]  (cur at stride-4 positions)
    // max = [2, 4, 0, 0, 0, 0]  (max at stride-4 positions)
    expect(decoded.school_mana_cur).toEqual([1, 3, 0, 0, 0, 0]);
    expect(decoded.school_mana_max).toEqual([2, 4, 0, 0, 0, 0]);
  });
});
