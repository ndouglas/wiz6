import { describe, expect, it } from 'vitest';
import { MessageDbSchema, MessageRecordSchema } from '../src/schemas/message-db.js';

describe('MessageRecordSchema', () => {
  it('accepts a valid record', () => {
    expect(() =>
      MessageRecordSchema.parse({ index: 0, compressedBytes: 5, decodedText: 'HUMAN' }),
    ).not.toThrow();
  });

  it('accepts an empty decoded text', () => {
    expect(() =>
      MessageRecordSchema.parse({ index: 18, compressedBytes: 0, decodedText: '' }),
    ).not.toThrow();
  });

  it('rejects negative index', () => {
    expect(() =>
      MessageRecordSchema.parse({ index: -1, compressedBytes: 5, decodedText: 'X' }),
    ).toThrow();
  });
});

describe('MessageDbSchema', () => {
  const validRec = { index: 0, compressedBytes: 5, decodedText: 'HUMAN' };

  it('accepts a valid db', () => {
    expect(() =>
      MessageDbSchema.parse({
        id: 'msg',
        sourceFile: 'msg.dbs',
        treeSourceFile: 'misc.hdr',
        recordCount: 1,
        records: [validRec],
      }),
    ).not.toThrow();
  });

  it('rejects when recordCount does not match records.length', () => {
    expect(() =>
      MessageDbSchema.parse({
        id: 'msg',
        sourceFile: 'msg.dbs',
        treeSourceFile: 'misc.hdr',
        recordCount: 2,
        records: [validRec],
      }),
    ).toThrow();
  });

  it('rejects empty id', () => {
    expect(() =>
      MessageDbSchema.parse({
        id: '',
        sourceFile: 'msg.dbs',
        treeSourceFile: 'misc.hdr',
        recordCount: 1,
        records: [validRec],
      }),
    ).toThrow();
  });

  it('rejects empty sourceFile', () => {
    expect(() =>
      MessageDbSchema.parse({
        id: 'msg',
        sourceFile: '',
        treeSourceFile: 'misc.hdr',
        recordCount: 1,
        records: [validRec],
      }),
    ).toThrow();
  });
});
