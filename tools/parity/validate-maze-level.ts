/**
 * validate-maze-level.ts — byte-exact gate for the from-disk maze-level extractor.
 *
 * Reads the live in-RAM MazeBlock from `*0x4faa` on the NIGHTLY dosbox-pure core
 * (maze-corridor.state, zone 0) and diffs it against extractMazeLevel(0) decoded
 * offline from scenario.dbs/disk.hdr/master.hdr. The gate is 0 diffs across every
 * region plane (N/W/special4/orient2/pit) AND both region tables (gxBase/gyBase).
 *
 * Requires the NIGHTLY core (tools/libretro/fetch-core.sh) — committed states do
 * not unserialize on the patched trace core. Exit 0 = byte-exact, 1 = mismatch.
 *
 *   pnpm tsx tools/parity/validate-maze-level.ts
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { decodeMazeBlock, extractMazeLevel, type MazeBlock } from './extract-mazedata.js';

const STATE = `${process.cwd()}/tools/libretro/states/maze-corridor.state`;
const MAZE_PTR = 0x4faa; // DGROUP near ptr to the per-level maze block
const RECORD_LEN = 1346; // bank-2 record size (covers all planes)

const u16 = (b: Uint8Array, o = 0): number => b[o]! | (b[o + 1]! << 8);

/** Read the live maze-block record bytes (verbatim) from RAM. */
async function readLiveRecord(c: HostClient): Promise<Uint8Array> {
  await c.unserialize(STATE);
  await c.step(2);
  const base = await c.anchor();
  const ptr = u16(await c.read(base + MAZE_PTR, 2));
  return c.read(base + ptr, RECORD_LEN);
}

function diffBlocks(a: MazeBlock, b: MazeBlock): string[] {
  const diffs: string[] = [];
  for (let r = 0; r < 12; r++) {
    if (a.gxBase[r] !== b.gxBase[r]) diffs.push(`gxBase[${r}] live=${a.gxBase[r]} disk=${b.gxBase[r]}`);
    if (a.gyBase[r] !== b.gyBase[r]) diffs.push(`gyBase[${r}] live=${a.gyBase[r]} disk=${b.gyBase[r]}`);
  }
  for (let r = 0; r < 12; r++) {
    for (let i = 0; i < 64; i++) {
      const la = a.regions[r]![i]!;
      const lb = b.regions[r]![i]!;
      for (const k of ['north', 'west', 'special4', 'orient2', 'pit'] as const) {
        if (la[k] !== lb[k]) diffs.push(`region${r} cell${i} ${k} live=${la[k]} disk=${lb[k]}`);
      }
    }
  }
  return diffs;
}

async function main() {
  const c = new HostClient();
  try {
    const record = await readLiveRecord(c);
    // Decode the live record bytes with the SAME offline decoder (same getBits +
    // offsets) so the diff isolates the on-disk SOURCE, not the field decode.
    const live = decodeMazeBlock(record);
    const disk = extractMazeLevel(0);
    const diffs = diffBlocks(live, disk);
    const nz = disk.regions.reduce(
      (acc, region) => acc + region.filter((cell) => cell.north || cell.west || cell.special4 || cell.orient2 || cell.pit).length,
      0,
    );
    console.log(`live *0x4faa block vs extractMazeLevel(0) [scenario.dbs bank 2 record 0]`);
    console.log(`  12 regions × 64 cells (${nz}/768 non-empty) + gxBase[12] + gyBase[12]`);
    if (diffs.length === 0) {
      console.log('  BYTE-EXACT: 0 diffs across all planes + region tables.');
      process.exit(0);
    } else {
      console.log(`  MISMATCH: ${diffs.length} diffs`);
      for (const d of diffs.slice(0, 30)) console.log('    ' + d);
      process.exit(1);
    }
  } finally {
    c.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
