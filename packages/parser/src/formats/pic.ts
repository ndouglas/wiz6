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
 * Decode the outer envelope of a `.pic` file into segments + descriptors.
 *
 * Each segment is a sequence of opcodes terminated by 0x00:
 *   op == 0x00       END this segment
 *   op  < 0x80       LIT(op): copy `op` raw bytes
 *   op >= 0x80       RUN(256 - op, fill = next_byte()): emit (256 - op) copies
 *
 * After RLE-decoding all segments, descriptors are parsed from the start
 * of the CONCATENATED decoded buffer: each descriptor is 24 bytes
 * `[pos_lo, pos_hi, W, H, mask×20]`, terminated by a 24-byte all-zero record.
 *
 * See `docs/re/pic.md` "Pixel encoding" and "Multi-segment composition" sections
 * for the disassembled spec this mirrors.
 */
export function decodePic(bytes: Uint8Array, opts: DecodePicOpts): Pic {
  const segments: PicSegment[] = [];
  let pos = 0;
  let segmentIndex = 0;

  while (pos < bytes.length) {
    const segStart = pos;
    const ops: PicOp[] = [];
    const decoded: number[] = [];
    let segmentTerminated = false;

    while (pos < bytes.length) {
      const op = bytes[pos]!;
      pos++;
      if (op === 0x00) {
        segmentTerminated = true;
        break;
      } else if (op < 0x80) {
        if (pos + op > bytes.length) {
          throw new Error(
            `decodePic: truncated LIT at byte ${pos - 1} (need ${op} bytes, ${bytes.length - pos} available)`,
          );
        }
        const litBytes = Array.from(bytes.subarray(pos, pos + op));
        ops.push({ type: 'lit', bytes: litBytes });
        for (const b of litBytes) decoded.push(b);
        pos += op;
      } else {
        const count = 256 - op;
        if (pos >= bytes.length) {
          throw new Error(
            `decodePic: truncated RUN at byte ${pos - 1} (no fill byte available)`,
          );
        }
        const fillByte = bytes[pos]!;
        pos++;
        ops.push({ type: 'run', count, fillByte });
        for (let i = 0; i < count; i++) decoded.push(fillByte);
      }
    }

    if (!segmentTerminated && ops.length === 0) break;

    segments.push({
      segmentIndex,
      encodedOffset: segStart,
      encodedLength: pos - segStart,
      ops,
      decodedBytes: decoded,
    });
    segmentIndex++;
  }

  // Parse descriptors from the concatenated decoded buffer.
  // Descriptors are 24 bytes each, terminated by a 24-byte all-zero record.
  const concatenated: number[] = [];
  for (const s of segments) concatenated.push(...s.decodedBytes);

  const descriptors: PicDescriptor[] = [];
  let descIdx = 0;
  while ((descIdx + 1) * 24 <= concatenated.length) {
    const rec = concatenated.slice(descIdx * 24, (descIdx + 1) * 24);
    if (rec.every((b) => b === 0)) break;
    descriptors.push({
      index: descIdx,
      pos: rec[0]! | (rec[1]! << 8),
      width: rec[2]!,
      height: rec[3]!,
      mask: rec.slice(4),
    });
    descIdx++;
  }

  return PicSchema.parse({
    id: opts.id,
    sourceFile: opts.sourceFile,
    segments,
    descriptors,
    totalBytes: bytes.length,
  });
}
