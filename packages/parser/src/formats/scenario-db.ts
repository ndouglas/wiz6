import {
  ScenarioDbSchema,
  type ScenarioDb,
  type ScenarioItem,
  type ScenarioMonster,
  type XpTable,
} from '@wiz6/data';

const XP_TABLES_OFFSET = 0x0000;
const XP_CLASS_COUNT = 14;
const XP_LEVELS_PER_CLASS = 16;
const XP_TABLE_BYTES = XP_LEVELS_PER_CLASS * 4;
const XP_TABLES_TOTAL_BYTES = XP_CLASS_COUNT * XP_TABLE_BYTES;

const ITEM_TABLE_OFFSET = 0x0380;
const ITEM_RECORD_BYTES = 74;
const ITEM_RECORD_COUNT = 500;
const ITEM_TABLE_TOTAL_BYTES = ITEM_RECORD_COUNT * ITEM_RECORD_BYTES;
const ITEM_NAME_SLOT_BYTES = 16;

const ITEM_TABLE_END = ITEM_TABLE_OFFSET + ITEM_TABLE_TOTAL_BYTES;

const MONSTER_TABLE_OFFSET = 0x0154e8;
const MONSTER_RECORD_BYTES = 222;
const MONSTER_RECORD_COUNT = 253;
const MONSTER_NAME_SLOT_BYTES = 16;
const MONSTER_NAMES_TOTAL = 4 * MONSTER_NAME_SLOT_BYTES;
const MONSTER_STAT_BYTES = MONSTER_RECORD_BYTES - MONSTER_NAMES_TOTAL;
const MONSTER_TABLE_END = MONSTER_TABLE_OFFSET + MONSTER_RECORD_COUNT * MONSTER_RECORD_BYTES;

const MIN_FILE_SIZE = MONSTER_TABLE_END;

export interface DecodeScenarioDbOpts {
  id: string;
  sourceFile: string;
}

function readU16LE(bytes: Uint8Array, off: number): number {
  return bytes[off]! | (bytes[off + 1]! << 8);
}

function readU32LE(bytes: Uint8Array, off: number): number {
  return (
    bytes[off]! |
    (bytes[off + 1]! << 8) |
    (bytes[off + 2]! << 16) |
    (bytes[off + 3]! * 0x01000000)
  );
}

function decodeNameSlot(slice: Uint8Array): { name1: string; name2: string } {
  let n1End = 0;
  while (n1End < ITEM_NAME_SLOT_BYTES && slice[n1End] !== 0) n1End++;
  const name1 = new TextDecoder('latin1').decode(slice.subarray(0, n1End));
  // name2 sits between name1's null and the slot's end (byte 15). Anything past
  // the slot is stat data and must NOT be read as a name.
  const n2Start = n1End + 1;
  if (n2Start >= ITEM_NAME_SLOT_BYTES) return { name1, name2: '' };
  let n2End = n2Start;
  while (n2End < ITEM_NAME_SLOT_BYTES && slice[n2End] !== 0) n2End++;
  const name2 = new TextDecoder('latin1').decode(slice.subarray(n2Start, n2End));
  return { name1, name2 };
}

function decodeFixedString(slice: Uint8Array, start: number, length: number): string {
  let end = start;
  const limit = start + length;
  while (end < limit && slice[end] !== 0) end++;
  return new TextDecoder('latin1').decode(slice.subarray(start, end));
}

