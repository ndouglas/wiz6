/**
 * extract-maze-assets.ts — ONE-TIME generator for maze-assets.json.
 *
 * SOURCE PATH: live engine capture (NOT offline decode).
 *
 * WHY NOT OFFLINE:
 *   The atlas (piece descriptor table + 4-plane 8x8 source cells) lives in a
 *   segment that is filled at boot by a .pic RLE decode into one of the segs
 *   0x4e0e/0x4f8e/0x514e/0x540e/0x550e/… (10 whole-file decodes, see
 *   docs/re/findings/maze-texture-decode.json "decompressor-is-pic-rle-decoder-relocated").
 *   The SOURCE FILE whose decode fills that segment is NOT yet identified (listed
 *   as an open question in maze-texture-decode.json). Without the file name we
 *   cannot reproduce the decode offline. Therefore we read the atlas from a
 *   committed serialized engine state (tools/libretro/states/maze-corridor.state)
 *   using the HostClient read() API (nightly core — no tracing required).
 *
 * HOW WE FIND THE SEGMENT:
 *   The descriptor table format at the source seg is:
 *     per piece p (1-indexed): entry at (p-1)*0x18 = {srcPtr(u16), w(cells),
 *     h(cell-rows), presenceBitmap[0x14 bytes]}
 *   From docs/re/findings/maze-stage1-compositor.json
 *   (compositor-bridge-walltype-depth-to-piece-source) piece 0xb is:
 *     {srcPtr=0x1cd8, w=4, h=6, bitmap=ff ff ff...}
 *   We search for the 0xb-entry signature (starting at desc_base + 0xf0 = 0xa*0x18):
 *     d8 1c 04 06 ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff
 *   That locates the descriptor TABLE base = match - 0xf0. The full 0x4000-byte
 *   atlas = 0x4000 bytes from that table base.
 *
 * OUTPUT: packages/parser/src/maze/__fixtures__/maze-assets.json
 *   {
 *     "source":  "engine-capture",
 *     "stateFile": "tools/libretro/states/maze-corridor.state",
 *     "atlasB64": "<base64 of 0x4000 bytes>",
 *     "pieceDescriptors": [
 *       { "srcPtr": N, "w": N, "h": N, "bitmapB64": "<base64 of 0x14 bytes>" },
 *       ...  (0x18 descriptors, pieces 1..0x18)
 *     ]
 *   }
 *
 * Usage (run once; the output is committed):
 *   pnpm tsx tools/parity/extract-maze-assets.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const STATE_FILE = resolve(REPO_ROOT, 'tools/libretro/states/maze-corridor.state');
const OUT_FILE = resolve(REPO_ROOT, 'packages/parser/src/maze/__fixtures__/maze-assets.json');

const PIECE_COUNT = 0x18;     // 24 pieces total in the descriptor table
const ATLAS_SIZE  = 0x4000;   // 16 KiB — the full descriptor seg snapshot
const DESC_STRIDE = 0x18;     // bytes per descriptor entry

// Known signature for piece 0xb (the left-wall face piece), verified in
// docs/re/findings/maze-stage1-compositor.json (compositor-bridge finding):
//   offset in table: (0xb - 1) * 0x18 = 0xf0
//   bytes: srcPtr=0x1cd8 (d8 1c LE), w=4 (cells), h=6 (rows), bitmap=ff*24 bytes (all-present)
// NOTE: the bitmap is 0x14 bytes per descriptor, only the first 3 bytes used for
// a 4x6 = 24-cell piece (all bits set = all cells present). The remaining 0x11
// bytes are padding zeros in the engine record.
const SIG_PIECE_B  = Uint8Array.from([
  0xd8, 0x1c, 0x04, 0x06, // srcPtr=0x1cd8, w=4, h=6
  0xff, 0xff, 0xff,        // bitmap bytes 0..2 (24 cells, all present)
]);
const SIG_PIECE_B_OFFSET = (0xb - 1) * DESC_STRIDE; // = 0xf0

function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');
}

function u16(buf: Uint8Array, off: number): number {
  return (buf[off]! | (buf[off + 1]! << 8)) & 0xffff;
}

async function main(): Promise<void> {
  console.log(`booting harness...`);
  const c = new HostClient();
  try {
    // Boot the harness (runs a few frames of initialization).
    await c.step(3000);

    // Restore the committed corridor state.
    console.log(`unserializing ${STATE_FILE}...`);
    await c.unserialize(STATE_FILE);
    await c.step(2);

    // --- Locate the descriptor table via the known piece-0xb signature ---
    console.log(`searching for piece-0xb signature: ${toHex(SIG_PIECE_B)}...`);
    const sigHex = Array.from(SIG_PIECE_B, (x) => x.toString(16).padStart(2, '0')).join('');
    const sigPhys = await c.find(sigHex);
    if (sigPhys < 0) throw new Error('piece-0xb signature not found in guest memory — wrong state or corrupted atlas');
    const tableBase = sigPhys - SIG_PIECE_B_OFFSET;
    const atlasSeg  = tableBase >> 4; // the segment value (lin = seg << 4)
    console.log(`found piece-0xb sig at lin 0x${sigPhys.toString(16)}`);
    console.log(`descriptor table base = 0x${tableBase.toString(16)} (seg 0x${atlasSeg.toString(16)})`);

    // --- Read the atlas (0x4000 bytes from the table base) ---
    console.log(`reading ${ATLAS_SIZE} bytes of atlas from lin 0x${tableBase.toString(16)}...`);
    const atlas = await c.read(tableBase, ATLAS_SIZE);
    console.log(`atlas read OK (${atlas.length} bytes)`);

    // --- Parse + verify the descriptor table ---
    console.log(`parsing ${PIECE_COUNT} piece descriptors...`);
    const pieceDescriptors: Array<{ srcPtr: number; w: number; h: number; bitmapB64: string }> = [];
    for (let p = 1; p <= PIECE_COUNT; p++) {
      const off = (p - 1) * DESC_STRIDE;
      const srcPtr   = u16(atlas, off);
      const w        = atlas[off + 2]!;
      const h        = atlas[off + 3]!;
      const bitmap   = atlas.slice(off + 4, off + 4 + 0x14);
      const bitmapB64 = Buffer.from(bitmap).toString('base64');
      pieceDescriptors.push({ srcPtr, w, h, bitmapB64 });
      if (p <= 6 || p === 0xb || p === 0xe) {
        console.log(`  piece 0x${p.toString(16).padStart(2,'0')}: srcPtr=0x${srcPtr.toString(16)} w=${w} h=${h} bitmap[0..3]=${toHex(bitmap.slice(0,4))}`);
      }
    }

    // --- Cross-check the known RE-confirmed values ---
    const pb = pieceDescriptors[0xb - 1]!;
    const pe = pieceDescriptors[0xe - 1]!;
    const bitmapB_raw = Buffer.from(pb.bitmapB64, 'base64');
    console.log(`\nCross-check piece 0xb: srcPtr=0x${pb.srcPtr.toString(16)} w=${pb.w} h=${pb.h}`);
    console.log(`  Expected: srcPtr=0x1cd8 w=4 h=6`);
    if (pb.srcPtr !== 0x1cd8 || pb.w !== 4 || pb.h !== 6) {
      throw new Error(`piece 0xb mismatch! Expected srcPtr=0x1cd8 w=4 h=6, got srcPtr=0x${pb.srcPtr.toString(16)} w=${pb.w} h=${pb.h}`);
    }
    console.log(`  OK ✓`);
    console.log(`Cross-check piece 0xe: srcPtr=0x${pe.srcPtr.toString(16)} w=${pe.w} h=${pe.h}`);
    console.log(`  Expected: srcPtr=0x22d8 w=4 h=5`);
    if (pe.srcPtr !== 0x22d8 || pe.w !== 4 || pe.h !== 5) {
      throw new Error(`piece 0xe mismatch! Expected srcPtr=0x22d8 w=4 h=5, got srcPtr=0x${pe.srcPtr.toString(16)} w=${pe.w} h=${pe.h}`);
    }
    console.log(`  OK ✓`);
    void bitmapB_raw;

    // --- Verify bitmaps are non-zero (sanity check against reading garbage) ---
    let nonZeroDescs = 0;
    for (const d of pieceDescriptors) {
      if (d.w > 0 || d.h > 0 || d.srcPtr > 0) nonZeroDescs++;
    }
    console.log(`\n${nonZeroDescs}/${PIECE_COUNT} descriptors have non-zero fields`);
    if (nonZeroDescs < 4) throw new Error('too few non-zero descriptors — something is wrong with the read');

    // --- Write the JSON ---
    mkdirSync(resolve(REPO_ROOT, 'packages/parser/src/maze/__fixtures__'), { recursive: true });
    const output = {
      // Provenance header (used by loadMazeAssets and for audit).
      source: 'engine-capture' as const,
      stateFile: 'tools/libretro/states/maze-corridor.state',
      captureNotes: [
        'Atlas captured from committed serialized state (maze-corridor.state) using HostClient.read().',
        'Segment located by searching for the piece-0xb descriptor signature (srcPtr=0x1cd8, w=4, h=6, bitmap=ff ff ff).',
        'Cross-checked: piece 0xb {srcPtr=0x1cd8, w=4, h=6} and piece 0xe {srcPtr=0x22d8, w=4, h=5}',
        'match docs/re/findings/maze-stage1-compositor.json (compositor-bridge-walltype-depth-to-piece-source).',
        'The atlas is the full 0x4000-byte descriptor+source-cell segment; srcPtr in each descriptor',
        'addresses the source 8x8 4-plane cells within this same buffer.',
        'See tools/parity/render-maze-frame.ts for the descriptor/atlas format documentation.',
      ],
      atlasB64: Buffer.from(atlas).toString('base64'),
      pieceDescriptors,
    };

    writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
    console.log(`\nwrote ${OUT_FILE}`);
    console.log(`atlas size: ${atlas.length} bytes  pieces: ${pieceDescriptors.length}`);

  } finally {
    c.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
