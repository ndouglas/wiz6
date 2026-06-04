/**
 * maze-decor-probe.ts — dump special4 (+0x1f8, 4-bit) and orient2 (+0x378, 2-bit)
 * for region 0 and region 1, to find where special4==4 (the code-9 solid-wall
 * decoration) lives relative to the lookback corridor path.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
const u16 = (b: Uint8Array, o = 0): number => b[o]! | (b[o + 1]! << 8);
const MB = { special4: 0x1f8, orient2: 0x378, north: 0x60, west: 0x120 };
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
    for (const r of [0, 1, 2]) {
      console.log(`\n=== region ${r}: special4 (4b) grid [cA rows, cB cols] ===`);
      for (let cA = 0; cA < 8; cA++) {
        const row = [];
        for (let cB = 0; cB < 8; cB++) row.push(getBits(mb, MB.special4, r * 64 + cA * 8 + cB, 4).toString(16));
        console.log('  cA' + cA + ': ' + row.join(' '));
      }
      console.log(`  region ${r}: orient2 (2b) grid:`);
      for (let cA = 0; cA < 8; cA++) {
        const row = [];
        for (let cB = 0; cB < 8; cB++) row.push(getBits(mb, MB.orient2, r * 64 + cA * 8 + cB, 2));
        console.log('  cA' + cA + ': ' + row.join(' '));
      }
    }
    // Where is special4==4?
    console.log('\ncells with special4==4 (region, cA, cB):');
    for (let r = 0; r < 6; r++)
      for (let cA = 0; cA < 8; cA++)
        for (let cB = 0; cB < 8; cB++)
          if (getBits(mb, MB.special4, r * 64 + cA * 8 + cB, 4) === 4)
            console.log(`  r${r} cA${cA} cB${cB} orient2=${getBits(mb, MB.orient2, r * 64 + cA * 8 + cB, 2)}`);
  } finally {
    c.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
