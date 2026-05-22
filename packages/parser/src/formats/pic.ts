import {
  PicSchema,
  type Pic,
  type PicOp,
  type PicSegment,
  type PicDescriptor,
} from '@wiz6/data';

export interface DecodePicOpts {
  id: string;
  sourceFile: string;
}

/**
 * Decode a `.pic` file into a single decoded buffer of cell-atlas bytes.
 *
 * Faithfully mirrors the EGA driver's decoder at ega.drv:0x1C25, including
 * its 4KB source-buffer refill behavior. The decoder uses a 4096-byte source
 * buffer (DOS INT 21h ah=3F reads), and at runtime DROPS the byte at offset
 * 0xFFF every time the buffer refills (the inner-loop check
 * `cmp si, 0xfff; jnc REFILL` jumps to refill BEFORE consuming the byte at
 * SI=0xFFF). This skipped byte never enters the decoded output stream.
 *
 * Opcodes:
 *   op == 0x00       END (terminates ALL decoding)
 *   op  < 0x80       LIT(op): copy `op` raw bytes verbatim
 *   op >= 0x80       RUN(256 - op, fill = next_byte()): emit (256 - op) copies
 *
 * The 0x00 bytes that appear "mid-file" in the encoded stream are NOT
 * segment terminators — they fall inside LIT payloads or RUN fill bytes,
 * OR they land at file offset (4KB*N + 0xFFF) and never reach the inner
 * loop (lost during refill). Phase 1A+B's multi-segment model was wrong;
 * the engine treats every .pic file as a single continuous RLE stream.
 *
 * After RLE-decoding, descriptors are parsed from the start of the buffer:
 * the descriptor table is exactly 25 entries × 24 bytes = 600 bytes,
 * zero-padded for unused entries. Cell atlas begins at offset 0x0258 = 600.
 */
export function decodePic(bytes: Uint8Array, opts: DecodePicOpts): Pic {
  const BUFFER_SIZE = 0x1000; // 4096 bytes
  const BUFFER_LIMIT = 0xfff; // refill trigger — byte at this offset is LOST

  let filePos = 0;
  const refill = (): Uint8Array => {
    const chunk = bytes.subarray(filePos, filePos + BUFFER_SIZE);
    filePos += chunk.length;
    if (chunk.length < BUFFER_SIZE) {
      // Pad with zeros to keep buffer indexing stable. Zeros decode as END,
      // which terminates the loop — matches the engine running out of input.
      const padded = new Uint8Array(BUFFER_SIZE);
      padded.set(chunk);
      return padded;
    }
    return chunk;
  };

  let buffer = refill();
  let si = 0;

  const ops: PicOp[] = [];
  const decoded: number[] = [];

  while (true) {
    // Inner-loop refill check: cmp si, 0xfff; jnc REFILL — the byte at
    // SI=0xfff (= 4095) is never consumed; refill happens BEFORE reading.
    if (si >= BUFFER_LIMIT) {
      if (filePos >= bytes.length) {
        // No more file bytes. Engine would read zeros and terminate at the
        // first 0x00 opcode (= immediately).
        break;
      }
      buffer = refill();
      si = 0;
    }

    const op = buffer[si]!;
    si++;

    if (op === 0x00) {
      break;
    } else if (op < 0x80) {
      // LIT(op): copy `op` bytes from buffer[si..] to output via rep movsb.
      // The engine doesn't refill mid-instruction — if SI overflows past 0xFFF
      // during the copy, it reads whatever's in memory beyond the buffer
      // (typically game data or BSS zeros). We model that as reading 0.
      const litBytes: number[] = [];
      for (let i = 0; i < op; i++) {
        const b = si < BUFFER_SIZE ? buffer[si]! : 0;
        litBytes.push(b);
        decoded.push(b);
        si++;
      }
      ops.push({ type: 'lit', bytes: litBytes });
    } else {
      const count = 256 - op;
      const fillByte = si < BUFFER_SIZE ? buffer[si]! : 0;
      si++;
      ops.push({ type: 'run', count, fillByte });
      for (let i = 0; i < count; i++) decoded.push(fillByte);
    }
  }

  // Expose a single "segment" wrapping the entire decoded buffer. The
  // segments[] array is kept for backward-compat with the existing viewer
  // schema; it always has exactly one entry post-fix.
  const segments: PicSegment[] = [
    {
      segmentIndex: 0,
      encodedOffset: 0,
      encodedLength: Math.max(1, bytes.length),
      ops,
      decodedBytes: decoded,
    },
  ];

  // Parse descriptors from the start of the decoded buffer — fixed 25-entry
  // table × 24 bytes = 600 bytes, zero-padded for unused entries. We stop at
  // the first all-zero record (sentinel coincides with unused-slot zeroing).
  const descriptors: PicDescriptor[] = [];
  for (let descIdx = 0; descIdx < 25; descIdx++) {
    const recStart = descIdx * 24;
    if (recStart + 24 > decoded.length) break;
    const rec = decoded.slice(recStart, recStart + 24);
    if (rec.every((b) => b === 0)) break;
    descriptors.push({
      index: descIdx,
      pos: rec[0]! | (rec[1]! << 8),
      width: rec[2]!,
      height: rec[3]!,
      mask: rec.slice(4),
    });
  }

  return PicSchema.parse({
    id: opts.id,
    sourceFile: opts.sourceFile,
    segments,
    descriptors,
    totalBytes: bytes.length,
  });
}
