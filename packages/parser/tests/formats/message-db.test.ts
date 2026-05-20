import { describe, expect, it } from 'vitest';
import { huffmanDecode, decodeMessageDb } from '../../src/formats/message-db.js';

// Build a minimal tree that decodes 0 -> 'A', 1 -> 'B'.
// Tree must be 1024 bytes (256 nodes × 4). Only node 0 is meaningful here;
// the rest are zero-filled (they'd be interpreted as leaf=0 if reached, but we
// never traverse there in these tiny test streams).
function buildMinimalABTree(): Uint8Array {
  const tree = new Uint8Array(1024);
  // node 0: left = 0x0041 ('A'), right = 0x0042 ('B')
  tree[0] = 0x41; tree[1] = 0x00;
  tree[2] = 0x42; tree[3] = 0x00;
  return tree;
}

describe('huffmanDecode', () => {
  it('decodes 0-bit -> A, 1-bit -> B with the toy tree', () => {
    const tree = buildMinimalABTree();
    // Stream: 0b01010101 = byte 0x55 -> ABABABAB
    const stream = new Uint8Array([0x55]);
    expect(huffmanDecode(tree, stream)).toBe('ABABABAB');
  });

  it('throws if tree size is wrong', () => {
    expect(() => huffmanDecode(new Uint8Array(512), new Uint8Array([0x00])))
      .toThrow(/1024/);
  });

  it('stops at the end of the bit stream', () => {
    const tree = buildMinimalABTree();
    // Stream: just one byte 0x80 = 0b10000000 -> B then AAAAAAA
    const stream = new Uint8Array([0x80]);
    expect(huffmanDecode(tree, stream)).toBe('BAAAAAAA');
  });

  it('handles internal-node traversal', () => {
    // Two-level tree:
    //   node 0: left = 0x0041 ('A'), right = -1 (-> node 4)
    //   node 4: left = 0x0042 ('B'), right = 0x0043 ('C')
    const tree = new Uint8Array(1024);
    tree[0] = 0x41; tree[1] = 0x00;          // root.left = 'A' (leaf)
    tree[2] = 0xff; tree[3] = 0xff;          // root.right -> neg(-1) * 4 = 4
    tree[4] = 0x42; tree[5] = 0x00;          // node 4.left = 'B' (leaf)
    tree[6] = 0x43; tree[7] = 0x00;          // node 4.right = 'C' (leaf)
    // Stream: 0b11_10_11_10 0b_... — let's use 8 bits: 11 10 11 10 = C, B, C, B
    // But each "right -> internal -> leaf" is 2 bits = C or B. Each "left" alone is 'A' = 1 bit.
    // So 0b11101110 (= 0xEE) reads: 1,1 (C), 1,0 (B), 1,1 (C), 1,0 (B) = "CBCB"
    const stream = new Uint8Array([0xEE]);
    expect(huffmanDecode(tree, stream)).toBe('CBCB');
  });
});

describe('decodeMessageDb', () => {
  it('parses length-prefixed records and decodes each', () => {
    const tree = buildMinimalABTree();
    // Two records: each is `length + payload`. Total record size = length byte value.
    // First record: 0x02 followed by 1 payload byte (0x55 -> ABABABAB).
    // Second record: 0x02 followed by 1 payload byte (0x80 -> BAAAAAAA).
    const dbs = new Uint8Array([0x02, 0x55, 0x02, 0x80]);
    const db = decodeMessageDb(dbs, tree, {
      id: 'msg',
      sourceFile: 'msg.dbs',
      treeSourceFile: 'misc.hdr',
    });
    expect(db.recordCount).toBe(2);
    expect(db.records[0]?.decodedText).toBe('ABABABAB');
    expect(db.records[1]?.decodedText).toBe('BAAAAAAA');
    expect(db.records[0]?.compressedBytes).toBe(1);
  });

  it('handles a zero-length sentinel record', () => {
    const tree = buildMinimalABTree();
    // Three records: empty (length=0), then a normal one (length=2).
    const dbs = new Uint8Array([0x00, 0x02, 0x55]);
    const db = decodeMessageDb(dbs, tree, {
      id: 'msg',
      sourceFile: 'msg.dbs',
      treeSourceFile: 'misc.hdr',
    });
    expect(db.recordCount).toBe(2);
    expect(db.records[0]).toEqual({ index: 0, compressedBytes: 0, decodedText: '' });
    expect(db.records[1]?.decodedText).toBe('ABABABAB');
  });

  it('stops cleanly on partial trailing data', () => {
    const tree = buildMinimalABTree();
    // Length byte says 5 but only 2 trailing bytes exist — partial record dropped.
    const dbs = new Uint8Array([0x02, 0x55, 0x05, 0xab]);
    const db = decodeMessageDb(dbs, tree, {
      id: 'msg',
      sourceFile: 'msg.dbs',
      treeSourceFile: 'misc.hdr',
    });
    expect(db.recordCount).toBe(1);
    expect(db.records[0]?.decodedText).toBe('ABABABAB');
  });
});
