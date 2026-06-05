/**
 * decode-asset.ts — Wiz6 disk.hdr/master.hdr-keyed asset-by-id loader (offline).
 *
 * RE RESULT (2026-06-04, "RE: disk.hdr-keyed asset-by-id loader" pass).
 *
 * The maze FLOOR and CEILING background images are NOT a separate compressed
 * "asset DB by image-id" and they are NOT huffman/RLE-decompressed at load.
 * They are PLAIN, UNCOMPRESSED fixed-size RECORDS of the scenario database
 * (SCENARIO.DBS), addressed by a (bank, recordIndex) pair through two header
 * tables loaded at winit state 0:
 *
 *   - DISK.HDR   -> per-bank BASE OFFSET into SCENARIO.DBS.
 *       base[k] = u32LE at DISK.HDR offset (k+1)*4   (the +1 skips a leading
 *       0 dword; DISK.HDR[0]=0, DISK.HDR[1]=0, DISK.HDR[2]=896, ...).
 *       Loaded to wroot DGROUP 0x3048 (dword per bank: 0x3048 + k*4).
 *   - MASTER.HDR -> per-bank RECORD SIZE (bytes).
 *       recsize[k] = u16LE at MASTER.HDR offset k*2.
 *       Loaded to wroot DGROUP 0x3300 (word per bank: 0x3300 + k*2).
 *       recsize[2]=1346, recsize[3]=1740 — the "floor id 1346 / ceiling id 1740"
 *       of the prior findings were these RECORD SIZES read at DGROUP 0x3304
 *       (=0x3300+4=recsize[2]) / 0x3306 (=recsize[3]), NOT image ids.
 *
 * The disk read is the generic bank reader wroot FUN_0882 (image 0x882, Ghidra
 * 0x10882; reached from wmaze via the bank-reader thunk 0xC31E = 0x882+0xBA9C):
 *   lseek(scenario_fd, base[bank] + recordIndex * recsize[bank], SEEK_SET);
 *   read (scenario_fd, dest, recsize[bank]);
 * i.e. record `r` of bank `k` = SCENARIO.DBS[ base[k] + r*recsize[k] .. +recsize[k] ].
 *
 * Per-ZONE selection (live, all 12 zones, byte-exact):
 *   floor[zone]   = bank 2, record (zone + 2)
 *   ceiling[zone] = bank 3, record (zone + 2)
 * (records 0,1 of each bank are placeholder/template data; zone N uses record N+2.)
 *
 * The record is loaded VERBATIM into a wroot near-heap block (malloc via wroot
 * FUN_3A22 = thunk 0xF4BE, size=recsize). The block's leading 0x20 bytes seen at
 * the per-zone far-ptr (DGROUP 0x7d2 floor / 0x80a ceiling, seg = block para) are
 * NOT part of the asset:
 *   [0x00..0x0f] 16 bytes  = heap leakage (tail of the adjacent prior heap block;
 *                            for floor it happens to be a 12-byte depth ramp left
 *                            by the neighbouring ceiling record's tail LUT).
 *   [0x10..0x1f] 16 bytes  = the 'WROOT' heap-block header
 *                            (4d 98 <link_word> 00 00 00 00 'WROOT' 00 00 00);
 *                            link_word is heap-layout dependent.
 *   [0x20..]               = the asset record, BYTE-EXACT from SCENARIO.DBS.
 *
 * VALIDATION: decodeAsset(bank, zone+2) === live block[0x20 : 0x20+recsize] for
 * floor (bank 2) AND ceiling (bank 3), all 12 zones — 0 byte diffs.
 *
 * Anchors:
 *   - wroot FUN_0882 (Ghidra 0x10882): the lseek/read bank reader.
 *   - wroot FUN_3A22 (Ghidra 0x13a22): near-heap malloc (thunk 0xF4BE), size arg.
 *   - wmaze 0x42..0xc3: floor/ceiling lazy-load + blit dispatch.
 *   - DGROUP 0x3048 (bases, from DISK.HDR), 0x3300 (recsizes, from MASTER.HDR),
 *     0x7d2/0x80a (per-zone far-ptr tables), 0x363c (current zone),
 *     0x3304/0x3306 (= recsize[2]/recsize[3], the misnamed "floor/ceil id").
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface AssetDb {
  /** SCENARIO.DBS bytes. */
  scenario: Uint8Array;
  /** Per-bank base offset into SCENARIO.DBS (from DISK.HDR). */
  bases: number[];
  /** Per-bank record size in bytes (from MASTER.HDR). */
  recsizes: number[];
}

const FLOOR_BANK = 2;
const CEILING_BANK = 3;
/** Zone N uses record N+2 (records 0,1 are templates). */
const ZONE_RECORD_BASE = 2;

function u32le(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
}
function u16le(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8);
}

/** Load the disk.hdr/master.hdr-keyed asset DB from the on-disk game files. */
export function loadAssetDb(dir = 'test-fixtures/original'): AssetDb {
  const disk = new Uint8Array(readFileSync(resolve(dir, 'disk.hdr')));
  const master = new Uint8Array(readFileSync(resolve(dir, 'master.hdr')));
  const scenario = new Uint8Array(readFileSync(resolve(dir, 'scenario.dbs')));
  // DISK.HDR: base[k] = u32 @ (k+1)*4. The file is 700 bytes; the table is the
  // first ~10 dwords, the rest is an identity byte table (loader scratch).
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
 * This is the engine's bank reader (wroot FUN_0882) reproduced offline.
 */
export function decodeAsset(db: AssetDb, bank: number, recordIndex: number): Uint8Array {
  const base = db.bases[bank];
  const recsize = db.recsizes[bank];
  if (base === undefined || recsize === undefined) {
    throw new Error(`bank ${bank} out of range (bases=${db.bases.length}, recsizes=${db.recsizes.length})`);
  }
  const start = base + recordIndex * recsize;
  if (start + recsize > db.scenario.length) {
    throw new Error(`record ${recordIndex} of bank ${bank} exceeds SCENARIO.DBS (start=${start}, recsize=${recsize}, len=${db.scenario.length})`);
  }
  return db.scenario.slice(start, start + recsize);
}

/** The maze floor background image for a zone (bank 2, record zone+2). */
export function decodeFloorImage(db: AssetDb, zone: number): Uint8Array {
  return decodeAsset(db, FLOOR_BANK, zone + ZONE_RECORD_BASE);
}

/** The maze ceiling background image for a zone (bank 3, record zone+2). */
export function decodeCeilingImage(db: AssetDb, zone: number): Uint8Array {
  return decodeAsset(db, CEILING_BANK, zone + ZONE_RECORD_BASE);
}

/**
 * Compatibility shim for the task's `decodeAssetById` name. The prior findings'
 * "image id 1346/1740" are actually the RECORD SIZES of banks 2/3, so an
 * id-keyed call resolves the bank by record size and returns the zone-0 record.
 * Prefer decodeFloorImage / decodeCeilingImage (bank, zone) — they are the real
 * engine addressing.
 */
export function decodeAssetById(db: AssetDb, id: number, zone = 0): Uint8Array {
  const bank = db.recsizes.indexOf(id);
  if (bank < 0) throw new Error(`no bank with record size ${id}`);
  return decodeAsset(db, bank, zone + ZONE_RECORD_BASE);
}

export { FLOOR_BANK, CEILING_BANK, ZONE_RECORD_BASE };
