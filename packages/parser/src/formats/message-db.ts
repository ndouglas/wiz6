import { MessageDbSchema, type MessageDb } from '@wiz6/data';

const EXPECTED_TREE_SIZE = 1024;

/**
 * Decompress a Huffman bit stream using a tree stored in `misc.hdr` format:
 * 256 nodes × 4 bytes each. Each node is two 16-bit little-endian links
 * (left, right). If a link's high bit (0x8000) is set, it's an internal-node
 * link whose target byte-offset is `(-link) * 4` (treating link as a negative
 * 16-bit value). Otherwise the link is a leaf and its low byte is the
 * character to emit.
 *
 * Mirrors the wroot.exe `FUN_33e9` decoder identified during Stage 1f.
 */
export function huffmanDecode(tree: Uint8Array, bitStream: Uint8Array, maxOutput = 4096): string {
  if (tree.length !== EXPECTED_TREE_SIZE) {
    throw new Error(`huffman tree expected ${EXPECTED_TREE_SIZE} bytes, got ${tree.length}`);
  }
  const out: number[] = [];
  let bx = 0; // node byte-offset in tree
  let si = 0; // byte offset in bitStream
  let bitBuf = 0;
  let bitsLeft = 0;
  while (out.length < maxOutput) {
    if (bitsLeft === 0) {
      if (si >= bitStream.length) break;
      bitBuf = bitStream[si]!;
      si += 1;
      bitsLeft = 8;
    }
    const bit = (bitBuf >> 7) & 1;
    bitBuf = (bitBuf << 1) & 0xff;
    bitsLeft -= 1;
    const lo = tree[bx + (bit ? 2 : 0)] ?? 0;
    const hi = tree[bx + (bit ? 3 : 1)] ?? 0;
    const link = lo | (hi << 8);
    if (link & 0x8000) {
      // Internal node: target byte-offset = neg16(link) * 4.
      const neg = (-link) & 0xffff;
      bx = neg * 4;
    } else {
      out.push(link & 0xff);
      bx = 0;
    }
  }
  // Convert byte sequence to a string. The decoded bytes are ASCII (0..127)
  // in the leaves we inspected; just in case, use latin-1 round-tripping.
  return String.fromCharCode(...out);
}

export interface DecodeMessageDbOpts {
  id: string;
  sourceFile: string;
  treeSourceFile: string;
}

export function decodeMessageDb(
  dbsBytes: Uint8Array,
  treeBytes: Uint8Array,
  opts: DecodeMessageDbOpts,
): MessageDb {
  const records: MessageDb['records'] = [];
  let pos = 0;
  let index = 0;
  while (pos < dbsBytes.length) {
    const length = dbsBytes[pos]!;
    if (length === 0) {
      // Empty record: a single 0x00 length byte with no payload.
      records.push({ index, compressedBytes: 0, decodedText: '' });
      pos += 1;
      index += 1;
      continue;
    }
    if (pos + length > dbsBytes.length) {
      // Trailing partial record — stop. The remaining bytes are padding.
      break;
    }
    const payload = dbsBytes.subarray(pos + 1, pos + length);
    const decoded = huffmanDecode(treeBytes, payload);
    records.push({
      index,
      compressedBytes: payload.length,
      decodedText: decoded,
    });
    pos += length;
    index += 1;
  }
  return MessageDbSchema.parse({
    id: opts.id,
    sourceFile: opts.sourceFile,
    treeSourceFile: opts.treeSourceFile,
    recordCount: records.length,
    records,
  });
}
