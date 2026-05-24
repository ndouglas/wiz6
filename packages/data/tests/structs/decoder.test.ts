import { describe, expect, it } from 'vitest';
import {
  ALL_STRUCTS,
  buildStructRegistry,
  CHARACTER_RECORD,
  COMBAT_SLOT,
  MONSTER_PREJUDICE,
  POSITION_STATE,
  SOUND_TABLE_ENTRY,
  decodeBssStruct,
  sizeOfType,
  type BssStruct,
} from '../../src/structs/index.js';

/** Build a buffer of given length with predictable byte values for testing. */
function makeBuffer(bytes: readonly number[]): Uint8Array {
  return Uint8Array.from(bytes);
}

describe('BSS struct schemas — declarative invariants', () => {
  it('every struct has unique field offsets', () => {
    for (const s of ALL_STRUCTS) {
      const offsets = new Set<number>();
      for (const f of s.fields) {
        expect(offsets.has(f.offset), `${s.name}.${f.name} offset 0x${f.offset.toString(16)} collides`).toBe(false);
        offsets.add(f.offset);
      }
    }
  });

  it('every field fits within its struct size', () => {
    const registry = buildStructRegistry(ALL_STRUCTS);
    for (const s of ALL_STRUCTS) {
      for (const f of s.fields) {
        const size = sizeOfType(f.type, registry);
        expect(
          f.offset + size,
          `${s.name}.${f.name} at +0x${f.offset.toString(16)} (size ${size}) overflows struct size 0x${s.bytes.toString(16)}`,
        ).toBeLessThanOrEqual(s.bytes);
      }
    }
  });

  it('struct names are unique', () => {
    const names = new Set<string>();
    for (const s of ALL_STRUCTS) {
      expect(names.has(s.name), `duplicate struct name ${s.name}`).toBe(false);
      names.add(s.name);
    }
  });
});

describe('decodeBssStruct — sound_table_entry', () => {
  it('decodes a 12-byte entry into named fields', () => {
    // alias_id=0x0204, reserved=0, buf_lo=0x1234, buf_hi=0x5678,
    // duration=0x00C8 (200), rate_or_vol=0x4B, flags=0x02
    const buf = makeBuffer([
      0x04, 0x02, // alias_id = 0x0204
      0x00, 0x00, // reserved
      0x34, 0x12, // buf_lo = 0x1234
      0x78, 0x56, // buf_hi = 0x5678
      0xc8, 0x00, // duration = 200
      0x4b,       // rate_or_vol = 75
      0x02,       // flags
    ]);
    const decoded = decodeBssStruct(SOUND_TABLE_ENTRY, buf);
    expect(decoded).toEqual({
      alias_id: 0x0204,
      reserved_or_status: 0,
      buf_lo: 0x1234,
      buf_hi: 0x5678,
      duration: 200,
      rate_or_vol: 75,
      flags: 2,
    });
  });

  it('throws on buffer too small', () => {
    expect(() => decodeBssStruct(SOUND_TABLE_ENTRY, makeBuffer([0, 1, 2, 3]))).toThrow(/need 12 bytes/);
  });
});

describe('decodeBssStruct — monster_prejudice with array field', () => {
  it('decodes three target IDs', () => {
    const buf = makeBuffer([0x80, 0x97, 0x00]);
    const decoded = decodeBssStruct(MONSTER_PREJUDICE, buf);
    expect(decoded.slots).toEqual([0x80, 0x97, 0x00]);
  });
});

describe('decodeBssStruct — combat_slot', () => {
  it('extracts HP/SP/initiative correctly', () => {
    // Build a 44-byte buffer with known field values.
    const buf = new Uint8Array(0x2c);
    // HP current=42 at 0x00, max=100 at 0x02
    buf[0x00] = 42; buf[0x01] = 0;
    buf[0x02] = 100; buf[0x03] = 0;
    // SP current=5 at 0x04, max=10 at 0x06
    buf[0x04] = 5; buf[0x05] = 0;
    buf[0x06] = 10; buf[0x07] = 0;
    // status_level=3 at 0x08
    buf[0x08] = 3; buf[0x09] = 0;
    // status_flags=0x0010 at 0x0a (some flag bit)
    buf[0x0a] = 0x10; buf[0x0b] = 0;
    // action_queue at 0x18..0x1b = [1, 2, 0, 0]
    buf[0x18] = 1; buf[0x19] = 2; buf[0x1a] = 0; buf[0x1b] = 0;
    // initiative=72 at 0x25
    buf[0x25] = 72;
    const decoded = decodeBssStruct(COMBAT_SLOT, buf);
    expect(decoded.hp_current).toBe(42);
    expect(decoded.hp_max).toBe(100);
    expect(decoded.sp_current).toBe(5);
    expect(decoded.sp_max).toBe(10);
    expect(decoded.status_level).toBe(3);
    expect(decoded.status_flags).toBe(0x10);
    expect(decoded.action_queue).toEqual([1, 2, 0, 0]);
    expect(decoded.initiative).toBe(72);
  });
});

