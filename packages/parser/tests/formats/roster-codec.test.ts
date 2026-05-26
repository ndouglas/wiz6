import { describe, expect, it } from 'vitest';
import {
  encodeRoster,
  decodeRoster,
  encodeRosterBase64,
  decodeRosterBase64,
} from '../../src/formats/roster-codec.js';
import type { Roster } from '@wiz6/data';

const ROSTER: Roster = {
  schemaVersion: 1,
  characters: [
    {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Thesus',
      race: 0, class: 0, level: 1, xp: 0, gold: 0,
      conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      dead: false, paralyzed: false,
      attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
      schoolMana: [0, 0, 0, 0, 0, 0],
      schoolManaMax: [0, 0, 0, 0, 0, 0],
      skills: new Array(30).fill(0),
      savedOldLevel: 0, reaction: 0,
      sex: 0,
    },
  ],
};

describe('roster-codec', () => {
  it('round-trips encodeRoster / decodeRoster', () => {
    const bytes = encodeRoster(ROSTER);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(decodeRoster(bytes)).toEqual(ROSTER);
  });

  it('round-trips through base64', () => {
    expect(decodeRosterBase64(encodeRosterBase64(ROSTER))).toEqual(ROSTER);
  });

  it('decodeRoster validates against RosterSchema', () => {
    expect(() => decodeRoster(new Uint8Array([1, 2, 3]))).toThrow();
  });

  it('decodes an empty roster', () => {
    const empty: Roster = { schemaVersion: 1, characters: [] };
    expect(decodeRoster(encodeRoster(empty))).toEqual(empty);
  });
});
