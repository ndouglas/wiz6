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
 *     bytes 64..221 : statBytes (158 bytes) — per-field layout TBD.
 *                    Verified pattern: bytes 64-65 = u16 LE experience-on-kill
 *                    (GIANT RAT 450 XP, * XORPHITUS * 16,150 XP). Other fields
 *                    likely include HP, AC, attack dice, special abilities,
 *                    encounter group, etc.
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
    monsters.push({
      index: i,
      nameIdSingular,
      nameIdPlural,
      nameUnidSingular,
      nameUnidPlural,
      statBytes,
      empty: allZero,
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
