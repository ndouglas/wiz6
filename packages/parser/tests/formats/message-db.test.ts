import { describe, expect, it } from 'vitest';
import { huffmanDecode, decodeMessageDb, cleanIndexedText } from '../../src/formats/message-db.js';

// Build a minimal tree that decodes 0 -> 'A', 1 -> 'B'.
// Tree must be 1024 bytes (256 nodes × 4). Only node 0 is meaningful here;
// the rest are zero-filled (they'd be interpreted as leaf=0 if reached, but we
// never traverse there in these tiny test streams).
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
  it('parses length-prefixed records and decodes each', () => {
    const tree = buildMinimalABTree();
    const dbs = new Uint8Array([0x02, 0x55, 0x02, 0x80]);
    const db = decodeMessageDb(dbs, tree, EMPTY_HDR, baseOpts);
    expect(db.recordCount).toBe(2);
    expect(db.records[0]?.decodedText).toBe('ABABABAB');
    expect(db.records[1]?.decodedText).toBe('BAAAAAAA');
    expect(db.records[0]?.compressedBytes).toBe(1);
  });

  it('handles a zero-length sentinel record', () => {
    const tree = buildMinimalABTree();
    const dbs = new Uint8Array([0x00, 0x02, 0x55]);
    const db = decodeMessageDb(dbs, tree, EMPTY_HDR, baseOpts);
    expect(db.recordCount).toBe(2);
    expect(db.records[0]).toEqual({ index: 0, compressedBytes: 0, decodedText: '' });
    expect(db.records[1]?.decodedText).toBe('ABABABAB');
  });

  it('stops cleanly on partial trailing data', () => {
    const tree = buildMinimalABTree();
    const dbs = new Uint8Array([0x02, 0x55, 0x05, 0xab]);
    const db = decodeMessageDb(dbs, tree, EMPTY_HDR, baseOpts);
    expect(db.recordCount).toBe(1);
    expect(db.records[0]?.decodedText).toBe('ABABABAB');
  });

  it('produces zero indexed messages when msg.hdr count is 0', () => {
    const tree = buildMinimalABTree();
    const dbs = new Uint8Array([0x02, 0x55]);
    const db = decodeMessageDb(dbs, tree, EMPTY_HDR, baseOpts);
    expect(db.indexedCount).toBe(0);
    expect(db.indexedMessages).toEqual([]);
  });
});

describe('decodeMessageDb (indexed messages from msg.hdr)', () => {
  it('parses 2-byte count header + 6-byte records', () => {
    const tree = buildMinimalABTree();
    // 32 bytes of "AB" data — when decoded as 0x55 stream gives "ABABABAB"
    // per 1 byte. With 32 bytes we get 256 chars.
    const dbs = new Uint8Array(32).fill(0x55);
    // Two msg.hdr entries: (byteOffset=0, charOffset=0, raw=0) and (1, 4, 0).
    // Section: [0..1), with end at next entry's byteOffset = 1.
    // BUT — for our minimal test we want section to cover bytes 0..1.
    const hdr = new Uint8Array([
      0x02, 0x00,                  // count = 2
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00,   // entry 0: byteOff=0, charOff=0, raw=0
      0x01, 0x00, 0x04, 0x00, 0x00, 0x00,   // entry 1: byteOff=1, charOff=4, raw=0
    ]);
    const db = decodeMessageDb(dbs, tree, hdr, baseOpts);
    expect(db.indexedCount).toBe(2);
    // entry 0 decodes chars [0, 4) of section -> "ABAB"
    expect(db.indexedMessages[0]?.decodedText).toBe('ABAB');
    expect(db.indexedMessages[0]?.byteOffset).toBe(0);
    expect(db.indexedMessages[0]?.charOffset).toBe(0);
    expect(db.indexedMessages[0]?.sectionIndex).toBe(0);
    // entry 1: charOffset=4 < prev charOffset=0? No, 4 > 0, so same section.
    // section spans bytes [0, ?). Section ends at next-section-start or end of entries.
    // No next section -> ends at dbs.length.
    expect(db.indexedMessages[1]?.charOffset).toBe(4);
  });

  it('detects new sections when charOffset resets', () => {
    const tree = buildMinimalABTree();
    const dbs = new Uint8Array(32).fill(0x55);
    // Three entries: (0, 0), (1, 4), (2, 0).
    // entry 2 has charOffset < entry 1's -> new section starts at entry 2.
    const hdr = new Uint8Array([
      0x03, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x04, 0x00, 0x00, 0x00,
      0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    const db = decodeMessageDb(dbs, tree, hdr, baseOpts);
    expect(db.indexedCount).toBe(3);
    expect(db.indexedMessages[0]?.sectionIndex).toBe(0);
    expect(db.indexedMessages[1]?.sectionIndex).toBe(0);
    expect(db.indexedMessages[2]?.sectionIndex).toBe(1);
  });
});

describe('cleanIndexedText', () => {
  it('returns empty unchanged', () => {
    expect(cleanIndexedText('')).toBe('');
  });

  it('returns text starting with uppercase letter unchanged', () => {
    expect(cleanIndexedText('THE SPELL HAS BEEN')).toBe('THE SPELL HAS BEEN');
    expect(cleanIndexedText('YOU CANNOT')).toBe('YOU CANNOT');
  });

  it('returns text starting with digit unchanged', () => {
    expect(cleanIndexedText('1000 GOLD')).toBe('1000 GOLD');
  });

  it('returns text starting with sentence punctuation unchanged', () => {
    expect(cleanIndexedText('"QUOTED"')).toBe('"QUOTED"');
    expect(cleanIndexedText("'SINGLE'")).toBe("'SINGLE'");
    expect(cleanIndexedText('*MARKER*')).toBe('*MARKER*');
    expect(cleanIndexedText('(PAREN)')).toBe('(PAREN)');
  });

  it('strips leading lowercase noise up to first uppercase letter within 10 chars', () => {
    expect(cleanIndexedText('reHE SPELL')).toBe('HE SPELL');
    // Text already starts with uppercase K - no stripping
    expect(cleanIndexedText('KCETIRTHE SPELL')).toBe('KCETIRTHE SPELL');
  });

  it('strips up to first digit within 10 chars', () => {
    expect(cleanIndexedText('aaa1000 GOLD')).toBe('1000 GOLD');
  });

  it('leaves text unchanged when no clean start is within the first 10 chars', () => {
    // 11 lowercase chars then a capital — beyond the 10-char window
    expect(cleanIndexedText('aaaaaaaaaaaTHE')).toBe('aaaaaaaaaaaTHE');
  });

  it('leaves text unchanged when first 10 chars have no recognizable start', () => {
    expect(cleanIndexedText('abc def gh')).toBe('abc def gh');
  });
});
