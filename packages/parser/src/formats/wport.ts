import { PortraitSetSchema, type PortraitSet } from '@wiz6/data';

const EXPECTED_SIZE = 4096;
const PORTRAITS_PER_FILE = 8;
const TILES_PER_PORTRAIT = 16;
const TILE_BYTES = 32;

export interface DecodeWportOpts {
  id: string;
  sourceFile: string;
}

export function decodeWport(bytes: Uint8Array, opts: DecodeWportOpts): PortraitSet {
  if (bytes.length !== EXPECTED_SIZE) {
    throw new Error(`wport decoder expected ${EXPECTED_SIZE} bytes, got ${bytes.length}`);
  }
  const portraits = [];
  for (let p = 0; p < PORTRAITS_PER_FILE; p++) {
    const tiles: number[][] = [];
    for (let t = 0; t < TILES_PER_PORTRAIT; t++) {
      const tileBase = (p * TILES_PER_PORTRAIT + t) * TILE_BYTES;
      const tile: number[] = [];
      for (let b = 0; b < TILE_BYTES; b++) {
        const byte = bytes[tileBase + b];
        if (byte === undefined) {
          throw new Error(`unreachable: missing byte at offset ${tileBase + b}`);
        }
        tile.push(byte);
      }
      tiles.push(tile);
    }
    portraits.push({ index: p, tiles });
  }
  return PortraitSetSchema.parse({
    id: opts.id,
    sourceFile: opts.sourceFile,
    portraitCount: PORTRAITS_PER_FILE,
    portraits,
  });
}
