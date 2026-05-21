import { describe, expect, it } from 'vitest';
import { decodeScenarioDb } from '../../src/formats/scenario-db.js';

const XP_TOTAL = 14 * 16 * 4; // 896
const ITEM_TOTAL = 500 * 74; // 37000
const ITEM_TABLE_END = XP_TOTAL + ITEM_TOTAL; // 37896
const MONSTER_TABLE_OFFSET = 0x0154e8; // 87272
const MONSTER_TOTAL = 253 * 222; // 56166
const MONSTER_TABLE_END = MONSTER_TABLE_OFFSET + MONSTER_TOTAL; // 143438
const MIN_SIZE = MONSTER_TABLE_END;

function writeU32LE(buf: Uint8Array, off: number, v: number): void {
  buf[off] = v & 0xff;
  buf[off + 1] = (v >>> 8) & 0xff;
  buf[off + 2] = (v >>> 16) & 0xff;
  buf[off + 3] = (v >>> 24) & 0xff;
}

function writeU16LE(buf: Uint8Array, off: number, v: number): void {
  buf[off] = v & 0xff;
  buf[off + 1] = (v >>> 8) & 0xff;
}

function writeAscii(buf: Uint8Array, off: number, s: string): void {
  for (let i = 0; i < s.length; i++) buf[off + i] = s.charCodeAt(i);
}

