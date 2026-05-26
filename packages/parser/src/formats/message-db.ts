import { MessageDbSchema, type MessageDb, type IndexedMessage } from '@wiz6/data';

const EXPECTED_TREE_SIZE = 1024;
const BANK_SIZE = 1024;

/**
 * Decompress a Huffman bit stream using a tree stored in `misc.hdr` format:
 * 256 nodes × 4 bytes each. Each node is two 16-bit little-endian links
 * (left, right). If a link's high bit (0x8000) is set, it's an internal-node
 * link whose target byte-offset is `(-link) * 4` (treating link as a negative
 * 16-bit value). Otherwise the link is a leaf and its low byte is the
 * character to emit.
 *
 * `decodedLen` caps the number of characters emitted. Pass `Infinity` (or a
 * large number) to decode until the bit stream is exhausted.
 *
 * Mirrors the wroot.exe `FUN_33e9` decoder identified during Stage 1f.
 */
export function huffmanDecode(
  tree: Uint8Array,
  bitStream: Uint8Array,
  decodedLen = 4096,
): string {
  return huffmanDecodeRange(tree, bitStream, 0, bitStream.length, decodedLen);
}

/**
 * Like `huffmanDecode`, but decodes only the bytes in [startByte, endByte) of
 * the bit stream.
 */
export function huffmanDecodeRange(
  tree: Uint8Array,
  bitStream: Uint8Array,
  startByte: number,
  endByte: number,
  decodedLen = 65536,
): string {
  if (tree.length !== EXPECTED_TREE_SIZE) {
    throw new Error(`huffman tree expected ${EXPECTED_TREE_SIZE} bytes, got ${tree.length}`);
  }
  const out: number[] = [];
  let bx = 0;
  let si = startByte;
  let bitBuf = 0;
  let bitsLeft = 0;
  while (out.length < decodedLen) {
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

/**
 * msg.hdr range entry (martydill model):
 *   - 2-byte WORD: range count
 *   - count × 6-byte records: (WORD start_id, WORD start_offset, WORD packed)
 *   - packed = (bank_idx << 8) | id_span
 *   - bank_idx: 1KB bank index into msg.dbs
 *   - id_span: number of additional messages in this range (0 = 1 message, 10 = 11 messages)
 *   - start_offset: byte offset of first record within the bank
 */
interface HdrRange {
  startId: number;
  startOffset: number;
  bankIdx: number;
  idSpan: number;
}

function parseMsgHdr(hdrBytes: Uint8Array): HdrRange[] {
  if (hdrBytes.length < 2) return [];
  const count = hdrBytes[0]! | (hdrBytes[1]! << 8);
  const ranges: HdrRange[] = [];
  for (let i = 0; i < count; i++) {
    const base = 2 + i * 6;
    if (base + 6 > hdrBytes.length) break;
    const startId = hdrBytes[base]!     | (hdrBytes[base + 1]! << 8);
    const startOffset = hdrBytes[base + 2]! | (hdrBytes[base + 3]! << 8);
    const packed = hdrBytes[base + 4]! | (hdrBytes[base + 5]! << 8);
    const bankIdx = (packed >> 8) & 0xff;
    const idSpan = packed & 0xff;
    ranges.push({ startId, startOffset, bankIdx, idSpan });
  }
  return ranges;
}

/**
 * Decode one record from a bank at the given position.
 *
 * msg.dbs record format (bank-structured):
 *   [u8 rec_len]        — payload byte count NOT including this byte
 *   [u8 decoded_len]    — number of chars to emit from Huffman decode
 *   [u8 × (rec_len-1)]  — MSB-first Huffman bit stream
 *
 * rec_len = 0 is a sentinel (empty record); treat as empty string.
 * Total bytes consumed = rec_len + 1.
 */
function decodeRecordAt(
  bank: Uint8Array,
  pos: number,
  tree: Uint8Array,
): { text: string; totalBytes: number } {
  const recLen = bank[pos]!;
  if (recLen === 0) {
    return { text: '', totalBytes: 1 };
  }
  const decodedLen = bank[pos + 1]!;
  const payload = bank.subarray(pos + 2, pos + recLen + 1);
  const text = huffmanDecode(tree, payload, decodedLen);
  return { text, totalBytes: recLen + 1 };
}

/**
 * Decode all indexed messages using the bank-structured model from msg.hdr.
 *
 * For each range [start_id .. start_id + id_span] (inclusive), we walk
 * (id_span + 1) consecutive records starting at bank[start_offset].
 */
function decodeIndexedMessages(
  dbsBytes: Uint8Array,
  treeBytes: Uint8Array,
  hdrBytes: Uint8Array,
): IndexedMessage[] {
  const ranges = parseMsgHdr(hdrBytes);
  if (ranges.length === 0) return [];

  const messages: IndexedMessage[] = [];

  for (let rangeIndex = 0; rangeIndex < ranges.length; rangeIndex++) {
    const { startId, startOffset, bankIdx, idSpan } = ranges[rangeIndex]!;
    const bankBase = bankIdx * BANK_SIZE;
    const bank = dbsBytes.subarray(bankBase, bankBase + BANK_SIZE);

    let pos = startOffset;
    for (let delta = 0; delta <= idSpan; delta++) {
      if (pos >= bank.length) break;
      const { text, totalBytes } = decodeRecordAt(bank, pos, treeBytes);
      messages.push({
        id: startId + delta,
        rangeIndex,
        bank: bankIdx,
        offset: pos,
        recordPos: bankBase + pos,
        decodedText: text,
      });
      pos += totalBytes;
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
  // Flat record scan: walk each bank sequentially, emitting one record per
  // [rec_len][decoded_len][payload] triple.
  const records: MessageDb['records'] = [];
  let index = 0;
  for (let bankIdx = 0; bankIdx < Math.ceil(dbsBytes.length / BANK_SIZE); bankIdx++) {
    const bankBase = bankIdx * BANK_SIZE;
    const bank = dbsBytes.subarray(bankBase, bankBase + BANK_SIZE);
    let pos = 0;
    while (pos < bank.length) {
      const recLen = bank[pos]!;
      if (recLen === 0) {
        records.push({ index, compressedBytes: 0, decodedText: '' });
        pos += 1;
        index += 1;
        continue;
      }
      if (pos + recLen + 1 > bank.length) break;
      const decodedLen = bank[pos + 1]!;
      const payload = bank.subarray(pos + 2, pos + recLen + 1);
      const decoded = huffmanDecode(treeBytes, payload, decodedLen);
      records.push({ index, compressedBytes: payload.length, decodedText: decoded });
      pos += recLen + 1;
      index += 1;
    }
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
