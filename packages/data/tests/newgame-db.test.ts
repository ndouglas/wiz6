import { describe, expect, it } from 'vitest';
import { NewgameDbSchema, NewgameRecordSchema } from '../src/schemas/newgame-db.js';

const validBytes = Array(64).fill(0);

describe('NewgameRecordSchema', () => {
  it('accepts a valid record', () => {
    expect(() =>
      NewgameRecordSchema.parse({ index: 0, bytes: validBytes, empty: true }),
    ).not.toThrow();
  });

  it('rejects when bytes length is not 64', () => {
    expect(() =>
      NewgameRecordSchema.parse({ index: 0, bytes: Array(63).fill(0), empty: true }),
    ).toThrow();
  });

  it('rejects a byte > 255', () => {
    const bad = [...validBytes];
    bad[0] = 256;
    expect(() => NewgameRecordSchema.parse({ index: 0, bytes: bad, empty: false })).toThrow();
  });
});

describe('NewgameDbSchema', () => {
  const baseDb = {
    id: 'newgame',
    sourceFile: 'newgame.dbs',
    recordCount: 1,
    records: [{ index: 0, bytes: validBytes, empty: true }],
  };

  it('accepts a valid db', () => {
    expect(() => NewgameDbSchema.parse(baseDb)).not.toThrow();
  });

  it('rejects when recordCount mismatches', () => {
    expect(() => NewgameDbSchema.parse({ ...baseDb, recordCount: 2 })).toThrow();
  });

  it('rejects records not indexed sequentially', () => {
    expect(() =>
      NewgameDbSchema.parse({
        ...baseDb,
        recordCount: 2,
        records: [
          { index: 0, bytes: validBytes, empty: true },
          { index: 5, bytes: validBytes, empty: true },
        ],
      }),
    ).toThrow();
  });
});
