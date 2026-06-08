/**
 * probe-magicword.ts — determine how the magicword copy-protection is passed.
 * From the magicword prompt, press ENTER repeatedly (with settle) and watch the
 * game_state word flip to 5 (dungeon). Logs gs + a PNG after each press.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const GAME_STATE = 0x363a;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function gs(c: HostClient) { return u16(await c.read((await c.anchor()) + GAME_STATE, 2), 0); }
async function snap(c: HostClient, tag: string) {
  await c.fb(`/tmp/wiz6-mw-${tag}.rgba`);
  writeFileSync(`/tmp/wiz6-mw-${tag}.png`, encodePngRgba(320, 200, readFileSync(`/tmp/wiz6-mw-${tag}.rgba`)));
}

async function main() {
  const c = new HostClient();
  try {
    await c.step(3000);
    await c.key('enter', 'tap'); await c.step(800);
    for (let i = 0; i < 6; i++) {
      await c.key('enter', 'tap'); await c.step(150);
      await c.key('enter', 'tap'); await c.step(150);
      await c.key('up', 'tap'); await c.key('up', 'tap'); await c.key('up', 'tap'); await c.key('up', 'tap'); await c.step(80);
    }
    await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(120);
    await c.key('enter', 'tap'); await c.step(400);   // START NEW GAME → magicword
    console.log('magicword gs=', await gs(c));
    await snap(c, 'p00');
    for (let i = 1; i <= 8; i++) {
      await c.key('enter', 'tap'); await c.step(250);
      const g = await gs(c);
      console.log(`ENTER#${i}: gs=${g}`);
      await snap(c, `p${String(i).padStart(2, '0')}`);
      if (g === 5) { console.log('--- reached dungeon (gs=5) ---'); break; }
    }
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
