import { describe, it, expect } from 'vitest';
import { PresetSchema, PcFileJsonSchema } from '../../src/schemas/preset.js';

const char = {
  id: '00000000-0000-4000-8000-000000000001', name: 'A', race: 0, class: 0, level: 1,
  savedOldLevel: 0, xp: 0, gold: 0, conditions: new Array(10).fill(0), dead: false, paralyzed: false,
  attributes: { str: 10, int: 10, pie: 10, vit: 10, dex: 10, spd: 10, per: 10, kar: 10 },
  schoolMana: new Array(6).fill(0), schoolManaMax: new Array(6).fill(0), skills: new Array(30).fill(0),
  reaction: 50, sex: 0, portraitIndex: 0,
};

describe('PresetSchema', () => {
  it('accepts a preset of ≤16 characters', () => {
    expect(() => PresetSchema.parse({ schemaVersion: 1, id: 'p1', name: 'Stock', characters: [char] })).not.toThrow();
  });
  it('rejects >16 characters', () => {
    const many = { schemaVersion: 1, id: 'p', name: 'x', characters: new Array(17).fill(char) };
    expect(() => PresetSchema.parse(many)).toThrow();
  });
});

describe('PcFileJsonSchema', () => {
  it('accepts the native export envelope', () => {
    expect(() => PcFileJsonSchema.parse({ format: 'wiz6-pcfile', version: 1, characters: [char] })).not.toThrow();
  });
  it('rejects a wrong format tag', () => {
    expect(() => PcFileJsonSchema.parse({ format: 'nope', version: 1, characters: [] })).toThrow();
  });
  it('rejects >16 characters', () => {
    expect(() => PcFileJsonSchema.parse({ format: 'wiz6-pcfile', version: 1, characters: new Array(17).fill(char) })).toThrow();
  });
});
