// packages/parser/tests/formats/encode-pcfile.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePcfile } from '../../src/formats/pcfile.js';
import { encodePcfile, charactersToDecodedPcfile } from '../../src/formats/encode-pcfile.js';
import { pcfileSlotToCharacter } from '../../src/formats/pcfile-character-bridge.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PCFILE = join(HERE, '..', '..', '..', '..', 'test-fixtures', 'original', 'pcfile.dbs');

describe('encodePcfile', () => {
  it('decode → encode is byte-identical for the stock pcfile.dbs', () => {
    const original = new Uint8Array(readFileSync(PCFILE));
    const decoded = decodePcfile(original);
    const reencoded = encodePcfile(decoded);
    expect(reencoded.length).toBe(original.length); // 6936
    expect(Buffer.from(reencoded).equals(Buffer.from(original))).toBe(true);
  });

  it('produces a 6936-byte file that decodes back to the same slot names', () => {
    const decoded = decodePcfile(new Uint8Array(readFileSync(PCFILE)));
    const bytes = encodePcfile(decoded);
    const back = decodePcfile(bytes);
    expect(back.slots.map((s) => s.name)).toEqual(decoded.slots.map((s) => s.name));
  });

  it('Character[] → file → decode round-trips field-equal', () => {
    const original = decodePcfile(new Uint8Array(readFileSync(PCFILE)));
    const chars = original.slots.filter((s) => s.populated).map((s, i) => pcfileSlotToCharacter(s, `id${i}`));
    const bytes = encodePcfile(charactersToDecodedPcfile(chars));
    const back = decodePcfile(bytes);
    expect(back.slots.slice(0, chars.length).map((s) => s.name)).toEqual(chars.map((c) => c.name));
    expect(back.slots[0]!.raw[0x19c]).toBe(chars[0]!.portraitIndex);
  });
});
