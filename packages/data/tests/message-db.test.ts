import { describe, expect, it } from 'vitest';
import {
  MessageDbSchema,
  MessageRecordSchema,
  IndexedMessageSchema,
} from '../src/schemas/message-db.js';

const validRec = { index: 0, compressedBytes: 5, decodedText: 'HUMAN' };
const validIndexed = {
  index: 0,
  byteOffset: 100,
  charOffset: 0,
  raw: 10,
  sectionIndex: 0,
  decodedText: 'HUMAN',
};
const baseDb = {
  id: 'msg',
  sourceFile: 'msg.dbs',
  treeSourceFile: 'misc.hdr',
  indexSourceFile: 'msg.hdr',
  recordCount: 1,
  records: [validRec],
  indexedCount: 1,
  indexedMessages: [validIndexed],
};

describe('MessageRecordSchema', () => {
  it('accepts a valid record', () => {
    expect(() => MessageRecordSchema.parse(validRec)).not.toThrow();
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

describe('IndexedMessageSchema', () => {
  it('accepts a valid indexed message', () => {
    expect(() => IndexedMessageSchema.parse(validIndexed)).not.toThrow();
  });

  it('rejects negative byteOffset', () => {
    expect(() =>
      IndexedMessageSchema.parse({ ...validIndexed, byteOffset: -1 }),
    ).toThrow();
  });
});

describe('MessageDbSchema', () => {
  it('accepts a valid db', () => {
    expect(() => MessageDbSchema.parse(baseDb)).not.toThrow();
  });

  it('rejects when recordCount does not match records.length', () => {
    expect(() =>
      MessageDbSchema.parse({ ...baseDb, recordCount: 2 }),
    ).toThrow();
  });

  it('rejects when indexedCount does not match indexedMessages.length', () => {
    expect(() =>
      MessageDbSchema.parse({ ...baseDb, indexedCount: 2 }),
    ).toThrow();
  });

  it('rejects empty id', () => {
    expect(() => MessageDbSchema.parse({ ...baseDb, id: '' })).toThrow();
  });

  it('rejects empty sourceFile', () => {
    expect(() => MessageDbSchema.parse({ ...baseDb, sourceFile: '' })).toThrow();
  });

  it('rejects empty indexSourceFile', () => {
    expect(() => MessageDbSchema.parse({ ...baseDb, indexSourceFile: '' })).toThrow();
  });
});
