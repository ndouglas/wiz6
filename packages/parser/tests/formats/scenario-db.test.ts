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
