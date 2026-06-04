/**
 * maze-allplanes-probe.ts — dump the per-region 8x8 N/W wall planes (region 0..5)
 * so we can see whether the emission difference comes from cross-region plane data.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
const u16 = (b: Uint8Array, o = 0): number => b[o]! | (b[o + 1]! << 8);
const MB = { north: 0x60, west: 0x120, special4: 0x1f8, orient2: 0x378, gx_base: 0x1e0, gy_base: 0x1ec };
function getBits(buf: Uint8Array, base: number, cell: number, nbits: number): number {
  const bitOff = cell * nbits;
  let v = 0;
  for (let i = 0; i < nbits; i++) {
    const b = bitOff + i;
    const byte = buf[base + (b >> 3)] ?? 0;
    v = (v << 1) | ((byte >> (7 - (b & 7))) & 1);
  }
  return v;
}
async function main() {
  const c = new HostClient();
  try {
    await c.unserialize(`${process.cwd()}/tools/libretro/states/maze-corridor.state`);
    await c.step(2);
    const base = await c.anchor();
    const ptr = u16(await c.read(base + 0x4faa, 2));
    const mb = await c.read(base + ptr, 0x2000);
    const gxBase = Array.from(mb.slice(MB.gx_base, MB.gx_base + 12));
    const gyBase = Array.from(mb.slice(MB.gy_base, MB.gy_base + 12));
    console.log('gxBase', gxBase, '\ngyBase', gyBase);
    for (let r = 0; r < 6; r++) {
      console.log(`\n=== region ${r} (gx[${gxBase[r]}..] gy[${gyBase[r]}..]) cells region*64+cA*8+cB ===`);
      console.log('  N grid (rows cA=0..7, cols cB=0..7):');
      for (let cA = 0; cA < 8; cA++) {
        const row = [];
        for (let cB = 0; cB < 8; cB++) row.push(getBits(mb, MB.north, r * 64 + cA * 8 + cB, 2));
        console.log('    cA' + cA + ': ' + row.join(' '));
      }
      console.log('  W grid:');
      for (let cA = 0; cA < 8; cA++) {
        const row = [];
        for (let cB = 0; cB < 8; cB++) row.push(getBits(mb, MB.west, r * 64 + cA * 8 + cB, 2));
        console.log('    cA' + cA + ': ' + row.join(' '));
      }
    }
  } finally {
    c.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