describe('decodeScenarioDb', () => {
  it('parses XP tables as 14 classes × 16 levels × u32 LE', () => {
    const bytes = new Uint8Array(MIN_SIZE);
    // Class 0, level 0 = 1000; class 0, level 7 = 128000
    writeU32LE(bytes, 0, 1000);
    writeU32LE(bytes, 7 * 4, 128000);
    // Class 1, level 0 = 1250
    writeU32LE(bytes, 64, 1250);
    // Class 13, level 15 (last entry)
    writeU32LE(bytes, 13 * 64 + 15 * 4, 9999999);
    const db = decodeScenarioDb(bytes, { id: 'scenario', sourceFile: 'scenario.dbs' });
    expect(db.xpTables).toHaveLength(14);
    expect(db.xpTables[0]?.levels[0]).toBe(1000);
    expect(db.xpTables[0]?.levels[7]).toBe(128000);
    expect(db.xpTables[1]?.levels[0]).toBe(1250);
    expect(db.xpTables[13]?.levels[15]).toBe(9999999);
  });

  it('parses 500 × 74-byte item records starting at 0x380', () => {
    const bytes = new Uint8Array(MIN_SIZE);
    writeAscii(bytes, 0x0380, 'BROKEN ITEM');
    writeAscii(bytes, 0x03ca, 'DAGGER');
    bytes[0x03d0] = 0; // terminator for name1
    writeAscii(bytes, 0x03d1, 'DAGGERS');
    const db = decodeScenarioDb(bytes, { id: 'scenario', sourceFile: 'scenario.dbs' });
    expect(db.itemCount).toBe(500);
    expect(db.items[0]?.name1).toBe('BROKEN ITEM');
    expect(db.items[0]?.name2).toBe('');
    expect(db.items[1]?.name1).toBe('DAGGER');
    expect(db.items[1]?.name2).toBe('DAGGERS');
  });

  it('confines name2 to the 16-byte name slot (does not read stat bytes as ASCII)', () => {
    // A 15-char name1 exactly fills the slot with name1+null. The byte at
    // offset 16 (first stat byte) must NOT be interpreted as the start of
    // name2, even if it happens to be a printable ASCII character.
    const bytes = new Uint8Array(MIN_SIZE);
    writeAscii(bytes, 0x0380, 'BEARDED WAR AXE');
    bytes[0x0380 + 16] = '2'.charCodeAt(0); // stat byte that looks like ASCII
    const db = decodeScenarioDb(bytes, { id: 'scenario', sourceFile: 'scenario.dbs' });
    expect(db.items[0]?.name1).toBe('BEARDED WAR AXE');
    expect(db.items[0]?.name2).toBe('');
  });

  it('parses item stat fields at fixed offsets', () => {
    const bytes = new Uint8Array(MIN_SIZE);
    writeAscii(bytes, 0x0380, 'LONGSWORD');
    const base = 0x0380;
    writeU16LE(bytes, base + 16, 60); // price 60g
    bytes[base + 24] = 0; // hit bonus
    bytes[base + 26] = 1; // damage dice count
    bytes[base + 27] = 8; // damage dice sides → 1d8
    writeU16LE(bytes, base + 28, 0); // not a scroll/instrument
    bytes[base + 30] = 50; // weight 5.0 lb
    writeU16LE(bytes, base + 54, 0x3fff); // all 14 classes allowed
    bytes[base + 60] = 0; // slot 0 = main-hand weapon
    const db = decodeScenarioDb(bytes, { id: 'scenario', sourceFile: 'scenario.dbs' });
    const it = db.items[0]!;
    expect(it.price).toBe(60);
    expect(it.damageDiceCount).toBe(1);
    expect(it.damageDiceSides).toBe(8);
    expect(it.weight).toBe(50);
    expect(it.classMask).toBe(0x3fff);
    expect(it.equipSlot).toBe(0);
  });

  it('reads scroll spellOrSongId as u16 LE at offset 28', () => {
    const bytes = new Uint8Array(MIN_SIZE);
    writeAscii(bytes, 0x0380, 'MAGIC MISSILE');
    writeU16LE(bytes, 0x0380 + 28, 578);
    bytes[0x0380 + 60] = 13; // slot 13 = scroll
    const db = decodeScenarioDb(bytes, { id: 'scenario', sourceFile: 'scenario.dbs' });
    expect(db.items[0]?.spellOrSongId).toBe(578);
    expect(db.items[0]?.equipSlot).toBe(13);
  });

  it('marks all-zero item records as empty', () => {
    const bytes = new Uint8Array(MIN_SIZE);
    writeAscii(bytes, 0x0380, 'X'); // only record 0 has content
    const db = decodeScenarioDb(bytes, { id: 'scenario', sourceFile: 'scenario.dbs' });
    expect(db.items[0]?.empty).toBe(false);
    expect(db.items[1]?.empty).toBe(true);
    expect(db.items[499]?.empty).toBe(true);
  });

  it('preserves bytes past the monster table in unknownTail', () => {
    const bytes = new Uint8Array(MIN_SIZE + 100);
    bytes[MIN_SIZE] = 0xab;
    bytes[MIN_SIZE + 99] = 0xcd;
    const db = decodeScenarioDb(bytes, { id: 'scenario', sourceFile: 'scenario.dbs' });
    expect(db.unknownTail).toHaveLength(100);
    expect(db.unknownTail[0]).toBe(0xab);
    expect(db.unknownTail[99]).toBe(0xcd);
  });

  it('preserves bytes between item and monster tables as unknownPreMonster', () => {
    const bytes = new Uint8Array(MIN_SIZE);
    bytes[ITEM_TABLE_END] = 0x11;
    bytes[MONSTER_TABLE_OFFSET - 1] = 0x22;
    const db = decodeScenarioDb(bytes, { id: 'scenario', sourceFile: 'scenario.dbs' });
    const expectedLen = MONSTER_TABLE_OFFSET - ITEM_TABLE_END;
    expect(db.unknownPreMonster).toHaveLength(expectedLen);
    expect(db.unknownPreMonster[0]).toBe(0x11);
    expect(db.unknownPreMonster[expectedLen - 1]).toBe(0x22);
  });

  it('parses 253 × 222-byte monster records with 4 name slots', () => {
    const bytes = new Uint8Array(MIN_SIZE);
    const base = MONSTER_TABLE_OFFSET + 1 * 222; // monster 1 (skip the RAT sentinel)
    writeAscii(bytes, base + 0, 'GIANT RAT');
    writeAscii(bytes, base + 16, 'GIANT RATS');
    writeAscii(bytes, base + 32, 'RAT');
    writeAscii(bytes, base + 48, 'RATS');
    writeU16LE(bytes, base + 64, 450); // experience-on-kill
    const db = decodeScenarioDb(bytes, { id: 'scenario', sourceFile: 'scenario.dbs' });
    expect(db.monsterCount).toBe(253);
    const m = db.monsters[1]!;
    expect(m.nameIdSingular).toBe('GIANT RAT');
    expect(m.nameIdPlural).toBe('GIANT RATS');
    expect(m.nameUnidSingular).toBe('RAT');
    expect(m.nameUnidPlural).toBe('RATS');
    expect(m.statBytes).toHaveLength(158);
    // XP-on-kill (u16 LE) lives in the first 2 stat bytes
    expect(m.statBytes[0] | (m.statBytes[1]! << 8)).toBe(450);
    expect(m.empty).toBe(false);
  });

  it('parses monster stat fields at fixed stat-block offsets', () => {
    const bytes = new Uint8Array(MIN_SIZE);
    const base = MONSTER_TABLE_OFFSET + 1 * 222;
    const stat = base + 64; // start of 158-byte stat block
    writeAscii(bytes, base + 0, 'GIANT RAT');
    writeU16LE(bytes, stat + 0, 450); // xpOnKill
    bytes[stat + 6] = 2; // attack1 dice count
    bytes[stat + 7] = 2; // attack1 dice sides → 2d2
    bytes[stat + 9] = 15; // attack1 special chance 15%
    bytes[stat + 22] = 1; // attack2 dice count
    bytes[stat + 23] = 7; // attack2 dice sides → 1d7
    bytes[stat + 25] = 90; // attack2 special chance 90%
    bytes[stat + 38] = 3; // attack3 dice count
    bytes[stat + 39] = 4; // attack3 dice sides → 3d4
    bytes[stat + 41] = 25; // attack3 special chance 25%
    bytes[stat + 54] = 1; // group dice count
    bytes[stat + 55] = 2; // group dice sides → 1d2 group
    bytes[stat + 58] = 2; // hp dice count
    bytes[stat + 59] = 4; // hp dice sides → 2d4 HP
    bytes[stat + 62] = 5;   // monsterLevel = 5
    bytes[stat + 63] = 10;  // monsterLevelMax = 10 (RAT family spread)
    bytes[stat + 70] = 6;   // familyId byte 0
    bytes[stat + 71] = 4;   // familyId byte 1
    bytes[stat + 72] = 14;  // familyId byte 2
    bytes[stat + 73] = 16;  // familyId byte 3 (RAT family signature)
    bytes[stat + 113] = 15; // saveTable[0]
    bytes[stat + 114] = 40; // saveTable[1] (cold)
    bytes[stat + 115] = 30; // saveTable[2]
    bytes[stat + 116] = 10; // saveTable[3]
    bytes[stat + 117] = 5;  // saveTable[4]
    bytes[stat + 121] = 50; // effectChanceTable[0]
    bytes[stat + 122] = 25; // effectChanceTable[1]
    bytes[stat + 123] = 10; // effectChanceTable[2]
    bytes[stat + 124] = 5;  // effectChanceTable[3]
    bytes[stat + 125] = 0;  // effectChanceTable[4]
    bytes[stat + 56] = 2;  // goldStat = 2 (tens of gold)
    bytes[stat + 60] = 80; // moveStat = 80 (= level 8 × 10)
    bytes[stat + 64] = 4;  // creatureKind = 4 (rodent/cat)
    bytes[stat + 126] = 0xfc; // monsterAC = -4 (signed byte 252)
    bytes[stat + 144] = 16; bytes[stat + 145] = 21; bytes[stat + 146] = 18; bytes[stat + 147] = 18; // attributeSaves (RAT family)
    bytes[stat + 148] = 1; // monsterClass = 1 (animal)
    bytes[stat + 149] = 1; // monsterSubClass = 1 (common)
    bytes[stat + 150] = 2; // monsterSex = 2 (neuter creature)
    bytes[stat + 152] = 3; // specialAttackElement = 3 (cold)
    bytes[stat + 156] = 2; // monsterBehaviorClass = 2 (undead-like)
    bytes[stat + 157] = 2; // spriteGroup = 2 (small beast)
    bytes[stat + 18] = 115; bytes[stat + 19] = 1; // attack1Extra
    bytes[stat + 34] = 50; bytes[stat + 35] = 2;  // attack2Extra
    bytes[stat + 50] = 25; bytes[stat + 51] = 3;  // attack3Extra
    bytes[stat + 10] = 40; // attack1PoisonChance
    bytes[stat + 13] = 50; // attack1DrainChance
    bytes[stat + 15] = 10; // attack1StunChance
    bytes[stat + 26] = 25; // attack2PoisonChance
    bytes[stat + 29] = 90; // attack2DrainChance
    bytes[stat + 31] = 5;  // attack2StunChance
    bytes[stat + 42] = 15; // attack3PoisonChance
    bytes[stat + 45] = 75; // attack3DrainChance
    bytes[stat + 47] = 20; // attack3StunChance
    bytes[stat + 8] = 25;  // attack1HpDrainChance
    bytes[stat + 11] = 50; // attack1AgeChance
    bytes[stat + 14] = 10; // attack1DecapitateChance
    bytes[stat + 24] = 10; // attack2HpDrainChance
    bytes[stat + 27] = 25; // attack2AgeChance
    bytes[stat + 30] = 5;  // attack2DecapitateChance
    bytes[stat + 40] = 5;  // attack3HpDrainChance
    bytes[stat + 43] = 20; // attack3AgeChance
    bytes[stat + 46] = 15; // attack3DecapitateChance
    const db = decodeScenarioDb(bytes, { id: 'scenario', sourceFile: 'scenario.dbs' });
    const m = db.monsters[1]!;
    expect(m.xpOnKill).toBe(450);
    expect(m.attack1DiceCount).toBe(2);
    expect(m.attack1DiceSides).toBe(2);
    expect(m.attack1SpecialChance).toBe(15);
    expect(m.attack2DiceCount).toBe(1);
    expect(m.attack2DiceSides).toBe(7);
    expect(m.attack2SpecialChance).toBe(90);
    expect(m.attack3DiceCount).toBe(3);
    expect(m.attack3DiceSides).toBe(4);
    expect(m.attack3SpecialChance).toBe(25);
    expect(m.groupDiceCount).toBe(1);
    expect(m.groupDiceSides).toBe(2);
    expect(m.hpDiceCount).toBe(2);
    expect(m.hpDiceSides).toBe(4);
    expect(m.monsterClass).toBe(1);
    expect(m.monsterSubClass).toBe(1);
    expect(m.saveTable).toEqual([15, 40, 30, 10, 5]);
    expect(m.effectChanceTable).toEqual([50, 25, 10, 5, 0]);
    expect(m.monsterLevel).toBe(5);
    expect(m.monsterLevelMax).toBe(10);
    expect(m.familyId).toEqual([6, 4, 14, 16]);
    expect(m.creatureKind).toBe(4);
    expect(m.monsterSex).toBe(2);
    expect(m.moveStat).toBe(80);
    expect(m.spriteGroup).toBe(2);
    expect(m.monsterAC).toBe(-4);
    expect(m.attributeSaves).toEqual([16, 21, 18, 18]);
    expect(m.goldStat).toBe(2);
    expect(m.specialAttackElement).toBe(3);
    expect(m.monsterBehaviorClass).toBe(2);
    expect(m.attack1Extra).toEqual([115, 1]);
    expect(m.attack2Extra).toEqual([50, 2]);
    expect(m.attack3Extra).toEqual([25, 3]);
    expect(m.attack1PoisonChance).toBe(40);
    expect(m.attack1DrainChance).toBe(50);
    expect(m.attack1StunChance).toBe(10);
    expect(m.attack2PoisonChance).toBe(25);
    expect(m.attack2DrainChance).toBe(90);
    expect(m.attack2StunChance).toBe(5);
    expect(m.attack3PoisonChance).toBe(15);
    expect(m.attack3DrainChance).toBe(75);
    expect(m.attack3StunChance).toBe(20);
    expect(m.attack1HpDrainChance).toBe(25);
    expect(m.attack1AgeChance).toBe(50);
    expect(m.attack1DecapitateChance).toBe(10);
    expect(m.attack2HpDrainChance).toBe(10);
    expect(m.attack2AgeChance).toBe(25);
    expect(m.attack2DecapitateChance).toBe(5);
    expect(m.attack3HpDrainChance).toBe(5);
    expect(m.attack3AgeChance).toBe(20);
    expect(m.attack3DecapitateChance).toBe(15);
  });

  it('marks empty monster slots correctly', () => {
    const bytes = new Uint8Array(MIN_SIZE);
    writeAscii(bytes, MONSTER_TABLE_OFFSET, 'X');
    const db = decodeScenarioDb(bytes, { id: 'scenario', sourceFile: 'scenario.dbs' });
    expect(db.monsters[0]?.empty).toBe(false);
    expect(db.monsters[1]?.empty).toBe(true);
    expect(db.monsters[252]?.empty).toBe(true);
  });

  it('throws when file is smaller than monster table end', () => {
    expect(() =>
      decodeScenarioDb(new Uint8Array(MIN_SIZE - 1), {
        id: 'scenario',
        sourceFile: 'scenario.dbs',
      }),
    ).toThrow(/143438/);
  });
});
