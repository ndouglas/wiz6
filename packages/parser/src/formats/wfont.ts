import { FontSchema, type Font } from '@wiz6/data';

const EXPECTED_SIZE = 1024;
const GLYPH_COUNT = 128;
const GLYPH_BYTES = 8;

export interface DecodeWfontOpts {
  id: string;
  sourceFile: string;
}

export function decodeWfont(bytes: Uint8Array, opts: DecodeWfontOpts): Font {
  if (bytes.length !== EXPECTED_SIZE) {
    throw new Error(
      `wfont decoder expected ${EXPECTED_SIZE} bytes, got ${bytes.length}`,
    );
  }
  const glyphs: number[][] = [];
  for (let g = 0; g < GLYPH_COUNT; g++) {
    const glyph: number[] = [];
    for (let r = 0; r < GLYPH_BYTES; r++) {
      const byte = bytes[g * GLYPH_BYTES + r];
      if (byte === undefined) {
        throw new Error(`unreachable: missing byte at offset ${g * GLYPH_BYTES + r}`);
      }
      glyph.push(byte);
    }
    glyphs.push(glyph);
  }
  return FontSchema.parse({
    id: opts.id,
    sourceFile: opts.sourceFile,
    glyphCount: GLYPH_COUNT,
    glyphs,
  });
}
