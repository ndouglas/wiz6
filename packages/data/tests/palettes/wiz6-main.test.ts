import { describe, expect, it } from 'vitest';
import { PaletteSchema } from '../../src/schemas/palette.js';
import { WIZ6_MAIN } from '../../src/palettes/wiz6-main.js';

describe('WIZ6_MAIN', () => {
  it('validates against PaletteSchema', () => {
    expect(() => PaletteSchema.parse(WIZ6_MAIN)).not.toThrow();
  });

  it('has 16 RGB triples', () => {
    expect(WIZ6_MAIN.colors).toHaveLength(16);
  });

  it('has the discovered name and provenance', () => {
    expect(WIZ6_MAIN.name).toBe('wiz6-main');
    expect(WIZ6_MAIN.provenance).toMatch(/wroot\.exe.*0x2043/);
  });

  it('matches the discovered RGB values exactly (snapshot)', () => {
    expect(WIZ6_MAIN.colors).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
          0,
        ],
        [
          170,
          255,
          170,
        ],
        [
          0,
          85,
          170,
        ],
        [
          170,
          85,
          170,
        ],
        [
          170,
          85,
          0,
        ],
        [
          170,
          255,
          0,
        ],
        [
          0,
          255,
          0,
        ],
        [
          0,
          255,
          170,
        ],
        [
          0,
          85,
          0,
        ],
        [
          170,
          170,
          170,
        ],
        [
          0,
          0,
          170,
        ],
        [
          170,
          0,
          170,
        ],
        [
          170,
          0,
          0,
        ],
        [
          170,
          170,
          0,
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
      ]
    `);
  });
});
