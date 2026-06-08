/**
 * probe-entry-densecap.ts — densely capture the entry transition frames to SEE
 * the door-slide + gate animations (which are viewport animations, NOT door_phase,
 * and do NOT collapse at normal speed). Cracked magicword (always-success) so the
 * prompt passes in one ENTER. Captures every Nth frame from the magicword submit
 * through the walk into PNGs for visual inspection.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { readFileSync, writeFileSync, cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const GS = 0x363a, GYO = 0x4fa2;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function gs(c: HostClient) { return u16(await c.read((await c.anchor()) + GS, 2), 0); }
async function gy(c: HostClient) { return u16(await c.read((await c.anchor()) + GYO, 2), 0); }
async function dump(c: HostClient, t: string) { const p = `/tmp/dc-${t}.rgba`; await c.fb(p); writeFileSync(`/tmp/dc-${t}.png`, encodePngRgba(320, 200, readFileSync(p))); }

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'wiz6-cracked-'));
  cpSync('test-fixtures/original', dir, { recursive: true });
  const ovr = join(dir, 'wbase.ovr'); const buf = readFileSync(ovr); buf[0x1192] = 0xeb; writeFileSync(ovr, buf);

  const c = new HostClient({ source: dir });
  try {
    const EVERY = 3;
    await c.step(3000);
    await c.key('enter', 'tap'); await c.step(800);
    for (let i = 0; i < 6; i++) { await c.key('enter', 'tap'); await c.step(150); await c.key('enter', 'tap'); await c.step(150); for (let k = 0; k < 4; k++) await c.key('up', 'tap'); await c.step(80); }
    await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(120);
    await c.key('enter', 'tap'); await c.step(120);   // START NEW GAME → magicword
    await c.key('enter', 'tap');                       // submit empty → cracked success

    // Dense capture: every EVERY-th frame for the whole transition + walk. Press
    // the single APPROACHING ENTER if we sit at gy=118.
    let idx = 0, sat118 = 0;
    for (let f = 0; f < 900; f++) {
      if (f % EVERY === 0) {
        const g = await gy(c); const state = await gs(c);
        await dump(c, `${String(idx).padStart(3, '0')}-f${String(f).padStart(3, '0')}-gs${state}-gy${g}`);
        idx++;
        if (state === 5 && g === 118) { sat118++; if (sat118 === 20) { await c.key('enter', 'tap'); } }
      }
      await c.step(1);
    }
    console.log(`captured ${idx} frames; final gy=${await gy(c)} gs=${await gs(c)}`);
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
