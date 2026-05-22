import { PicSchema, type Pic, type PicOp, type PicSegment } from '@wiz6/data';

export interface DecodePicOpts {
  id: string;
  sourceFile: string;
}

/**
 * Decode the outer envelope of a `.pic` file: a byte-stream consisting of
 * one or more segments, where each segment is a sequence of opcodes
 * terminated by 0x00:
 *
 *   op == 0x00       END this segment (return to caller)
 *   op  < 0x80       LIT(op): copy `op` raw bytes verbatim into segment output
 *   op >= 0x80       RUN(256 - op, fill = next_byte()): emit (256 - op)
 *                    copies of the FOLLOWING byte
 *
 * After decoding a segment, the first 4 bytes of the segment's decoded
 * output are interpreted as a caller-side header:
 *   [pos_lo, pos_hi, W, H]
 * where pos is u16 LE and W, H are sprite dimensions (interpretation TBD).
 *
 * Multi-segment files (mon50, credits, etc.) are decoded by looping until
 * the source bytes are exhausted: each `0x00` ends the current segment,
 * then a new segment starts at the next byte.
 *
 * See `docs/re/pic.md` "Decoder source" section for the disassembled
 * EGA-driver implementation this mirrors.
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
        // LIT(op): copy `op` bytes verbatim
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
        // RUN(256 - op, fill = next_byte())
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

    if (!segmentTerminated && ops.length === 0) {
      // Trailing empty bytes? Shouldn't happen on real files. Bail out.
      break;
    }

    let header: PicSegment['header'] = null;
    if (decoded.length >= 4) {
      header = {
        pos: decoded[0]! | (decoded[1]! << 8),
        width: decoded[2]!,
        height: decoded[3]!,
      };
    }

    segments.push({
      segmentIndex,
      encodedOffset: segStart,
      encodedLength: pos - segStart,
      ops,
      decodedBytes: decoded,
      header,
    });
    segmentIndex++;
  }

  return PicSchema.parse({
    id: opts.id,
    sourceFile: opts.sourceFile,
    segments,
    totalBytes: bytes.length,
  });
}
