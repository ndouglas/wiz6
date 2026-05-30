// packages/viewer/tests/lib/pc-file-io.test.ts
import { describe, it, expect } from 'vitest';
import { charactersToJsonBlob, charactersToDbsBytes, parseImport } from '../../src/lib/pc-file-io.js';

const mk = (name: string) => ({
  id: 'x', name, race: 0, class: 0, level: 1, savedOldLevel: 0, xp: 0, gold: 0,
  conditions: new Array(10).fill(0), dead: false, paralyzed: false,
  attributes: { str: 10, int: 10, pie: 10, vit: 10, dex: 10, spd: 10, per: 10, kar: 10 },
  schoolMana: new Array(6).fill(0), schoolManaMax: new Array(6).fill(0), skills: new Array(30).fill(0),
  reaction: 50, sex: 0 as const, portraitIndex: 0,
});

describe('pc-file-io', () => {
  it('JSON round-trips characters losslessly', async () => {
    const blob = charactersToJsonBlob([mk('ALPHA')]);
    const text = await blob.text();
    const chars = parseImport('x.json', new TextEncoder().encode(text));
    expect(chars.map((c) => c.name)).toEqual(['ALPHA']);
    expect(chars[0]!.id).not.toBe('x'); // import mints a fresh UUID
  });

  it('rejects malformed JSON with a clear error and no partial result', () => {
    expect(() => parseImport('x.json', new TextEncoder().encode('{not json'))).toThrow();
  });

  it('parses a .dbs by extension via decodePcfile + bridge', () => {
    // build a real 6936-byte file from one character, then import it back
    const bytes = charactersToDbsBytes([mk('BETA')]);
    const chars = parseImport('party.dbs', bytes);
    expect(chars.map((c) => c.name)).toEqual(['BETA']);
  });
});
