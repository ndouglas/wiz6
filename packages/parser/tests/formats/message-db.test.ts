import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { huffmanDecode, decodeMessageDb } from '../../src/formats/message-db.js';

// Build a minimal tree that decodes 0 -> 'A', 1 -> 'B'.
// Tree must be 1024 bytes (256 nodes × 4). Only node 0 is meaningful here;
// the rest are zero-filled.
function buildMinimalABTree(): Uint8Array {
  const tree = new Uint8Array(1024);
  tree[0] = 0x41; tree[1] = 0x00;
  tree[2] = 0x42; tree[3] = 0x00;
  return tree;
}

// An empty msg.hdr (count=0) with no entries.
const EMPTY_HDR = new Uint8Array([0x00, 0x00]);

const baseOpts = {
  id: 'msg',
  sourceFile: 'msg.dbs',
  treeSourceFile: 'misc.hdr',
  indexSourceFile: 'msg.hdr',
};

// Paths to real game files (used by integration tests)
const ORIGINAL_DIR = join(import.meta.dirname, '../../../../original');

describe('huffmanDecode', () => {
  it('decodes 0-bit -> A, 1-bit -> B with the toy tree', () => {
    const tree = buildMinimalABTree();
    const stream = new Uint8Array([0x55]);
    expect(huffmanDecode(tree, stream)).toBe('ABABABAB');
  });

  it('throws if tree size is wrong', () => {
    expect(() => huffmanDecode(new Uint8Array(512), new Uint8Array([0x00])))
      .toThrow(/1024/);
  });

  it('stops at the end of the bit stream', () => {
    const tree = buildMinimalABTree();
    const stream = new Uint8Array([0x80]);
    expect(huffmanDecode(tree, stream)).toBe('BAAAAAAA');
  });

  it('respects decodedLen cap — stops after N chars even if more bits remain', () => {
    const tree = buildMinimalABTree();
    const stream = new Uint8Array([0x55]); // decodes to 'ABABABAB' (8 chars) without cap
    expect(huffmanDecode(tree, stream, 3)).toBe('ABA');
  });

  it('handles internal-node traversal', () => {
    const tree = new Uint8Array(1024);
    tree[0] = 0x41; tree[1] = 0x00;
    tree[2] = 0xff; tree[3] = 0xff;
    tree[4] = 0x42; tree[5] = 0x00;
    tree[6] = 0x43; tree[7] = 0x00;
    const stream = new Uint8Array([0xEE]);
    expect(huffmanDecode(tree, stream)).toBe('CBCB');
  });
});

