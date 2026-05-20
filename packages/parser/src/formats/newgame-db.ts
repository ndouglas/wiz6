import { NewgameDbSchema, type NewgameDb } from '@wiz6/data';

const RECORD_BYTES = 64;
const TOTAL_RECORDS = 779;
const EXPECTED_FILE_SIZE = RECORD_BYTES * TOTAL_RECORDS;

export interface DecodeNewgameDbOpts {
  id: string;
  sourceFile: string;
}

/**
 * Decode `newgame.dbs`: a flat sequence of 779 fixed-size 64-byte records.
 * Records are bit-packed character/race/class/spell/item templates used by
 * wbase.ovr's character creation flow. Per-field semantics aren't yet
 * decoded — this decoder exposes the raw bytes per record plus an `empty`
 * flag for the 177 all-zero placeholder slots.
 *
 * See docs/re/newgame-dbs.md for what's known about the format.
 */
export function decodeNewgameDb(bytes: Uint8Array, opts: DecodeNewgameDbOpts): NewgameDb {
  if (bytes.length !== EXPECTED_FILE_SIZE) {
    throw new Error(
      `newgame-db decoder expected ${EXPECTED_FILE_SIZE} bytes, got ${bytes.length}`,
    );
  }
  const records = [];
  for (let i = 0; i < TOTAL_RECORDS; i++) {
    const base = i * RECORD_BYTES;
    const slice = bytes.subarray(base, base + RECORD_BYTES);
    const recordBytes: number[] = new Array(RECORD_BYTES);
    let allZero = true;
    for (let j = 0; j < RECORD_BYTES; j++) {
      const b = slice[j]!;
      recordBytes[j] = b;
      if (b !== 0) allZero = false;
    }
    records.push({
      index: i,
      bytes: recordBytes,
      empty: allZero,
    });
  }
  return NewgameDbSchema.parse({
    id: opts.id,
    sourceFile: opts.sourceFile,
    recordCount: records.length,
    records,
  });
}
