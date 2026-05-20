import { EgaScreenSchema, type EgaScreen } from '@wiz6/data';

const FILE_SIZE = 32768;
const PLANE_BYTES = 8000;
const NUM_PLANES = 4;
const TRAILER_BYTES = 256;
const PAYLOAD_BYTES = PLANE_BYTES * NUM_PLANES; // 32000
const PADDING_BYTES = FILE_SIZE - PAYLOAD_BYTES - TRAILER_BYTES; // 512

export interface DecodeEgaScreenOpts {
  id: string;
  sourceFile: string;
}

export function decodeEgaScreen(bytes: Uint8Array, opts: DecodeEgaScreenOpts): EgaScreen {
  if (bytes.length !== FILE_SIZE) {
    throw new Error(`ega-screen decoder expected ${FILE_SIZE} bytes, got ${bytes.length}`);
  }
  // Verify the trailing 512 bytes are all zero (sanity check).
  for (let i = PAYLOAD_BYTES + TRAILER_BYTES; i < FILE_SIZE; i++) {
    if (bytes[i] !== 0) {
      throw new Error(`ega-screen trailing padding at offset ${i} is non-zero (expected zero pad, got 0x${bytes[i]!.toString(16)})`);
    }
  }
  const planes: number[][] = [];
  for (let p = 0; p < NUM_PLANES; p++) {
    const plane: number[] = new Array(PLANE_BYTES);
    const base = p * PLANE_BYTES;
    for (let i = 0; i < PLANE_BYTES; i++) {
      plane[i] = bytes[base + i]!;
    }
    planes.push(plane);
  }
  const trailer: number[] = new Array(TRAILER_BYTES);
  for (let i = 0; i < TRAILER_BYTES; i++) {
    trailer[i] = bytes[PAYLOAD_BYTES + i]!;
  }
  return EgaScreenSchema.parse({
    id: opts.id,
    sourceFile: opts.sourceFile,
    width: 320,
    height: 200,
    planes,
    trailer,
  });
}