describe('decodeMessageDb (records)', () => {
  it('parses bank-structured records and decodes each (rec_len does not count itself)', () => {
    const tree = buildMinimalABTree();
    // Bank 0:
    //   rec 0 = [rec_len=2][decoded_len=8][0x55] → payload 1 byte, decode 8 chars → 'ABABABAB'
    //   rec 1 = [rec_len=2][decoded_len=8][0x80] → payload 1 byte, decode 8 chars → 'BAAAAAAA'
    // rec_len counts payload bytes only (NOT the decoded_len byte). Total = rec_len + 1.
    const dbs = new Uint8Array(1024);
    dbs[0] = 0x02; dbs[1] = 0x08; dbs[2] = 0x55;  // rec 0: rec_len=2 → payload=[0x55]
    dbs[3] = 0x02; dbs[4] = 0x08; dbs[5] = 0x80;  // rec 1: rec_len=2 → payload=[0x80]
    const db = decodeMessageDb(dbs, tree, EMPTY_HDR, baseOpts);
    expect(db.records[0]?.decodedText).toBe('ABABABAB');
    expect(db.records[1]?.decodedText).toBe('BAAAAAAA');
    expect(db.records[0]?.compressedBytes).toBe(1);
  });

  it('handles a zero-length sentinel record', () => {
    const tree = buildMinimalABTree();
    const dbs = new Uint8Array(1024);
    dbs[0] = 0x00;                                  // sentinel
    dbs[1] = 0x02; dbs[2] = 0x08; dbs[3] = 0x55;  // rec 1: decode 8 chars
    const db = decodeMessageDb(dbs, tree, EMPTY_HDR, baseOpts);
    expect(db.records[0]).toEqual({ index: 0, compressedBytes: 0, decodedText: '' });
    expect(db.records[1]?.decodedText).toBe('ABABABAB');
  });

  it('stops cleanly when rec_len would exceed bank boundary', () => {
    const tree = buildMinimalABTree();
    // Put a valid rec near the very end of a bank, then a truncated rec that
    // claims more payload bytes than remain in the bank.
    const dbs = new Uint8Array(1024);
    // Valid rec at pos 1020: [rec_len=2][decoded_len=4][0x55] → "ABAB" (total 3 bytes → 1020..1022)
    dbs[1020] = 0x02; dbs[1021] = 0x04; dbs[1022] = 0x55;
    // Truncated rec at pos 1023: rec_len=5 but only 0 bytes follow (1024 - 1023 - 1 = 0)
    dbs[1023] = 0x05;
    const db = decodeMessageDb(dbs, tree, EMPTY_HDR, baseOpts);
    // The 1020 zeros at the start are sentinels; then 1 valid rec; truncated one is dropped
    const populated = db.records.filter((r) => r.compressedBytes > 0);
    expect(populated).toHaveLength(1);
    expect(populated[0]?.decodedText).toBe('ABAB');
  });

  it('produces zero indexed messages when msg.hdr count is 0', () => {
    const tree = buildMinimalABTree();
    const dbs = new Uint8Array(1024);
    dbs[0] = 0x02; dbs[1] = 0x08; dbs[2] = 0x55;
    const db = decodeMessageDb(dbs, tree, EMPTY_HDR, baseOpts);
    expect(db.indexedCount).toBe(0);
    expect(db.indexedMessages).toEqual([]);
  });
});

describe('decodeMessageDb (indexed messages from msg.hdr — bank model)', () => {
  it('decodes a single-message range from bank 0', () => {
    const tree = buildMinimalABTree();
    // Bank 0: rec at offset 0: [rec_len=2][decoded_len=4][0x55] → "ABAB"
    // rec_len=2 means 1 decoded_len byte + 1 payload byte
    const dbs = new Uint8Array(1024);
    dbs[0] = 0x02; dbs[1] = 0x04; dbs[2] = 0x55;
    // msg.hdr: 1 range, start_id=42, start_offset=0, packed=(bank=0 << 8)|id_span=0
    const hdr = new Uint8Array([
      0x01, 0x00,               // count = 1
      0x2a, 0x00,               // start_id = 42
      0x00, 0x00,               // start_offset = 0
      0x00, 0x00,               // packed: bank=0, id_span=0 (1 message)
    ]);
    const db = decodeMessageDb(dbs, tree, hdr, baseOpts);
    expect(db.indexedCount).toBe(1);
    expect(db.indexedMessages[0]?.id).toBe(42);
    expect(db.indexedMessages[0]?.decodedText).toBe('ABAB');
    expect(db.indexedMessages[0]?.rangeIndex).toBe(0);
    expect(db.indexedMessages[0]?.bank).toBe(0);
    expect(db.indexedMessages[0]?.offset).toBe(0);
    expect(db.indexedMessages[0]?.recordPos).toBe(0);
  });

  it('decodes a multi-message range (id_span > 0)', () => {
    const tree = buildMinimalABTree();
    // Bank 0, two consecutive records (each rec_len=2 → 3 bytes total):
    // offset 0: [2][4][0x55] → "ABAB" (4 chars)
    // offset 3: [2][4][0x80] → "BAAA" (4 chars)
    const dbs = new Uint8Array(1024);
    dbs[0] = 0x02; dbs[1] = 0x04; dbs[2] = 0x55;
    dbs[3] = 0x02; dbs[4] = 0x04; dbs[5] = 0x80;
    // Range: start_id=10, start_offset=0, bank=0, id_span=1 (2 messages: 10, 11)
    const hdr = new Uint8Array([
      0x01, 0x00,
      0x0a, 0x00,               // start_id = 10
      0x00, 0x00,               // start_offset = 0
      0x01, 0x00,               // packed: bank=0, id_span=1 (2 messages)
    ]);
    const db = decodeMessageDb(dbs, tree, hdr, baseOpts);
    expect(db.indexedCount).toBe(2);
    expect(db.indexedMessages[0]?.id).toBe(10);
    expect(db.indexedMessages[0]?.decodedText).toBe('ABAB');
    expect(db.indexedMessages[1]?.id).toBe(11);
    expect(db.indexedMessages[1]?.decodedText).toBe('BAAA');
    expect(db.indexedMessages[1]?.offset).toBe(3);
  });

  it('decodes from non-zero bank', () => {
    const tree = buildMinimalABTree();
    const dbs = new Uint8Array(2 * 1024);  // 2 banks
    // Bank 1, offset 5: [rec_len=2][decoded_len=4][0x55] → "ABAB"
    const bank1Base = 1024;
    dbs[bank1Base + 5] = 0x02;
    dbs[bank1Base + 6] = 0x04;
    dbs[bank1Base + 7] = 0x55;
    // Range: start_id=99, start_offset=5, bank=1, id_span=0
    const hdr = new Uint8Array([
      0x01, 0x00,
      0x63, 0x00,               // start_id = 99
      0x05, 0x00,               // start_offset = 5
      0x00, 0x01,               // packed: bank=1, id_span=0
    ]);
    const db = decodeMessageDb(dbs, tree, hdr, baseOpts);
    expect(db.indexedCount).toBe(1);
    expect(db.indexedMessages[0]?.id).toBe(99);
    expect(db.indexedMessages[0]?.bank).toBe(1);
    expect(db.indexedMessages[0]?.offset).toBe(5);
    expect(db.indexedMessages[0]?.recordPos).toBe(bank1Base + 5);
    expect(db.indexedMessages[0]?.decodedText).toBe('ABAB');
  });
});

