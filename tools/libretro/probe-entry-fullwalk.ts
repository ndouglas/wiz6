/**
 * probe-entry-fullwalk.ts — trace the ENTIRE scripted walk one ENTER at a time,
 * with screenshots, then keep pressing to find where ENTER stops moving and
 * free arrow control begins. No early-stop guard.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
const GAME_STATE = 0x363a, FACING = 0x4f9a;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function fields(c: HostClient) {
  const base = await c.anchor();
  const pos = await c.read(base + FACING, 12);
  return { facing: u16(pos,0), cellA: u16(pos,4), cellB: u16(pos,6), gy: u16(pos,8), gx: u16(pos,10) };
}
const fmt = (f:any)=>`facing=${f.facing} cellA=${f.cellA} cellB=${f.cellB} gy=${f.gy} gx=${f.gx}`;

async function main() {
  const c = new HostClient();
  try {
    await c.step(3000);
    await c.key('enter','tap'); await c.step(800);
    for (let i=0;i<3;i++){ await c.key('enter','tap'); await c.step(60); await c.key('enter','tap'); await c.step(60); await c.key('up','tap'); await c.key('up','tap'); await c.key('up','tap'); await c.step(60); }
    await c.key('down','tap'); await c.key('down','tap'); await c.key('down','tap'); await c.step(60);
    await c.key('enter','tap'); await c.step(300);
    await c.key('enter','tap'); await c.step(300);
    await c.key('enter','tap'); await c.step(600);
    console.log('NARRATION:', fmt(await fields(c)));
    await c.fb('/tmp/wiz6-fw-narration.fb');

    // Press ENTER one at a time, screenshot, log delta. 12 presses.
    let prev = await fields(c);
    for (let i=1;i<=12;i++){
      await c.key('enter','tap'); await c.step(300);
      const a = await fields(c);
      const ch = JSON.stringify(prev)!==JSON.stringify(a);
      console.log(`ENTER#${String(i).padStart(2)}: ${ch?'CHANGED':'same   '} -> ${fmt(a)}`);
      await c.fb(`/tmp/wiz6-fw-e${i}.fb`);
      prev = a;
    }
    // Now try arrows.
    console.log('\n=== Arrows after the walk ===');
    const t=async(k:string)=>{const b=await fields(c);await c.key(k,'tap');await c.step(120);const a=await fields(c);console.log(`${k}: ${JSON.stringify(b)!==JSON.stringify(a)?'CHANGED':'no-op'} -> ${fmt(a)}`);};
    await t('left'); await t('right'); await t('up');
  } finally { c.close(); }
}
main().catch((e)=>{console.error(e);process.exit(1);});
