import { describe, expect, it } from 'vitest';
import { PaletteSchema } from '../../src/schemas/palette.js';
import { EGA_DEFAULT } from '../../src/palettes/ega-default.js';

describe('EGA_DEFAULT', () => {
  it('validates against PaletteSchema', () => {
    expect(() => PaletteSchema.parse(EGA_DEFAULT)).not.toThrow();
  });

  it('has 16 RGB triples', () => {
    expect(EGA_DEFAULT.colors).toHaveLength(16);
  });

  it('has correct name and BIOS provenance', () => {
    expect(EGA_DEFAULT.name).toBe('ega-default');
    expect(EGA_DEFAULT.provenance).toMatch(/IBM EGA palette/);
  });

  it('matches the standard EGA palette exactly (snapshot)', () => {
    expect(EGA_DEFAULT.colors).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
          0,
        ],
        [
          0,
          0,
          170,
        ],
        [
          0,
          170,
          0,
        ],
        [
          0,
          170,
          170,
        ],
        [
          170,
          0,
          0,
        ],
        [
          170,
          0,
          170,
        ],
        [
          170,
          85,
          0,
        ],
        [
          170,
          170,
          170,
        ],
        [
          85,
          85,
          85,
        ],
        [
          85,
          85,
          255,
        ],
        [
          85,
          255,
          85,
        ],
        [
          85,
          255,
          255,
        ],
        [
          255,
          85,
          85,
        ],
        [
          255,
          85,
          255,
        ],
        [
          255,
          255,
          85,
        ],
        [
          255,
          255,
          255,
        ],
      ]
    `);
  });
});
