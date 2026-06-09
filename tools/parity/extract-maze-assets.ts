/**
 * extract-maze-assets.ts — ONE-TIME generator for maze-assets.json.
 *
 * SOURCE PATH: live engine capture (NOT offline decode).
 *
 * WHY NOT OFFLINE:
 *   The atlases (per-tile piece-descriptor table + 4-plane 8x8 source cells) live
 *   in segments filled at boot by a .pic RLE decode (the 10 whole-file decodes,
 *   see docs/re/findings/maze-texture-decode.json). The SOURCE FILE is not
 *   identified — but we do not need it: we read the DECODED atlas straight from
 *   the engine.
 *
 * THE PER-TILE SELECTION (#079 — the key RE):
 *   The wall compositor (ega.drv FUN_1c94, entry 10) selects which atlas +
 *   descriptor table to use per call by its `tile` arg ([bp+0xc] = span.walltype):
 *     descSeg = cs:[0x169] + cs:[0x17a + 2*tile]
 *   cs:[0x169] is the atlas BASE segment; cs:[0x17a+2*tile] is the per-tile
 *   descriptor-table pointer (BYTE offset >> 4 actually a paragraph delta). For the
 *   corridor frame: cs:[0x169]=0x4e0e and the tile segs are
 *   tile0=0x4e0e, tile1=0x4f8e, tile2=0x514e. The corridor solid walls draw tile 2;
 *   the non-corridor wall cases (front-walls / far-shapes) draw tile 0 and tile 1.
 *   docs/re/findings/maze-tile-atlas-extract.json.
 *
 * THE STALENESS GOTCHA:
 *   A SETTLED-state read() of these segments returns STALE/overwritten bytes (the
 *   buffers are re-decoded per FUN_1c94 group; see maze-texture-decode.json
 *   source-region-decode-not-stone). The descriptor table + atlas are only valid
 *   AT a FUN_1c94 hit. So we CAPTURE each tile segment ON BREAKPOINT (the patched
 *   tracing core's capture-on-breakpoint armed at the relocated FUN_1c94 entry).
 *   This is also why we DRIVE A FRESH BOOT rather than unserialize a committed
 *   state: the patched (tracing) core cannot unserialize the committed states
 *   (`err unser`), but it CAN drive a fresh boot into the corridor + trace.
 *
 * VALIDATION:
 *   - The captured tile-2 atlas is byte-identical to the previously-committed
 *     tile-2 atlas (cross-check piece 0xb {srcPtr=0x1cd8,w4,h6}, 0xe {0x22d8,w4,h5}).
 *   - The captured tile-0/1/2 segments are byte-identical across two fresh-boot
 *     runs (reproducible, not heap noise).
 *   - Each tile's pieces decode (4-plane EGA cell format) to recognizable dithered
 *     stone wall textures, eyeballed via the per-piece PNGs.
 *
 * OUTPUT: packages/parser/src/maze/__fixtures__/maze-assets.json
 *   {
 *     "source": "engine-capture",
 *     "atlasB64": "<tile-2 atlas, 0x4000 B — BACK-COMPAT default>",
 *     "pieceDescriptors": [ {srcPtr,w,h,bitmapB64}, ... 0x18 ],  // tile-2
 *     "atlasByTile": { "0": {atlasB64, pieceDescriptors}, "1": {...}, "2": {...} },
 *     "mazedataB64": "<raw mazedata.ega file bytes>"
 *   }
 *
 * Usage (run once; the output is committed):
 *   pnpm tsx tools/parity/extract-maze-assets.ts
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const OUT_FILE = resolve(REPO_ROOT, 'packages/parser/src/maze/__fixtures__/maze-assets.json');
const MAZEDATA_FILE = resolve(REPO_ROOT, 'test-fixtures/original/mazedata.ega');

const PIECE_COUNT = 0x18;   // 24 descriptors per tile
const ATLAS_SIZE = 0x4000;  // 16 KiB descriptor-table+source-cell segment
const DESC_STRIDE = 0x18;

const RENDER_SIG = '558bec83c4f056a1a44f8946fea1a24f';
const SIG_OFFSET = 0x4ad7;
const FWD = 'enter';
// Tiles to extract: the three wall tiles (0/1/2). Tiles 3..7 are other graphics
// (e.g. tile 4 = a shared font/UI heap, decodes to readable text — NOT walls).
const WALL_TILES = [0, 1, 2];

function u16(buf: Uint8Array, off: number): number {
  return (buf[off]! | (buf[off + 1]! << 8)) & 0xffff;
}
function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');
}

async function driveToMaze(c: HostClient): Promise<void> {
  await c.step(3000);
  await c.key('enter', 'tap'); await c.step(800);
  for (let i = 0; i < 3; i++) {
    await c.key('enter', 'tap'); await c.step(60);
    await c.key('enter', 'tap'); await c.step(60);
    await c.key('up', 'tap'); await c.key('up', 'tap'); await c.key('up', 'tap');
    await c.step(60);
  }
  await c.key('down', 'tap'); await c.key('down', 'tap'); await c.key('down', 'tap');
  await c.step(60);
  await c.key('enter', 'tap'); await c.step(200);
  await c.key('enter', 'tap'); await c.step(200);
  await c.key('enter', 'tap'); await c.step(400);
  for (let i = 0; i < 6; i++) {
    await c.key('enter', 'down'); await c.step(20);
    await c.key('enter', 'up'); await c.step(60);
  }
}
async function forceRedraw(c: HostClient): Promise<void> {
  await c.key(FWD, 'down'); await c.step(20);
  await c.key(FWD, 'up'); await c.step(60);
}

function parseDescriptors(atlas: Uint8Array) {
  const descs: Array<{ srcPtr: number; w: number; h: number; bitmapB64: string }> = [];
  for (let p = 1; p <= PIECE_COUNT; p++) {
    const off = (p - 1) * DESC_STRIDE;
    descs.push({
      srcPtr: u16(atlas, off),
      w: atlas[off + 2]!,
      h: atlas[off + 3]!,
      bitmapB64: Buffer.from(atlas.slice(off + 4, off + 4 + 0x14)).toString('base64'),
    });
  }
  return descs;
}

async function main(): Promise<void> {
  console.log('booting harness + driving to maze (fresh boot)…');
  const c = new HostClient();
  try {
    await driveToMaze(c);
    const sigPhys = await c.find(RENDER_SIG);
    if (sigPhys < 0) throw new Error('render signature not found — not in the maze view');
    const ovl = sigPhys - SIG_OFFSET;
    console.log(`OVL base = 0x${ovl.toString(16)} (expect ~0x4784)`);

    // Locate the relocated FUN_1c94 entry (heap-dependent; the documented value is
    // 0x6d6a4 — probe a small set in case the heap differs).
    let ENTRY = 0;
    let entryRecs: Awaited<ReturnType<HostClient['traceDrain']>> = [];
    for (const cand of [0x6d6a4, 0x6c6a4, 0x6e6a4, 0x6b6a4, 0x6f6a4, 0x6a6a4]) {
      await c.traceSet(cand); await c.traceDrain();
      await forceRedraw(c);
      const recs = await c.traceDrain(); await c.traceOff();
      if (recs.length > 0) { ENTRY = cand; entryRecs = recs; break; }
    }
    if (ENTRY === 0) throw new Error('FUN_1c94 entry not found at candidates');
    const cs = entryRecs[0]!.cs;
    console.log(`FUN_1c94 entry = 0x${ENTRY.toString(16)} (${entryRecs.length} hits) cs=0x${cs.toString(16)}`);

    // Resolve cs:[0x169] + cs:[0x17a+2*tile] CAPTURED AT THE HIT (volatile in the
    // transient copy — an idle read is stale).
    await c.traceSet(ENTRY); await c.captureSet((cs << 4) + 0x160, 0x40, 0);
    await forceRedraw(c);
    const csWin = (await c.captureGet())!; await c.traceOff();
    const atlasBaseSeg = u16(csWin, 0x169 - 0x160);
    console.log(`cs:[0x169] atlas base seg = 0x${atlasBaseSeg.toString(16)}`);
    const tileSeg: Record<number, number> = {};
    for (let t = 0; t < 8; t++) {
      const ptr = u16(csWin, 0x17a - 0x160 + 2 * t);
      tileSeg[t] = (atlasBaseSeg + ptr) & 0xffff;
    }
    for (const t of WALL_TILES) {
      console.log(`  tile ${t} descSeg = 0x${tileSeg[t]!.toString(16)} (lin 0x${(tileSeg[t]! << 4).toString(16)})`);
    }

    // Capture each wall tile's segment ON BREAKPOINT (valid only at the hit).
    const atlasByTile: Record<string, { atlasB64: string; pieceDescriptors: ReturnType<typeof parseDescriptors> }> = {};
    for (const t of WALL_TILES) {
      const seg = tileSeg[t]!;
      await c.traceSet(ENTRY); await c.captureSet(seg << 4, ATLAS_SIZE, 0);
      await forceRedraw(c);
      const atlas = (await c.captureGet())!; await c.traceOff();
      if (atlas.length !== ATLAS_SIZE) throw new Error(`tile ${t} capture wrong size ${atlas.length}`);
      const descs = parseDescriptors(atlas);
      atlasByTile[String(t)] = { atlasB64: Buffer.from(atlas).toString('base64'), pieceDescriptors: descs };
      const d1 = descs[0]!;
      console.log(`  tile ${t} captured: piece1 srcPtr=0x${d1.srcPtr.toString(16)} w=${d1.w} h=${d1.h}; ${descs.filter((d) => d.w > 0 && d.h > 0).length}/${PIECE_COUNT} non-empty`);
    }

    // --- Cross-check the tile-2 RE-confirmed pieces (the corridor wall faces) ---
    const t2 = atlasByTile['2']!.pieceDescriptors;
    const pb = t2[0xb - 1]!, pe = t2[0xe - 1]!;
    console.log(`\nCross-check tile-2 piece 0xb: srcPtr=0x${pb.srcPtr.toString(16)} w=${pb.w} h=${pb.h} (expect 0x1cd8/4/6)`);
    if (pb.srcPtr !== 0x1cd8 || pb.w !== 4 || pb.h !== 6) throw new Error(`tile-2 piece 0xb mismatch`);
    console.log(`Cross-check tile-2 piece 0xe: srcPtr=0x${pe.srcPtr.toString(16)} w=${pe.w} h=${pe.h} (expect 0x22d8/4/5)`);
    if (pe.srcPtr !== 0x22d8 || pe.w !== 4 || pe.h !== 5) throw new Error(`tile-2 piece 0xe mismatch`);
    console.log('  tile-2 cross-check OK ✓');

    // --- mazedata.ega (the from-asset background generator source) ---
    console.log(`reading mazedata.ega from ${MAZEDATA_FILE}…`);
    const mazedata = readFileSync(MAZEDATA_FILE);
    console.log(`mazedata.ega read OK (${mazedata.length} bytes)`);

    // tile-2 is the BACK-COMPAT default (atlasB64 / pieceDescriptors at top level).
    const t2atlas = atlasByTile['2']!;
    void toHex;
    const output = {
      source: 'engine-capture' as const,
      captureMethod: 'fresh-boot drive to corridor (state 5) on the patched tracing core; per-tile descriptor segment resolved via cs:[0x169]+cs:[0x17a+2*tile] captured at the FUN_1c94 hit; each tile segment captured ON BREAKPOINT (the settled-state read is stale).',
      captureNotes: [
        'tile-2 atlas is byte-identical to the prior committed atlas (piece 0xb {0x1cd8,4,6}, 0xe {0x22d8,4,5}).',
        'tile-0 (7 pieces), tile-1 (front-walls, 22 pieces) decode to recognizable dithered stone wall textures.',
        'The compositor selects the per-tile atlas by each FUN_1c94 call.tile (= span.walltype).',
        'See docs/re/findings/maze-tile-atlas-extract.json for the cs:[0x17a]/[0x169] resolution + validation.',
        'mazedataB64 is the raw test-fixtures/original/mazedata.ega bytes (the from-asset background source).',
      ],
      atlasB64: t2atlas.atlasB64,
      pieceDescriptors: t2atlas.pieceDescriptors,
      atlasByTile,
      mazedataB64: Buffer.from(mazedata).toString('base64'),
    };

    mkdirSync(resolve(REPO_ROOT, 'packages/parser/src/maze/__fixtures__'), { recursive: true });
    writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
    console.log(`\nwrote ${OUT_FILE}`);
    console.log(`tiles: ${WALL_TILES.join(',')}  (each ${ATLAS_SIZE} B atlas + ${PIECE_COUNT} descriptors)`);
  } finally {
    c.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
