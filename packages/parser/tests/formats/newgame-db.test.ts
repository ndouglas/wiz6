import { describe, expect, it } from 'vitest';
import { decodeNewgameDb } from '../../src/formats/newgame-db.js';

const RECORD = 64;
const COUNT = 779;
const FILE_SIZE = RECORD * COUNT;

describe('decodeNewgameDb', () => {
  it('parses a file of exactly 779 × 64 = 49856 bytes', () => {
    const bytes = new Uint8Array(FILE_SIZE);
    bytes[0] = 0xab;
    bytes[63] = 0xcd;
    bytes[64] = 0xef; // first byte of record 1
    const db = decodeNewgameDb(bytes, { id: 'newgame', sourceFile: 'newgame.dbs' });
    expect(db.recordCount).toBe(779);
    expect(db.records[0]?.bytes[0]).toBe(0xab);
    expect(db.records[0]?.bytes[63]).toBe(0xcd);
    expect(db.records[1]?.bytes[0]).toBe(0xef);
  });

  it('marks all-zero records as empty', () => {
    const bytes = new Uint8Array(FILE_SIZE);
    bytes[0] = 1; // only record 0 has non-zero data
    const db = decodeNewgameDb(bytes, { id: 'newgame', sourceFile: 'newgame.dbs' });
    expect(db.records[0]?.empty).toBe(false);
    expect(db.records[1]?.empty).toBe(true);
    expect(db.records[778]?.empty).toBe(true);
    const empties = db.records.filter((r) => r.empty).length;
    expect(empties).toBe(778);
  });

  it('records are sequentially indexed 0..778', () => {
    const bytes = new Uint8Array(FILE_SIZE);
    const db = decodeNewgameDb(bytes, { id: 'newgame', sourceFile: 'newgame.dbs' });
    expect(db.records[0]?.index).toBe(0);
    expect(db.records[778]?.index).toBe(778);
  });

  it('throws on wrong file size', () => {
    expect(() =>
      decodeNewgameDb(new Uint8Array(FILE_SIZE - 1), {
        id: 'newgame',
        sourceFile: 'newgame.dbs',
      }),
    ).toThrow(/49856/);
  });
});
