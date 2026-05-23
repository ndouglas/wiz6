import { describe, expect, it } from 'vitest';
import { PaletteSchema } from '../../src/schemas/palette.js';
import { PALETTE_CATALOG, type PaletteName } from '../../src/palettes/index.js';

describe('PALETTE_CATALOG', () => {
  it('includes wiz6-main', () => {
    expect(PALETTE_CATALOG['wiz6-main']).toBeDefined();
    expect(PALETTE_CATALOG['wiz6-main']?.name).toBe('wiz6-main');
  });

  it('includes wiz6-dungeon', () => {
    expect(PALETTE_CATALOG['wiz6-dungeon']).toBeDefined();
    expect(PALETTE_CATALOG['wiz6-dungeon']?.name).toBe('wiz6-dungeon');
  });

  it('includes ega-default', () => {
    expect(PALETTE_CATALOG['ega-default']).toBeDefined();
    expect(PALETTE_CATALOG['ega-default']?.name).toBe('ega-default');
  });

  it('every entry validates against PaletteSchema', () => {
    for (const [key, palette] of Object.entries(PALETTE_CATALOG)) {
      expect(() => PaletteSchema.parse(palette), `${key} should be a valid Palette`).not.toThrow();
    }
  });

  it('every key matches its palette.name', () => {
    for (const [key, palette] of Object.entries(PALETTE_CATALOG)) {
      expect(palette.name, `key ${key}`).toBe(key);
    }
  });

  it('PaletteName type accepts all catalog keys (compile-time only)', () => {
    const names: PaletteName[] = Object.keys(PALETTE_CATALOG) as PaletteName[];
    expect(names.length).toBeGreaterThanOrEqual(3);
  });
});
