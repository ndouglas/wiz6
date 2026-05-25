import { describe, expect, it } from 'vitest';
import { PaletteSchema } from '../../src/schemas/palette.js';
import { WIZ6_DUNGEON } from '../../src/palettes/wiz6-dungeon.js';

describe('WIZ6_DUNGEON', () => {
  it('validates against PaletteSchema', () => {
    expect(() => PaletteSchema.parse(WIZ6_DUNGEON)).not.toThrow();
  });

  it('has 16 RGB triples', () => {
    expect(WIZ6_DUNGEON.colors).toHaveLength(16);
  });

  it('has the discovered name and provenance', () => {
    expect(WIZ6_DUNGEON.name).toBe('wiz6-dungeon');
    expect(WIZ6_DUNGEON.provenance).toMatch(/wroot\.exe.*0x2054/);
  });

  it('chains AC -> DAC to the 16 RGB triples the framebuffer actually displays', () => {
    // wiz6-dungeon AC uses DAC indices 0x08..0x0F where wiz6-main uses
    // 0x10..0x17. The BIOS DAC has DAC[8..15] == DAC[16..23] under VGA
    // emulation of EGA mode 0Dh, so the chained RGB is byte-identical to
    // wiz6-main even though the AC bytes differ.
    expect(WIZ6_DUNGEON.colors).toMatchInlineSnapshot(`
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

  it('produces RGB identical to wiz6-main under the BIOS-default DAC (DAC[8..15] == DAC[16..23])', async () => {
    const { WIZ6_MAIN } = await import('../../src/palettes/wiz6-main.js');
    for (let i = 0; i < 16; i++) {
      expect(WIZ6_DUNGEON.colors[i]).toEqual(WIZ6_MAIN.colors[i]);
    }
  });
});
