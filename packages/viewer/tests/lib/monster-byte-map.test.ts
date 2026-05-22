import { describe, expect, it } from 'vitest';
import {
  MONSTER_BYTE_MAP,
  byteRangeForField,
  fieldAtOffset,
  type MonsterFieldName,
} from '../../src/lib/monster-byte-map.js';

describe('MONSTER_BYTE_MAP', () => {
  it('no offset is double-claimed', () => {
    const seen = new Set<number>();
    for (const entry of MONSTER_BYTE_MAP) {
      for (let i = 0; i < entry.length; i++) {
        const off = entry.offset + i;
        expect(seen.has(off), `byte ${off} claimed twice (last entry: ${entry.fieldName})`).toBe(false);
        seen.add(off);
      }
    }
  });

  it('all offsets are within statBytes range [0, 158)', () => {
    for (const entry of MONSTER_BYTE_MAP) {
      expect(entry.offset).toBeGreaterThanOrEqual(0);
      expect(entry.offset + entry.length).toBeLessThanOrEqual(158);
    }
  });

  it('every entry has length >= 1', () => {
    for (const entry of MONSTER_BYTE_MAP) {
      expect(entry.length).toBeGreaterThanOrEqual(1);
    }
  });

  it.each([
    'xpOnKill',
    'attack1DiceCount',
    'attack2PoisonChance',
    'attack3DamageBonus',
    'groupDiceCount',
    'hpDiceCount',
    'moveStat',
    'monsterLevel',
    'monsterLevelMax',
    'monsterAC',
    'monsterClass',
    'monsterSubClass',
    'monsterSex',
    'monsterBehaviorClass',
    'creatureKind',
    'spriteGroup',
    'specialAttackElement',
    'goldStat',
    'familyId',
    'saveTable',
    'effectChanceTable',
    'attributeSaves',
    'extendedSaves',
    'combatSpriteId',
    'combatSpriteAlt',
    'secondarySpriteId',
    'magicResistChance',
    'combatTraitId',
    'auxSave103',
    'spellPowerChance',
    'auxSave106',
    'flyEvadeChance',
  ] as MonsterFieldName[])('includes field %s in the byte map', (field) => {
    expect(MONSTER_BYTE_MAP.some((e) => e.fieldName === field)).toBe(true);
  });
});

describe('byteRangeForField', () => {
  it('returns the list of offsets for a single-byte field', () => {
    expect(byteRangeForField('monsterAC')).toEqual([126]);
  });

  it('returns all offsets for a multi-byte field', () => {
    expect(byteRangeForField('saveTable')).toEqual([113, 114, 115, 116, 117]);
    expect(byteRangeForField('familyId')).toEqual([70, 71, 72, 73]);
    expect(byteRangeForField('extendedSaves')).toEqual([85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96]);
  });

  it('returns multiple offsets when one field maps to non-contiguous bytes', () => {
    expect(byteRangeForField('attack1Extra')).toEqual([18, 19]);
  });

  it('returns empty array for unknown field', () => {
    expect(byteRangeForField('totallyMadeUpField' as MonsterFieldName)).toEqual([]);
  });
});

describe('fieldAtOffset', () => {
  it('returns the entry containing the given offset', () => {
    const e = fieldAtOffset(113);
    expect(e?.fieldName).toBe('saveTable');
  });

  it('returns the entry for the middle of a multi-byte range', () => {
    const e = fieldAtOffset(115);
    expect(e?.fieldName).toBe('saveTable');
  });

  it('returns null for unmapped offsets', () => {
    expect(fieldAtOffset(80)).toBeNull();
  });

  it('returns null for out-of-range offsets', () => {
    expect(fieldAtOffset(-1)).toBeNull();
    expect(fieldAtOffset(158)).toBeNull();
  });
});
