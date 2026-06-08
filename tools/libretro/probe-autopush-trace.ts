/**
 * probe-autopush-trace.ts — find the scripted-entry auto-push driver by
 * write-watching party_gy (0x4fa2). Logs every gy write with its cs:ip, through
 * the spawn → auto-step 117→118 → (ENTER at APPROACHING) → subsequent steps.
 * The writer cs:ip identifies the wmaze routine that advances the scripted walk;
 * the timing (auto vs after-ENTER) reveals what triggers each push.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const GS = 0x363a, GYO = 0x4fa2;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function gy(c: HostClient) { return u16(await c.read((await c.anchor()) + GYO, 2), 0); }
async function gs(c: HostClient) { return u16(await c.read((await c.anchor()) + GS, 2), 0); }

async function main() {
  const c = new HostClient();
  try {
    await c.step(3000);
    await c.key('enter', 'tap'); await c.step(800);
    for (let i = 0; i < 6; i++) { await c.key('enter', 'tap'); await c.step(150); await c.key('enter', 'tap'); await c.step(150); for (let k = 0; k < 4; k++) await c.key('up', 'tap'); await c.step(80); }
    await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(120);
    await c.key('enter', 'tap'); await c.step(400);   // START NEW GAME → magicword
    await c.key('enter', 'tap'); await c.step(150);
    await c.key('enter', 'tap'); await c.step(150);
    await c.key('enter', 'tap');                       // magicword 3 → dungeon

    const base = await c.anchor();
    await c.wwatchSet(base + 0x4f9a, base + 0x4fa6);    // watch the WHOLE party struct (facing..gx)
    console.log('wwatch armed on party struct 0x4f9a..0x4fa6');

    const drain = async (tag: string) => {
      const log = await c.wwatchDrain();
      for (const w of log) console.log(`  [${tag}] addr=${w.addr.toString(16)} :=${w.val & 0xffff}  cs:ip=${w.cseip.toString(16)}`);
    };

    // Phase 1: spawn + auto-step (no input).
    for (let f = 0; f < 400; f++) { if (await gs(c) === 5) break; await c.step(2); }
    console.log(`dungeon loaded, gy=${await gy(c)}`); await drain('load');
    for (let f = 0; f < 200; f++) { await c.step(1); await drain(`auto f${f}`); }
    console.log(`after auto window: gy=${await gy(c)}`);

    // Phase 2: press ENTER once (APPROACHING dismiss), watch for auto-push.
    console.log('-- single ENTER --');
    await c.key('enter', 'tap');
    for (let f = 0; f < 300; f++) { await c.step(1); await drain(`postenter f${f}`); }
    console.log(`after 1 ENTER + wait: gy=${await gy(c)}`);

    // Phase 3: a few more ENTERs (in case each gate needs one), watching.
    for (let e = 1; e <= 6; e++) { await c.key('enter', 'tap'); for (let f = 0; f < 80; f++) { await c.step(1); await drain(`e${e} f${f}`); } console.log(`  after ENTER#${e}: gy=${await gy(c)}`); }
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