// Integration tests against real game data — skipped when original/ files are absent.
describe('integration: real msg.dbs (original game data)', () => {
  let tree: Uint8Array;
  let dbs: Uint8Array;
  let hdr: Uint8Array;

  try {
    tree = new Uint8Array(readFileSync(join(ORIGINAL_DIR, 'misc.hdr')));
    dbs  = new Uint8Array(readFileSync(join(ORIGINAL_DIR, 'msg.dbs')));
    hdr  = new Uint8Array(readFileSync(join(ORIGINAL_DIR, 'msg.hdr')));
  } catch {
    // original/ files not present; skip
    it.skip('original game files not present — skipping integration tests', () => {});
    // biome-ignore lint/correctness/noConstantCondition: early exit pattern
    if (true) return;  // stop evaluating the rest of the describe block
  }

  const opts = {
    id: 'msg',
    sourceFile: 'msg.dbs',
    treeSourceFile: 'misc.hdr',
    indexSourceFile: 'msg.hdr',
  };

  it('decodes msg 1130 as "CREATE PC"', () => {
    const db = decodeMessageDb(dbs, tree, hdr, opts);
    const msg = db.indexedMessages.find((m) => m.id === 1130);
    expect(msg?.decodedText).toBe('CREATE PC');
  });

  it('Range 0 yields 11 race names in order', () => {
    const db = decodeMessageDb(dbs, tree, hdr, opts);
    const expected = ['HUMAN', 'ELF', 'DWARF', 'GNOME', 'HOBBIT', 'FAERIE', 'LIZARDMAN', 'DRACON', 'FELPURR', 'RAWULF', 'MOOK'];
    const range0 = db.indexedMessages.filter((m) => m.rangeIndex === 0);
    expect(range0.map((m) => m.decodedText)).toEqual(expected);
  });

  it('total indexed message count is 5161', () => {
    const db = decodeMessageDb(dbs, tree, hdr, opts);
    expect(db.indexedCount).toBe(5161);
  });

  it('msg IDs 1131-1135 decode to menu item names', () => {
    const db = decodeMessageDb(dbs, tree, hdr, opts);
    const expected: [number, string][] = [
      [1131, 'REVIEW PC'],
      [1132, 'DELETE PC'],
      [1133, 'RENAME PC'],
      [1134, 'PORTRAIT'],
      [1135, 'EXIT'],
    ];
    for (const [id, text] of expected) {
      const msg = db.indexedMessages.find((m) => m.id === id);
      expect(msg?.decodedText, `msg ${id}`).toBe(text);
    }
  });
});