/**
 * Decode `scenario.dbs`: a flat sequence of game-content tables.
 *
 *   0x0000..0x037F  XP-per-level tables: 14 character classes × 16 levels × u32 LE
 *   0x0380..0x9407  Item table: 500 fixed-size 74-byte records. Layout:
 *     bytes  0..15 : name slot (15-char max name1, null-terminated; optional
 *                    alt name2 fits in remaining bytes within the slot)
 *     byte    16-17: price (u16 LE, gold)
 *     byte      24 : weapon hit/damage bonus
 *     byte      26 : damage dice count   (weapons)
 *     byte      27 : damage dice sides   (weapons)
 *     byte    28-29: spell or song id (u16 LE) — scrolls (slot 13), instruments (14)
 *     byte      30 : weight (tenths of pounds)
 *     byte    54-55: 14-bit class restriction bitmask (low 14 bits = classes 0..13)
 *     byte      60 : equip slot enum (0=weapon 1H, 1=pole, 2=thrown, 3=ranged,
 *                    4=ammo, 5=cloak, 6=head, 7=body, 8=legs, 9=hands, 10=feet,
 *                    11=shield, 12=potion, 13=scroll, 14=instrument/book/misc,
 *                    15=key, 16=dust)
 *     other bytes  : not yet decoded — preserved in `bytes`
 *
 *   0x9408..0x154E7  unknownPreMonster — 49,376 bytes, layout TBD.
 *                    Hex patterns suggest 4bpp sprite graphics (item icons or
 *                    monster portraits referenced from elsewhere).
 *   0x154E8..0x2304D Monster table: 253 fixed-size 222-byte records. Layout:
 *     bytes  0..15  : nameIdSingular   (identified singular, null-terminated)
 *     bytes 16..31  : nameIdPlural     (identified plural)
 *     bytes 32..47  : nameUnidSingular (unidentified singular — what the party
 *                    sees before identifying the monster; "RAT" for a GIANT RAT)
 *     bytes 48..63  : nameUnidPlural   (unidentified plural)
 *     bytes 64..221 : statBytes (158 bytes). Decoded fields (offsets relative
 *                    to start of stat block, i.e. byte 64 of the full record):
 *                      bytes  0-1   xpOnKill         u16 LE
 *                      attack records — 3 × 16 bytes starting at byte 6:
 *                        bytes  6-7   attack1 dice (count, sides)
 *                        byte     9   attack1 special-effect chance (percent)
 *                        bytes 22-23  attack2 dice
 *                        byte    25   attack2 special-effect chance
 *                        bytes 38-39  attack3 dice
 *                        byte    41   attack3 special-effect chance
 *                      bytes 54-55  group dice       encounter group size
 *                      bytes 58-59  HP dice          monster HP roll
 *                      byte    148  monsterClass    tier enum (1=animal,
 *                                   2=humanoid/undead, 3=demon/elite,
 *                                   4=ultimate boss; rare outliers 0/21/65)
 *                      byte    149  monsterSubClass sub-category within
 *                                   class (1=common, 2=special, 3=elite,
 *                                   4=unique)
 *                      bytes 113-117 saveTable       5 percent values, likely
 *                                   save-throw / damage-resistance percentages
 *                                   per damage type. byte 114 = COLD confirmed:
 *                                   COLD SLIME has 100% there.
 *                      bytes 121-125 effectChanceTable 5 percent values, paired
 *                                   with saveTable. Likely chance the monster
 *                                   inflicts a status effect on the party.
 *                                   Undead share template 15/40/30/10/5 across
 *                                   both tables.
 *                      byte    62   monsterLevel    1-50, effective combat
 *                                   level. RAT 5, ZOMBIE 10, BANE KING 50.
 *                      byte    63   monsterLevelMax usually equals byte 62.
 *                                   RAT family has spread (RAT 5-10, GIANT
 *                                   RAT 8-15). 180/189 monsters: level==max.
 *                      bytes 70-73  familyId        4-byte monster-family
 *                                   identifier. RAT family (6,4,14,16),
 *                                   BAT (4,4,17,16), SLIME (4,4,4,6),
 *                                   GHOST (9,9,12,12), GREATER DEMON
 *                                   (22,16,17,17).
 *                      byte    64   creatureKind    body-type enum.
 *                                   1=humanoid soldier, 2=stone elemental,
 *                                   3=elite humanoid, 4=rodent/cat, 5=flying,
 *                                   6=plant, 7=blob/slime, 8=undead,
 *                                   10=elite warrior.
 *                      byte   150   monsterSex      0=male humanoid,
 *                                   1=female (Amazonian), 2=neuter/creature.
 *                      byte    60   moveStat        defaults to monsterLevel ×
 *                                   10 for ~85% of monsters. Designers
 *                                   override for special cases (PIT FIEND
 *                                   200, HAIYATO 244, WILL O' WISP 44).
 *                                   Likely movement/speed in some encoding.
 *                      byte   157   spriteGroup     2=small beast, 3=vine,
 *                                   4=exotic plant, 6=blob/AMAZULU, 7=large
 *                                   creature, 14=humanoid, 15=armored.
 *                      byte   126   monsterAC       signed int8. Wiz6 AC
 *                                   convention (lower=better). Range -14..+12.
 *                                   RAT 5, PIT FIEND 2, WILL O' WISP -14,
 *                                   FAERIE QUEEN -6, * XORPHITUS * -2.
 *                      bytes 144-147 attributeSaves[4] 4 save-throw values,
 *                                   highly family-shared (RAT family 16/21/18,
 *                                   SPIRIT family 20/44/34, GIANT 14/26/24).
 *                                   Byte 147 varies slightly per variant.
 *                      byte    56   goldStat        Scales with monster
 *                                   strength. RAT 1, ZOMBIE 40, PIT FIEND
 *                                   140, BANE KING 150. Likely gold drop
 *                                   in tens-of-gold encoding.
 *                      byte   152   specialAttackElement  damage-type enum.
 *                                   1=fire (HELLCAT, PIT FIEND), 2=earth
 *                                   (GUARDIAN=ROCK), 3=cold (COLD SLIME,
 *                                   WHITE WYRM), 4=acid (RUBBER BEAST,
 *                                   GOOP GLOOP), 5=disease (ZOMBIE family),
 *                                   7=vampiric (BANE KING, DRACULA),
 *                                   8=poison, 11=mental (BANSHEE, ghosts),
 *                                   12=charm (SIREN).
 *                      byte   156   monsterBehaviorClass    enum 0/1/2/5/8/
 *                                   10/11. Clusters by combat behavior:
 *                                   1=humanoid elite, 2=undead, 5=vampire
 *                                   boss, 8=swarm/flying, 10=faerie
 *                                   ethereal, 11=FAERIE QUEEN unique.
 *                      bytes 18-19,
 *                       34-35,
 *                       50-51       attackNExtra[2] per-attack 2-byte data.
 *                                   Present iff the corresponding attack
 *                                   exists (100% correlation: byte 34-35
 *                                   nonzero for all 84 monsters with atk2,
 *                                   zero for all 105 without; same for
 *                                   atk3). Likely damage type + flags
 *                                   bitfield. Exact semantics TBD.
 *                    Remaining un-decoded: byte 8/10-15 sparse per-attack
 *                    "rare special" metadata (level drain, paralysis
 *                    chance, etc.). See Stage 1j.2.11.
 *   0x2304E..end    unknownTail — 45,542 bytes, more tables. ASCII strings
 *                    suggest NPC/quest data ("SMITTY", "CAPTAIN MATEY").
 *
 * See docs/re/scenario-dbs.md for the full investigation memo.
 */
