import { describe, expect, it } from 'vitest';
import { SaveSchema, PositionSchema, type Save } from '../../src/schemas/save.js';
import type { PartyMember } from '../../src/schemas/character.js';

const PM: PartyMember = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Hawkwind',
  race: 0, class: 0, level: 1, xp: 0, gold: 0,
  conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  dead: false, paralyzed: false,
  attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, personality: 50, karma: 50 },
  schoolMana: [0, 0, 0, 0, 0, 0],
  skills: new Array(14).fill(0),
  savedOldLevel: 0, reaction: 0,
};

const VALID: Save = {
  schemaVersion: 1,
  metadata: {
    slotName: 'My adventure',
    timestamp: '2026-05-25T12:00:00.000Z',
    portVersion: '0.0.0',
  },
  party: [PM],
  position: {
    zone: 0, level: 0, x: 0, y: 0, globalX: 0, globalY: 0, facing: 0,
  },
  scenarioFlags: {},
  mazeState: {},
};

describe('PositionSchema', () => {
  it('accepts the engine-default position', () => {
    expect(() => PositionSchema.parse(VALID.position)).not.toThrow();
  });

  it('rejects negative coordinates', () => {
    expect(() => PositionSchema.parse({ ...VALID.position, x: -1 })).toThrow();
  });

  it('rejects out-of-range facing (>3)', () => {
    expect(() => PositionSchema.parse({ ...VALID.position, facing: 4 })).toThrow();
  });
});

describe('SaveSchema', () => {
  it('accepts a fully-populated valid save', () => {
    expect(() => SaveSchema.parse(VALID)).not.toThrow();
  });

  it('rejects wrong schemaVersion', () => {
    expect(() => SaveSchema.parse({ ...VALID, schemaVersion: 2 })).toThrow();
  });

  it('rejects party of size > 6', () => {
    expect(() => SaveSchema.parse({
      ...VALID,
      party: new Array(7).fill(PM),
    })).toThrow();
  });

  it('rejects non-ISO timestamp', () => {
    expect(() => SaveSchema.parse({
      ...VALID,
      metadata: { ...VALID.metadata, timestamp: 'yesterday' },
    })).toThrow();
  });

  it('accepts an optional rngSeed', () => {
    expect(() => SaveSchema.parse({
      ...VALID,
      metadata: { ...VALID.metadata, rngSeed: 42 },
    })).not.toThrow();
  });

  it('accepts an empty party', () => {
    expect(() => SaveSchema.parse({ ...VALID, party: [] })).not.toThrow();
  });
});
