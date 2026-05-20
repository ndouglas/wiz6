import { describe, expect, it } from 'vitest';
import { decodeWport } from '../../src/formats/wport.js';

const ALL_ZEROES = new Uint8Array(4096);

const oneTilePattern = (() => {
  // Synthetic: portrait 0, tile 0, plane 0 byte 0 = 0xff;
  // tile 1 (portrait 0), plane 0 byte 0 = 0xaa;
  // tile 16 (portrait 1), plane 0 byte 0 = 0x55.
  const bytes = new Uint8Array(4096);
  bytes[0] = 0xff;        // portrait 0 tile 0 plane 0 byte 0
  bytes[32 + 0] = 0xaa;   // portrait 0 tile 1 plane 0 byte 0
  bytes[16 * 32 + 0] = 0x55; // portrait 1 tile 0 plane 0 byte 0
  return bytes;
})();

describe('decodeWport', () => {
  it('rejects input that is not exactly 4096 bytes', () => {
    expect(() => decodeWport(new Uint8Array(4095), { id: 'x', sourceFile: 'x' })).toThrow(/4096/);
    expect(() => decodeWport(new Uint8Array(4097), { id: 'x', sourceFile: 'x' })).toThrow(/4096/);
  });

  it('produces 8 portraits with 16 tiles each, all zero for an all-zero input', () => {
    const set = decodeWport(ALL_ZEROES, { id: 'wport1', sourceFile: 'wport1.ega' });
    expect(set.portraitCount).toBe(8);
    expect(set.portraits).toHaveLength(8);
    for (let p = 0; p < 8; p++) {
      expect(set.portraits[p]!.index).toBe(p);
      expect(set.portraits[p]!.tiles).toHaveLength(16);
      for (const tile of set.portraits[p]!.tiles) {
        expect(tile).toEqual(Array(32).fill(0));
      }
    }
  });

  it('reads the synthetic fixture bytes into the correct portrait/tile slots', () => {
    const set = decodeWport(oneTilePattern, { id: 'wport1', sourceFile: 'wport1.ega' });
    expect(set.portraits[0]!.tiles[0]![0]).toBe(0xff);
    expect(set.portraits[0]!.tiles[1]![0]).toBe(0xaa);
    expect(set.portraits[1]!.tiles[0]![0]).toBe(0x55);
  });

  it('preserves id and sourceFile in the output', () => {
    const set = decodeWport(ALL_ZEROES, { id: 'wport1', sourceFile: 'wport1.ega' });
    expect(set.id).toBe('wport1');
    expect(set.sourceFile).toBe('wport1.ega');
  });
});
