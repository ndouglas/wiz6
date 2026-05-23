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

  it('matches the discovered RGB values exactly (snapshot)', () => {
    expect(WIZ6_DUNGEON.colors).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
          0,
        ],
        [
          170,
          170,
          255,
        ],
        [
          0,
          0,
          255,
        ],
        [
          170,
          0,
          255,
        ],
        [
          170,
          0,
          85,
        ],
        [
          170,
          170,
          85,
        ],
        [
          0,
          170,
          85,
        ],
        [
          0,
          170,
          255,
        ],
        [
          0,
          0,
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

  it('shares indices 9..15 with wiz6-main', async () => {
    const { WIZ6_MAIN } = await import('../../src/palettes/wiz6-main.js');
    for (let i = 9; i <= 15; i++) {
      expect(WIZ6_DUNGEON.colors[i]).toEqual(WIZ6_MAIN.colors[i]);
    }
  });
});
