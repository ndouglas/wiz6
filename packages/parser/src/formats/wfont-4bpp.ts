import { Font4bppSchema, type Font4bpp } from '@wiz6/data';

const EXPECTED_SIZE = 4096;
const GLYPH_COUNT = 128;
const GLYPH_BYTES = 32;

export interface DecodeWfont4bppOpts {
  id: string;
  sourceFile: string;
}

export function decodeWfont4bpp(bytes: Uint8Array, opts: DecodeWfont4bppOpts): Font4bpp {
  if (bytes.length !== EXPECTED_SIZE) {
    throw new Error(
      `wfont-4bpp decoder expected ${EXPECTED_SIZE} bytes, got ${bytes.length}`,
    );
  }
  const glyphs: number[][] = [];
  for (let g = 0; g < GLYPH_COUNT; g++) {
    const glyph: number[] = [];
    for (let b = 0; b < GLYPH_BYTES; b++) {
      const byte = bytes[g * GLYPH_BYTES + b];
      if (byte === undefined) {
        throw new Error(`unreachable: missing byte at offset ${g * GLYPH_BYTES + b}`);
      }
      glyph.push(byte);
    }
    glyphs.push(glyph);
  }
  return Font4bppSchema.parse({
    id: opts.id,
    sourceFile: opts.sourceFile,
    glyphCount: GLYPH_COUNT,
    glyphs,
  });
}
