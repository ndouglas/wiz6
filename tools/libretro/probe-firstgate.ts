/**
 * probe-firstgate.ts — densely capture the FIRST gate (gy118→119 transition) on
 * the cracked success path, to confirm it animates open (a second portcullis the
 * port currently jumps past as static stills) and get its frames. Also re-grabs
 * the gy120→121 second-gate transition for comparison.
 *
 * Drives cracked → auto-push; captures EVERY frame while gy is 118 or 120 (the
 * gate-approach cells, where the opening animation plays as the party crosses).
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { readFileSync, writeFileSync, cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const GS = 0x363a, GYO = 0x4fa2;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function gy(c: HostClient) { return u16(await c.read((await c.anchor()) + GYO, 2), 0); }
async function gsv(c: HostClient) { return u16(await c.read((await c.anchor()) + GS, 2), 0); }
async function park(c: HostClient) { await c.mouse(-4000, -4000); await c.step(1); }
async function save(c: HostClient, tag: string) { const p = `/tmp/fg-${tag}.rgba`; await c.fb(p); writeFileSync(`/tmp/fg-${tag}.png`, encodePngRgba(320, 200, readFileSync(p))); }

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'wiz6-cracked-'));
  cpSync('test-fixtures/original', dir, { recursive: true });
  const ovr = join(dir, 'wbase.ovr'); const b = readFileSync(ovr); b[0x1192] = 0xeb; writeFileSync(ovr, b);
  const c = new HostClient({ source: dir });
  try {
    await c.step(3000);
    await c.key('enter', 'tap'); await c.step(800);
    for (let i = 0; i < 6; i++) { await c.key('enter', 'tap'); await c.step(150); await c.key('enter', 'tap'); await c.step(150); for (let k = 0; k < 4; k++) await c.key('up', 'tap'); await c.step(80); }
    await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(120);
    await c.key('enter', 'tap'); await c.step(120);
    await c.key('enter', 'tap');
    for (let f = 0; f < 300; f++) { if (await gsv(c) === 5) break; await c.step(2); }

    // Capture the FULL gy=118 dwell (every 3rd frame) to find where the first gate
    // opens; periodic ENTER to advance the beats. Track viewport changes.
    let n118 = 0, lastEnter = 0;
    for (let f = 0; f < 2600; f++) {
      const g = await gy(c);
      if (g === 118 && f % 3 === 0 && n118 < 200) { await park(c); await save(c, `g118-${String(n118).padStart(3, '0')}`); n118++; }
      if (f - lastEnter >= 100) { await c.key('enter', 'tap'); lastEnter = f; }
      await c.step(1);
      if (g >= 119) { console.log(`left gy=118 at frame ${f}`); break; }
    }
    console.log(`done: gy=${await gy(c)}; captured g118=${n118}`);
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
