import { describe, expect, it } from 'vitest';
import {
  PortraitSchema,
  PortraitSetSchema,
  type Portrait,
  type PortraitSet,
} from '../src/index.js';

const blankTile = Array(32).fill(0);

const validPortrait: Portrait = {
  index: 0,
  tiles: Array.from({ length: 9 }, () => [...blankTile]),
};

const validSet: PortraitSet = {
  id: 'wport1',
  sourceFile: 'wport1.ega',
  portraitCount: 14,
  portraits: Array.from({ length: 14 }, (_, i) => ({
    index: i,
    tiles: Array.from({ length: 9 }, () => [...blankTile]),
  })),
};

describe('PortraitSchema', () => {
  it('accepts a portrait with index 0 and 9 32-byte tiles', () => {
    expect(() => PortraitSchema.parse(validPortrait)).not.toThrow();
  });

  it('rejects a portrait with fewer than 9 tiles', () => {
    const bad = { ...validPortrait, tiles: validPortrait.tiles.slice(0, 8) };
    expect(() => PortraitSchema.parse(bad)).toThrow();
  });

  it('rejects a portrait whose tile is not 32 bytes', () => {
    const bad = {
      ...validPortrait,
      tiles: validPortrait.tiles.map((t, i) => (i === 0 ? t.slice(0, 31) : t)),
    };
    expect(() => PortraitSchema.parse(bad)).toThrow();
  });

  it('rejects a negative index', () => {
    expect(() => PortraitSchema.parse({ ...validPortrait, index: -1 })).toThrow();
  });
});

describe('PortraitSetSchema', () => {
  it('accepts a valid 14-portrait set', () => {
    expect(() => PortraitSetSchema.parse(validSet)).not.toThrow();
  });

  it('rejects a set whose portraitCount disagrees with portraits.length', () => {
    const bad = { ...validSet, portraitCount: 13 };
    expect(() => PortraitSetSchema.parse(bad)).toThrow();
  });

  it('rejects a set missing the sourceFile field', () => {
    const { sourceFile, ...incomplete } = validSet;
    void sourceFile;
    expect(() => PortraitSetSchema.parse(incomplete)).toThrow();
  });
});