export function decodeScenarioDb(bytes: Uint8Array, opts: DecodeScenarioDbOpts): ScenarioDb {
  if (bytes.length < MIN_FILE_SIZE) {
    throw new Error(
      `scenario-db decoder expected at least ${MIN_FILE_SIZE} bytes, got ${bytes.length}`,
    );
  }

  const xpTables: XpTable[] = [];
  for (let cls = 0; cls < XP_CLASS_COUNT; cls++) {
    const tableBase = XP_TABLES_OFFSET + cls * XP_TABLE_BYTES;
    const levels: number[] = new Array(XP_LEVELS_PER_CLASS);
    for (let lvl = 0; lvl < XP_LEVELS_PER_CLASS; lvl++) {
      levels[lvl] = readU32LE(bytes, tableBase + lvl * 4);
    }
    xpTables.push({ classIndex: cls, levels });
  }

  const items: ScenarioItem[] = [];
  for (let i = 0; i < ITEM_RECORD_COUNT; i++) {
    const base = ITEM_TABLE_OFFSET + i * ITEM_RECORD_BYTES;
    const slice = bytes.subarray(base, base + ITEM_RECORD_BYTES);
    const recordBytes: number[] = new Array(ITEM_RECORD_BYTES);
    let allZero = true;
    for (let j = 0; j < ITEM_RECORD_BYTES; j++) {
      const b = slice[j]!;
      recordBytes[j] = b;
      if (b !== 0) allZero = false;
    }
    const { name1, name2 } = decodeNameSlot(slice);
    items.push({
      index: i,
      name1,
      name2,
      bytes: recordBytes,
      empty: allZero,
      price: readU16LE(slice, 16),
      hitBonus: slice[24]!,
      damageDiceCount: slice[26]!,
      damageDiceSides: slice[27]!,
      spellOrSongId: readU16LE(slice, 28),
      weight: slice[30]!,
      classMask: readU16LE(slice, 54),
      equipSlot: slice[60]!,
    });
  }

  const preMonsterSlice = bytes.subarray(ITEM_TABLE_END, MONSTER_TABLE_OFFSET);
  const unknownPreMonster: number[] = new Array(preMonsterSlice.length);
  for (let i = 0; i < preMonsterSlice.length; i++) unknownPreMonster[i] = preMonsterSlice[i]!;

  const monsters: ScenarioMonster[] = [];
  for (let i = 0; i < MONSTER_RECORD_COUNT; i++) {
    const base = MONSTER_TABLE_OFFSET + i * MONSTER_RECORD_BYTES;
    const slice = bytes.subarray(base, base + MONSTER_RECORD_BYTES);
    const nameIdSingular = decodeFixedString(slice, 0, MONSTER_NAME_SLOT_BYTES);
    const nameIdPlural = decodeFixedString(slice, 16, MONSTER_NAME_SLOT_BYTES);
    const nameUnidSingular = decodeFixedString(slice, 32, MONSTER_NAME_SLOT_BYTES);
    const nameUnidPlural = decodeFixedString(slice, 48, MONSTER_NAME_SLOT_BYTES);
    const statBytes: number[] = new Array(MONSTER_STAT_BYTES);
    let allZero = nameIdSingular === '';
    for (let j = 0; j < MONSTER_STAT_BYTES; j++) {
      const b = slice[MONSTER_NAMES_TOTAL + j]!;
      statBytes[j] = b;
      if (b !== 0) allZero = false;
    }
    const statSlice = slice.subarray(MONSTER_NAMES_TOTAL);
    monsters.push({
      index: i,
      nameIdSingular,
      nameIdPlural,
      nameUnidSingular,
      nameUnidPlural,
      statBytes,
      empty: allZero,
      xpOnKill: readU16LE(statSlice, 0),
      attack1DiceCount: statSlice[6]!,
      attack1DiceSides: statSlice[7]!,
      attack1SpecialChance: statSlice[9]!,
      attack2DiceCount: statSlice[22]!,
      attack2DiceSides: statSlice[23]!,
      attack2SpecialChance: statSlice[25]!,
      attack3DiceCount: statSlice[38]!,
      attack3DiceSides: statSlice[39]!,
      attack3SpecialChance: statSlice[41]!,
      groupDiceCount: statSlice[54]!,
      groupDiceSides: statSlice[55]!,
      hpDiceCount: statSlice[58]!,
      hpDiceSides: statSlice[59]!,
      monsterClass: statSlice[148]!,
      monsterSubClass: statSlice[149]!,
      saveTable: [
        statSlice[113]!,
        statSlice[114]!,
        statSlice[115]!,
        statSlice[116]!,
        statSlice[117]!,
      ],
      effectChanceTable: [
        statSlice[121]!,
        statSlice[122]!,
        statSlice[123]!,
        statSlice[124]!,
        statSlice[125]!,
      ],
      monsterLevel: statSlice[62]!,
      monsterLevelMax: statSlice[63]!,
      familyId: [statSlice[70]!, statSlice[71]!, statSlice[72]!, statSlice[73]!],
      creatureKind: statSlice[64]!,
      monsterSex: statSlice[150]!,
      moveStat: statSlice[60]!,
      spriteGroup: statSlice[157]!,
      monsterAC: statSlice[126]! >= 128 ? statSlice[126]! - 256 : statSlice[126]!,
      attributeSaves: [
        statSlice[144]!,
        statSlice[145]!,
        statSlice[146]!,
        statSlice[147]!,
      ],
      goldStat: statSlice[56]!,
      specialAttackElement: statSlice[152]!,
      monsterBehaviorClass: statSlice[156]!,
      attack1Extra: [statSlice[18]!, statSlice[19]!],
      attack2Extra: [statSlice[34]!, statSlice[35]!],
      attack3Extra: [statSlice[50]!, statSlice[51]!],
      attack1PoisonChance: statSlice[10]!,
      attack1DrainChance: statSlice[13]!,
      attack1StunChance: statSlice[15]!,
      attack2PoisonChance: statSlice[26]!,
      attack2DrainChance: statSlice[29]!,
      attack2StunChance: statSlice[31]!,
      attack3PoisonChance: statSlice[42]!,
      attack3DrainChance: statSlice[45]!,
      attack3StunChance: statSlice[47]!,
    });
  }

  const tail = bytes.subarray(MONSTER_TABLE_END);
  const unknownTail: number[] = new Array(tail.length);
  for (let i = 0; i < tail.length; i++) unknownTail[i] = tail[i]!;

  return ScenarioDbSchema.parse({
    id: opts.id,
    sourceFile: opts.sourceFile,
    xpTables,
    itemCount: items.length,
    items,
    unknownPreMonster,
    monsterCount: monsters.length,
    monsters,
    unknownTail,
  });
}