describe('decodeBssStruct — character_record name + xp/gold', () => {
  it('decodes ASCII name with trailing-null trim', () => {
    const buf = new Uint8Array(CHARACTER_RECORD.bytes);
    // "Bishop\0\0..."
    const name = 'Bishop';
    for (let i = 0; i < name.length; i++) buf[i] = name.charCodeAt(i);
    // XP = 12345 (32-bit LE) at 0x0c
    buf[0x0c] = 0x39; buf[0x0d] = 0x30; buf[0x0e] = 0; buf[0x0f] = 0;
    // Gold = 0x10000 (65536) at 0x10
    buf[0x10] = 0; buf[0x11] = 0; buf[0x12] = 1; buf[0x13] = 0;
    const decoded = decodeBssStruct(CHARACTER_RECORD, buf);
    expect(decoded.name).toBe('Bishop');
    expect(decoded.xp).toBe(12345);
    expect(decoded.gold).toBe(0x10000);
  });
});

describe('decodeBssStruct — position_state', () => {
  it('decodes 12-direction facing + zone position', () => {
    const buf = new Uint8Array(POSITION_STATE.bytes);
    // facing=3 at 0x10 (0x4f9a - 0x4f8a)
    buf[0x10] = 3; buf[0x11] = 0;
    // level=2 at 0x12
    buf[0x12] = 2; buf[0x13] = 0;
    // y=5, x=7
    buf[0x14] = 5; buf[0x15] = 0;
    buf[0x16] = 7; buf[0x17] = 0;
    const decoded = decodeBssStruct(POSITION_STATE, buf);
    expect(decoded.facing).toBe(3);
    expect(decoded.level_z).toBe(2);
    expect(decoded.y).toBe(5);
    expect(decoded.x).toBe(7);
  });
});

describe('decoder — substruct via registry', () => {
  it('resolves a substruct field when registry is supplied', () => {
    const inner: BssStruct = {
      name: 'pair',
      bytes: 4,
      fields: [
        { name: 'lo', offset: 0, type: { kind: 'scalar', scalar: 'u16_le' } },
        { name: 'hi', offset: 2, type: { kind: 'scalar', scalar: 'u16_le' } },
      ],
    };
    const outer: BssStruct = {
      name: 'wrapper',
      bytes: 8,
      fields: [
        { name: 'head', offset: 0, type: { kind: 'scalar', scalar: 'u32_le' } },
        { name: 'tail', offset: 4, type: { kind: 'substruct', structName: 'pair' } },
      ],
    };
    const registry = buildStructRegistry([inner, outer]);
    const buf = new Uint8Array([0, 0, 0, 0, 0x34, 0x12, 0x78, 0x56]);
    const decoded = decodeBssStruct(outer, buf, 0, registry);
    expect(decoded.head).toBe(0);
    expect(decoded.tail).toEqual({ lo: 0x1234, hi: 0x5678 });
  });
});

describe('decoder — enum + bitflags', () => {
  it('enum field decodes raw value to mapped string', () => {
    const s: BssStruct = {
      name: 'tester',
      bytes: 1,
      fields: [
        {
          name: 'kind',
          offset: 0,
          type: {
            kind: 'enum',
            scalar: 'u8',
            values: { 0: 'idle', 1: 'walking', 2: 'fighting' },
          },
        },
      ],
    };
    expect(decodeBssStruct(s, new Uint8Array([0]))).toEqual({ kind: 'idle' });
    expect(decodeBssStruct(s, new Uint8Array([2]))).toEqual({ kind: 'fighting' });
    // Unknown value passes through as the raw number.
    expect(decodeBssStruct(s, new Uint8Array([99]))).toEqual({ kind: 99 });
  });

  it('bitflags decodes to list of set-flag names', () => {
    const s: BssStruct = {
      name: 'tester2',
      bytes: 1,
      fields: [
        {
          name: 'cursed_bits',
          offset: 0,
          type: {
            kind: 'bitflags',
            scalar: 'u8',
            flags: { 0x01: 'cursed', 0x02: 'class_locked', 0x40: 'alignment_locked' },
          },
        },
      ],
    };
    expect(decodeBssStruct(s, new Uint8Array([0x41]))).toEqual({
      cursed_bits: ['cursed', 'alignment_locked'],
    });
    expect(decodeBssStruct(s, new Uint8Array([0x00]))).toEqual({ cursed_bits: [] });
  });
});
