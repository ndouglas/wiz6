/**
 * probe-gate-poke.ts — directly POKE door_phase (0x363e) and force a redraw to
 * prove it drives the gate-open render (and to capture the lift frames that the
 * fast-emulation walk collapses into a single retro_run).
 *
 * For each committed walk state (party in front of / on the gate cell), write
 * door_phase ∈ {0,1,2,3,4,8}, step a couple frames (the maze rebuilds every
 * frame and re-reads door_phase), and capture the framebuffer. If the gate
 * recess visibly lifts as phase increases, the mechanism is confirmed.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const GS = 0x363a, DOOR = 0x363e;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }

// Viewport rect (the 3D dungeon view) — MAZE_VIEWPORT x72..247 y32..143.
function vpDigest(rgba: Uint8Array) {
  let nb = 0, sum = 0;
  for (let y = 32; y < 144; y++) for (let x = 72; x < 248; x++) {
    const p = (y * 320 + x) * 4; const v = (rgba[p]! + rgba[p + 1]! + rgba[p + 2]!);
    if (v !== 0) nb++; sum = (sum + v * (x + 1) * (y + 1)) >>> 0;
  }
  return { nb, sum };
}

async function main() {
  const c = new HostClient();
  try {
    for (const st of ['04-walk-gy119', '05-walk-gy120', '06-walk-gy121-hmmm']) {
      const tmp = `/tmp/poke-${st}.state`;
      writeFileSync(tmp, gunzipSync(readFileSync(`test-fixtures/states/newgame-seq-${st}.state.gz`)));
      await c.unserialize(tmp); await c.step(5);
      const base = await c.anchor();
      console.log(`\n=== ${st} (gs=${u16(await c.read(base + GS, 2), 0)}) ===`);
      for (const ph of [0, 1, 2, 3, 4, 8]) {
        await c.write(base + DOOR, [ph & 0xff, (ph >> 8) & 0xff]);
        await c.step(2);
        const rb = u16(await c.read(base + DOOR, 2), 0);   // did it stick (or get reset)?
        const path = `/tmp/wiz6-poke-${st}-ph${ph}.rgba`;
        await c.fb(path);
        const rgba = readFileSync(path);
        const d = vpDigest(rgba);
        console.log(`  phase=${ph} (readback=${rb}) vp_nonblack=${d.nb} vp_hash=${d.sum}`);
        writeFileSync(`/tmp/wiz6-poke-${st}-ph${ph}.png`, encodePngRgba(320, 200, rgba));
      }
    }
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
