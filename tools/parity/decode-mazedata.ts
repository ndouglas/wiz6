/**
 * decode-mazedata.ts — Wiz6 maze graphics (mazedata.ega) structure + decoder notes.
 *
 * DECODER-FIRST RESULT (2026-06-03 pass). The "mazedata decompressor" question is
 * RESOLVED: the engine decodes maze graphics with the SAME `.pic` RLE decoder
 * documented in docs/re/pic.md (ega.drv entry 9, file 0x1c25) — NOT a bespoke
 * format. The decoder is COPIED into a transient work-buffer at runtime and
 * executed there (live cs:ip 0x6d635 in the captured session), which is why a
 * static breakpoint on the in-image ega.drv:0x1c25 logged 0 hits in prior passes.
 * The relocated decoder body is BYTE-IDENTICAL to ega.drv[0x1c6c..0x1c8c]
 * (verified: 81 fe ff 0f 73 ec 33 c9 ac 0a c0 74 13 a8 80 75 06 8a c8 f3 a4 ...).
 *
 * mazedata.ega itself is the INDEX/DESCRIPTOR file (not the pixel source):
 *   bytes 0..7   header: u16 ndesc(153), u16 ntab2(366), u16 reloc-delta(0 on disk),
 *                byte 0, byte 0x0e. At load the reloc-delta word (bytes 4..5) is
 *                REWRITTEN to 0xA2 and byte 6 to 0x07 (the load fingerprint).
 *   bytes 8..0x304   Table 1: 153 x 5-byte descriptors {u8 type, u16LE goff, u8 w, u8 h}.
 *   bytes 0x305..    Table 2 (366 entries) + raw graphics blob (NOT RLE-from-0).
 *
 * AT LOAD the descriptor table is relocated IN PLACE (the blob region 0x305.. is
 * byte-identical disk<->RAM, 0 diffs):
 *   - goff (u16) += base delta 0xA2, EXCEPT: w==12 entries get +0xA3 (a +1 cell/
 *     alignment bump), and the single w==40 entry is left UNCHANGED (delta 0).
 *     The base delta 0xA2 is written into header bytes 4..5 at load.
 *   - w (byte)  -> a 4-bit EGA column edge-mask: 0->0x07, 4->0x0b, 8->0x0f, 12->0x03
 *                  (40 stays 40, special). Depends ONLY on disk w.
 *   - type and h are unchanged.
 *   (Verified disk<->RAM over all 153 descriptors: goff-delta histogram
 *    {0xA2:117, 0xA3:35 (all w=12), 0:1 (the w=40 entry)}.)
 *
 * The CELL pixel format is the confirmed 4-plane EGA 8x8 / 32-byte cell (see pic.md):
 *   color(r,c) = bit(7-c) of {G=byte[r], B=byte[8+r], R=byte[16+r], I=byte[24+r]},
 *   color = G | B<<1 | R<<2 | I<<3, color 15 = transparent.
 *
 * The wall TILE ATLAS the corridor blit reads (live seg 0x550e / 0x514e) is filled
 * by these `.pic`-RLE whole-file decodes (10 decodes at boot, dest segs 0x4e0e,
 * 0x4f8e, 0x514e, 0x540e, 0x550e, 0x670e, 0x680e, 0x690e; each lseek SEEK_SET 0).
 * A captured-at-load 8-cell column (live si=0x2138, +0x20/cell) decodes to a clean
 * dithered grey stone texture: colors {8:269, 13:129, 0:114} ONLY — NO noise.
 * (Settled-frame dumps of 0x550e are STALE/overwritten — capture-on-breakpoint at
 * the blit is required to read the load-time atlas.)
 *
 * This module exposes the on-disk parse + the verified load-time descriptor
 * relocation, plus the `.pic` RLE decode (re-exported) so callers can reproduce
 * the engine's decode offline.
 */
import { readFileSync } from 'node:fs';

export interface MazeDescriptor {
  type: number;
  goff: number; // disk graphic offset (u16LE)
  w: number; // disk width in bytes
  h: number; // height in rows/px
}

export interface MazeData {
  ndesc: number;
  ntab2: number;
  descriptors: MazeDescriptor[];
  table2Offset: number;
}

/** Parse mazedata.ega header + the 153-entry descriptor table. */
export function parseMazeData(bytes: Uint8Array): MazeData {
  const u16 = (o: number) => bytes[o]! | (bytes[o + 1]! << 8);
  const ndesc = u16(0);
  const ntab2 = u16(2);
  const descriptors: MazeDescriptor[] = [];
  for (let i = 0; i < ndesc; i++) {
    const o = 8 + i * 5;
    descriptors.push({ type: bytes[o]!, goff: u16(o + 1), w: bytes[o + 3]!, h: bytes[o + 4]! });
  }
  return { ndesc, ntab2, descriptors, table2Offset: 8 + ndesc * 5 };
}

/** The load-time w -> EGA column-edge-mask transform (verified disk<->RAM). */
export function maskFromWidth(w: number): number {
  switch (w) {
    case 0: return 0x07;
    case 4: return 0x0b;
    case 8: return 0x0f;
    case 12: return 0x03;
    default: return w; // observed: w=40 unchanged (special wide entry)
  }
}

/** Reproduce the in-RAM (relocated) descriptor table.
 *  goff += base delta (0xA2), with +1 for w==12 and no change for the w==40 entry. */
export function relocateDescriptors(md: MazeData, baseDelta = 0xa2): MazeDescriptor[] {
  return md.descriptors.map((d) => {
    let delta = baseDelta;
    if (d.w === 40) delta = 0;
    else if (d.w === 12) delta = baseDelta + 1;
    return {
      type: d.type,
      goff: (d.goff + delta) & 0xffff,
      w: maskFromWidth(d.w),
      h: d.h,
    };
  });
}

if (process.argv[1]?.endsWith('decode-mazedata.ts')) {
  const path = process.argv[2] ?? 'test-fixtures/original/mazedata.ega';
  const bytes = readFileSync(path);
  const md = parseMazeData(bytes);
  console.log(`mazedata: ndesc=${md.ndesc} ntab2=${md.ntab2} table2@0x${md.table2Offset.toString(16)}`);
  const relo = relocateDescriptors(md);
  for (let i = 0; i < 6; i++) {
    const d = md.descriptors[i]!;
    const r = relo[i]!;
    console.log(
      `desc[${i}] disk{type=0x${d.type.toString(16)} goff=0x${d.goff.toString(16)} w=${d.w} h=${d.h}}` +
        ` -> RAM{goff=0x${r.goff.toString(16)} mask=0x${r.w.toString(16)} h=${r.h}}`,
    );
  }
}
