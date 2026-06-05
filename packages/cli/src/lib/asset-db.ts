/**
 * asset-db.ts — Wiz6 disk.hdr/master.hdr-keyed asset-by-id loader.
 *
 * CLI-layer wrapper for reading verbatim records from SCENARIO.DBS, addressed
 * by (bank, recordIndex) through the two header tables. This is the engine's
 * bank reader (wroot FUN_0882) reproduced offline for the CLI extractors.
 *
 * See tools/parity/decode-asset.ts for the full RE comment + anchors. This file
 * contains only the subset needed by the CLI extractors: AssetDb, loadAssetDb,
 * decodeAsset.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface AssetDb {
  /** SCENARIO.DBS bytes. */
  scenario: Uint8Array;
  /** Per-bank base offset into SCENARIO.DBS (from DISK.HDR). */
  bases: number[];
  /** Per-bank record size in bytes (from MASTER.HDR). */
  recsizes: number[];
}

function u32le(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
}
function u16le(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8);
}

/** Load the disk.hdr/master.hdr-keyed asset DB from the on-disk game files. */
export function loadAssetDb(dir: string): AssetDb {
  const disk = new Uint8Array(readFileSync(join(dir, 'disk.hdr')));
  const master = new Uint8Array(readFileSync(join(dir, 'master.hdr')));
  const scenario = new Uint8Array(readFileSync(join(dir, 'scenario.dbs')));
  // DISK.HDR: base[k] = u32 @ (k+1)*4.
  const bases: number[] = [];
  for (let k = 0; k < 16; k++) {
    const off = (k + 1) * 4;
    if (off + 4 > disk.length) break;
    bases.push(u32le(disk, off));
  }
  // MASTER.HDR: recsize[k] = u16 @ k*2.
  const recsizes: number[] = [];
  for (let k = 0; k * 2 + 2 <= master.length; k++) recsizes.push(u16le(master, k * 2));
  return { scenario, bases, recsizes };
}

/**
 * Read record `recordIndex` of bank `bank` from SCENARIO.DBS, verbatim.
 * Reproduces the engine's bank reader (wroot FUN_0882).
 */
export function decodeAsset(db: AssetDb, bank: number, recordIndex: number): Uint8Array {
  const base = db.bases[bank];
  const recsize = db.recsizes[bank];
  if (base === undefined || recsize === undefined) {
    throw new Error(
      `bank ${bank} out of range (bases=${db.bases.length}, recsizes=${db.recsizes.length})`,
    );
  }
  const start = base + recordIndex * recsize;
  if (start + recsize > db.scenario.length) {
    throw new Error(
      `record ${recordIndex} of bank ${bank} exceeds SCENARIO.DBS (start=${start}, recsize=${recsize}, len=${db.scenario.length})`,
    );
  }
  return db.scenario.slice(start, start + recsize);
}
