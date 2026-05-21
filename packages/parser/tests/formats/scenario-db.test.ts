import { describe, expect, it } from 'vitest';
import { decodeScenarioDb } from '../../src/formats/scenario-db.js';

const XP_TOTAL = 14 * 16 * 4; // 896
const ITEM_TOTAL = 500 * 74; // 37000
const MIN_SIZE = XP_TOTAL + ITEM_TOTAL; // 37896

function writeU32LE(buf: Uint8Array, off: number, v: number): void {
  buf[off] = v & 0xff;
  buf[off + 1] = (v >>> 8) & 0xff;
  buf[off + 2] = (v >>> 16) & 0xff;
  buf[off + 3] = (v >>> 24) & 0xff;
}

function writeU16LE(buf: Uint8Array, off: number, v: number): void {
  buf[off] = v & 0xff;
  buf[off + 1] = (v >>> 8) & 0xff;
}

function writeAscii(buf: Uint8Array, off: number, s: string): void {
  for (let i = 0; i < s.length; i++) buf[off + i] = s.charCodeAt(i);
}

describe('decodeScenarioDb', () => {
  it('parses XP tables as 14 classes × 16 levels × u32 LE', () => {
    const bytes = new Uint8Array(MIN_SIZE);
    // Class 0, level 0 = 1000; class 0, level 7 = 128000
    writeU32LE(bytes, 0, 1000);
    writeU32LE(bytes, 7 * 4, 128000);
    // Class 1, level 0 = 1250
    writeU32LE(bytes, 64, 1250);
    // Class 13, level 15 (last entry)
    writeU32LE(bytes, 13 * 64 + 15 * 4, 9999999);
    const db = decodeScenarioDb(bytes, { id: 'scenario', sourceFile: 'scenario.dbs' });
    expect(db.xpTables).toHaveLength(14);
    expect(db.xpTables[0]?.levels[0]).toBe(1000);
    expect(db.xpTables[0]?.levels[7]).toBe(128000);
    expect(db.xpTables[1]?.levels[0]).toBe(1250);
    expect(db.xpTables[13]?.levels[15]).toBe(9999999);
  });

  it('parses 500 × 74-byte item records starting at 0x380', () => {
    const bytes = new Uint8Array(MIN_SIZE);
    writeAscii(bytes, 0x0380, 'BROKEN ITEM');
    writeAscii(bytes, 0x03ca, 'DAGGER');
    bytes[0x03d0] = 0; // terminator for name1
    writeAscii(bytes, 0x03d1, 'DAGGERS');
    const db = decodeScenarioDb(bytes, { id: 'scenario', sourceFile: 'scenario.dbs' });
    expect(db.itemCount).toBe(500);
    expect(db.items[0]?.name1).toBe('BROKEN ITEM');
    expect(db.items[0]?.name2).toBe('');
    expect(db.items[1]?.name1).toBe('DAGGER');
    expect(db.items[1]?.name2).toBe('DAGGERS');
  });

  it('confines name2 to the 16-byte name slot (does not read stat bytes as ASCII)', () => {
    // A 15-char name1 exactly fills the slot with name1+null. The byte at
    // offset 16 (first stat byte) must NOT be interpreted as the start of
    // name2, even if it happens to be a printable ASCII character.
    const bytes = new Uint8Array(MIN_SIZE);
    writeAscii(bytes, 0x0380, 'BEARDED WAR AXE');
    bytes[0x0380 + 16] = '2'.charCodeAt(0); // stat byte that looks like ASCII
    const db = decodeScenarioDb(bytes, { id: 'scenario', sourceFile: 'scenario.dbs' });
    expect(db.items[0]?.name1).toBe('BEARDED WAR AXE');
    expect(db.items[0]?.name2).toBe('');
  });

  it('parses item stat fields at fixed offsets', () => {
    const bytes = new Uint8Array(MIN_SIZE);
    writeAscii(bytes, 0x0380, 'LONGSWORD');
    const base = 0x0380;
    writeU16LE(bytes, base + 16, 60); // price 60g
    bytes[base + 24] = 0; // hit bonus
    bytes[base + 26] = 1; // damage dice count
    bytes[base + 27] = 8; // damage dice sides → 1d8
    writeU16LE(bytes, base + 28, 0); // not a scroll/instrument
    bytes[base + 30] = 50; // weight 5.0 lb
    writeU16LE(bytes, base + 54, 0x3fff); // all 14 classes allowed
    bytes[base + 60] = 0; // slot 0 = main-hand weapon
    const db = decodeScenarioDb(bytes, { id: 'scenario', sourceFile: 'scenario.dbs' });
    const it = db.items[0]!;
    expect(it.price).toBe(60);
    expect(it.damageDiceCount).toBe(1);
    expect(it.damageDiceSides).toBe(8);
    expect(it.weight).toBe(50);
    expect(it.classMask).toBe(0x3fff);
    expect(it.equipSlot).toBe(0);
  });

  it('reads scroll spellOrSongId as u16 LE at offset 28', () => {
    const bytes = new Uint8Array(MIN_SIZE);
    writeAscii(bytes, 0x0380, 'MAGIC MISSILE');
    writeU16LE(bytes, 0x0380 + 28, 578);
    bytes[0x0380 + 60] = 13; // slot 13 = scroll
    const db = decodeScenarioDb(bytes, { id: 'scenario', sourceFile: 'scenario.dbs' });
    expect(db.items[0]?.spellOrSongId).toBe(578);
    expect(db.items[0]?.equipSlot).toBe(13);
  });

  it('marks all-zero item records as empty', () => {
    const bytes = new Uint8Array(MIN_SIZE);
    writeAscii(bytes, 0x0380, 'X'); // only record 0 has content
    const db = decodeScenarioDb(bytes, { id: 'scenario', sourceFile: 'scenario.dbs' });
    expect(db.items[0]?.empty).toBe(false);
    expect(db.items[1]?.empty).toBe(true);
    expect(db.items[499]?.empty).toBe(true);
  });

  it('preserves bytes past the item table in unknownTail', () => {
    const bytes = new Uint8Array(MIN_SIZE + 100);
    bytes[MIN_SIZE] = 0xab;
    bytes[MIN_SIZE + 99] = 0xcd;
    const db = decodeScenarioDb(bytes, { id: 'scenario', sourceFile: 'scenario.dbs' });
    expect(db.unknownTail).toHaveLength(100);
    expect(db.unknownTail[0]).toBe(0xab);
    expect(db.unknownTail[99]).toBe(0xcd);
  });

  it('throws when file is smaller than XP tables + item table', () => {
    expect(() =>
      decodeScenarioDb(new Uint8Array(MIN_SIZE - 1), {
        id: 'scenario',
        sourceFile: 'scenario.dbs',
      }),
    ).toThrow(/37896/);
  });
});
