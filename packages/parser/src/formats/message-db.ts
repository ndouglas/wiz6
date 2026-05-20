import { MessageDbSchema, type MessageDb, type IndexedMessage } from '@wiz6/data';

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
  return huffmanDecodeRange(tree, bitStream, 0, bitStream.length, maxOutput);
}

/**
 * Like `huffmanDecode`, but decodes only the bytes in [startByte, endByte) of
 * the bit stream. Used by the msg.hdr-based indexed-message decoder, which
 * treats msg.dbs as one continuous bit stream with byte offsets per message.
 */
export function huffmanDecodeRange(
  tree: Uint8Array,
  bitStream: Uint8Array,
  startByte: number,
  endByte: number,
  maxOutput = 65536,
): string {
  if (tree.length !== EXPECTED_TREE_SIZE) {
    throw new Error(`huffman tree expected ${EXPECTED_TREE_SIZE} bytes, got ${tree.length}`);
  }
  const out: number[] = [];
  let bx = 0;
  let si = startByte;
  let bitBuf = 0;
  let bitsLeft = 0;
  while (out.length < maxOutput) {
    if (bitsLeft === 0) {
      if (si >= endByte || si >= bitStream.length) break;
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
      const neg = (-link) & 0xffff;
      bx = neg * 4;
    } else {
      out.push(link & 0xff);
      bx = 0;
    }
  }
  return String.fromCharCode(...out);
}

export interface DecodeMessageDbOpts {
  id: string;
  sourceFile: string;
  treeSourceFile: string;
  indexSourceFile: string;
}

interface HdrEntry {
  byteOffset: number; // col_a
  charOffset: number; // col_b
  raw: number;        // col_c
}

/**
 * Parse msg.hdr (Stage 1g.1 finding):
 *   - 2-byte WORD header: entry count (typically 718)
 *   - count × 6-byte records: (WORD byteOffset, WORD charOffset, WORD raw)
 *   - trailing zero padding to round out the file
 *
 * Each entry describes one indexed message. Multiple consecutive entries with
 * monotonically-increasing charOffset belong to the same "section"; when
 * charOffset resets to a smaller value, a new section begins. Within a
 * section, the msg.dbs bytes between consecutive byteOffsets form a single
 * continuous Huffman bit stream, and each message occupies the chars from its
 * own charOffset to the next entry's charOffset (or end of section).
 */
function parseMsgHdr(hdrBytes: Uint8Array): HdrEntry[] {
  if (hdrBytes.length < 2) return [];
  const count = hdrBytes[0]! | (hdrBytes[1]! << 8);
  const entries: HdrEntry[] = [];
  for (let i = 0; i < count; i++) {
    const base = 2 + i * 6;
    if (base + 6 > hdrBytes.length) break;
    const a = hdrBytes[base]!     | (hdrBytes[base + 1]! << 8);
    const b = hdrBytes[base + 2]! | (hdrBytes[base + 3]! << 8);
    const c = hdrBytes[base + 4]! | (hdrBytes[base + 5]! << 8);
    entries.push({ byteOffset: a, charOffset: b, raw: c });
  }
  return entries;
}

function decodeIndexedMessages(
  dbsBytes: Uint8Array,
  treeBytes: Uint8Array,
  hdrBytes: Uint8Array,
): IndexedMessage[] {
  const entries = parseMsgHdr(hdrBytes);
  if (entries.length === 0) return [];

  // Find section boundaries: each section begins at the first entry, then at
  // any entry where charOffset is less than the previous entry's charOffset.
  const sectionStarts: number[] = [0];
  for (let i = 1; i < entries.length; i++) {
    if (entries[i]!.charOffset < entries[i - 1]!.charOffset) {
      sectionStarts.push(i);
    }
  }

  // P99 compressed message size in the real msg.dbs file is ~200 bytes; the
  // last section has no "next section" byteOffset to bound it, so cap to a
  // few hundred bytes past its last entry to avoid decoding all of msg.dbs's
  // trailing data into one giant blob. (Without this cap, the last indexed
  // message in real data is many KB of unrelated text.)
  const LAST_SECTION_CAP = 256;

  const messages: IndexedMessage[] = [];
  for (let s = 0; s < sectionStarts.length; s++) {
    const start = sectionStarts[s]!;
    const end = s + 1 < sectionStarts.length ? sectionStarts[s + 1]! : entries.length;
    const byteStart = entries[start]!.byteOffset;
    const byteEnd =
      end < entries.length
        ? entries[end]!.byteOffset
        : Math.min(dbsBytes.length, entries[end - 1]!.byteOffset + LAST_SECTION_CAP);
    const sectionText = huffmanDecodeRange(treeBytes, dbsBytes, byteStart, byteEnd);
    for (let i = start; i < end; i++) {
      const cs = entries[i]!.charOffset;
      const ce = i + 1 < end ? entries[i + 1]!.charOffset : sectionText.length;
      const decodedText = sectionText.slice(cs, ce);
      messages.push({
        index: i,
        byteOffset: entries[i]!.byteOffset,
        charOffset: cs,
        raw: entries[i]!.raw,
        sectionIndex: s,
        decodedText,
      });
    }
  }
  return messages;
}

export function decodeMessageDb(
  dbsBytes: Uint8Array,
  treeBytes: Uint8Array,
  hdrBytes: Uint8Array,
  opts: DecodeMessageDbOpts,
): MessageDb {
  const records: MessageDb['records'] = [];
  let pos = 0;
  let index = 0;
  while (pos < dbsBytes.length) {
    const length = dbsBytes[pos]!;
    if (length === 0) {
      records.push({ index, compressedBytes: 0, decodedText: '' });
      pos += 1;
      index += 1;
      continue;
    }
    if (pos + length > dbsBytes.length) break;
    const payload = dbsBytes.subarray(pos + 1, pos + length);
    const decoded = huffmanDecode(treeBytes, payload);
    records.push({ index, compressedBytes: payload.length, decodedText: decoded });
    pos += length;
    index += 1;
  }

  const indexedMessages = decodeIndexedMessages(dbsBytes, treeBytes, hdrBytes);

  return MessageDbSchema.parse({
    id: opts.id,
    sourceFile: opts.sourceFile,
    treeSourceFile: opts.treeSourceFile,
    indexSourceFile: opts.indexSourceFile,
    recordCount: records.length,
    records,
    indexedCount: indexedMessages.length,
    indexedMessages,
  });
}
