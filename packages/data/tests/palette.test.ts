import { describe, expect, it } from 'vitest';
import { PaletteSchema, type Palette } from '../src/index.js';

const validPalette: Palette = {
  name: 'test',
  provenance: 'unit test fixture',
  colors: Array.from({ length: 16 }, () => [0, 0, 0]) as Palette['colors'],
};

describe('PaletteSchema', () => {
  it('accepts a valid 16-color palette with name + provenance', () => {
    expect(() => PaletteSchema.parse(validPalette)).not.toThrow();
  });

  it('rejects a palette with fewer than 16 colors', () => {
    const bad = { ...validPalette, colors: validPalette.colors.slice(0, 15) };
    expect(() => PaletteSchema.parse(bad)).toThrow();
  });

  it('rejects a palette with more than 16 colors', () => {
    const bad = { ...validPalette, colors: [...validPalette.colors, [0, 0, 0]] };
    expect(() => PaletteSchema.parse(bad)).toThrow();
  });

  it('rejects an RGB triple with values outside 0..255', () => {
    const bad = {
      ...validPalette,
      colors: validPalette.colors.map((c, i) => (i === 5 ? [256, 0, 0] : c)),
    };
    expect(() => PaletteSchema.parse(bad)).toThrow();
  });

  it('rejects an RGB tuple that is not length 3', () => {
    const bad = {
      ...validPalette,
      colors: validPalette.colors.map((c, i) => (i === 0 ? [0, 0] : c)),
    };
    expect(() => PaletteSchema.parse(bad)).toThrow();
  });

  it('rejects a palette missing the name field', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { name, ...incomplete } = validPalette;
    expect(() => PaletteSchema.parse(incomplete)).toThrow();
  });

  it('rejects a palette missing the provenance field', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { provenance, ...incomplete } = validPalette;
    expect(() => PaletteSchema.parse(incomplete)).toThrow();
  });
});
