import { ScenarioDbSchema, type ScenarioDb, type ScenarioItem, type XpTable } from '@wiz6/data';

const XP_TABLES_OFFSET = 0x0000;
const XP_CLASS_COUNT = 14;
const XP_LEVELS_PER_CLASS = 16;
const XP_TABLE_BYTES = XP_LEVELS_PER_CLASS * 4;
const XP_TABLES_TOTAL_BYTES = XP_CLASS_COUNT * XP_TABLE_BYTES;

const ITEM_TABLE_OFFSET = 0x0380;
const ITEM_RECORD_BYTES = 74;
const ITEM_RECORD_COUNT = 500;
const ITEM_TABLE_TOTAL_BYTES = ITEM_RECORD_COUNT * ITEM_RECORD_BYTES;

const ITEM_TABLE_END = ITEM_TABLE_OFFSET + ITEM_TABLE_TOTAL_BYTES;
const MIN_FILE_SIZE = ITEM_TABLE_END;

export interface DecodeScenarioDbOpts {
  id: string;
  sourceFile: string;
}

function readU32LE(bytes: Uint8Array, off: number): number {
  return (
    bytes[off]! |
    (bytes[off + 1]! << 8) |
    (bytes[off + 2]! << 16) |
    (bytes[off + 3]! * 0x01000000)
  );
}

function decodeNullTerminated(bytes: Uint8Array, start: number, maxLen: number): {
  text: string;
  next: number;
} {
  const limit = Math.min(start + maxLen, bytes.length);
  let end = start;
  while (end < limit && bytes[end] !== 0) end++;
  const text = new TextDecoder('latin1').decode(bytes.subarray(start, end));
  const next = end < limit ? end + 1 : end;
  return { text, next };
}

/**
 * Decode `scenario.dbs`: a flat sequence of game-content tables. This decoder
 * exposes the two tables whose layouts we've identified:
 *
 *   0x0000..0x037F  XP-per-level tables: 14 character classes × 16 levels × u32 LE
 *   0x0380..0x9407  Item table: 500 fixed-size 74-byte records, each with two
 *                   null-terminated names (singular/plural) followed by raw
 *                   stat bytes whose per-field layout isn't yet decoded.
 *
 * Everything past 0x9408 is preserved as `unknownTail` for future stages.
 * See docs/re/scenario-dbs.md for what's known.
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
    const { text: name1, next: afterName1 } = decodeNullTerminated(slice, 0, ITEM_RECORD_BYTES);
    const { text: name2 } = decodeNullTerminated(slice, afterName1, ITEM_RECORD_BYTES - afterName1);
    items.push({ index: i, name1, name2, bytes: recordBytes, empty: allZero });
  }

  const tail = bytes.subarray(ITEM_TABLE_END);
  const unknownTail: number[] = new Array(tail.length);
  for (let i = 0; i < tail.length; i++) unknownTail[i] = tail[i]!;

  return ScenarioDbSchema.parse({
    id: opts.id,
    sourceFile: opts.sourceFile,
    xpTables,
    itemCount: items.length,
    items,
    unknownTail,
  });
}
