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

  it('chains AC -> DAC to the 16 RGB triples the framebuffer actually displays', () => {
    // AC[i] -> DAC[AC[i]] under VGA_DEFAULT_DAC. The "selected menu row"
    // highlight pushes attr=5; AC[5]=0x16 -> DAC[22] = (255,255,85) yellow,
    // matching what the original game renders.
    expect(WIZ6_MAIN.colors).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
          0,
        ],
        [
          255,
          255,
          255,
        ],
        [
          85,
          85,
          255,
        ],
        [
          255,
          85,
          255,
        ],
        [
          255,
          85,
          85,
        ],
        [
          255,
          255,
          85,
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
          85,
          85,
          85,
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
          85,
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
