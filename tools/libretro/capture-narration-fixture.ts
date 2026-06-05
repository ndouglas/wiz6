/**
 * capture-narration-fixture.ts — capture the START-NEW-GAME entry narration
 * frame (modal over the live dungeon view) as a parity fixture:
 *   tools/parity/fixtures/engine/maze-entry-narration.idx.gz + .png
 * Drives a fresh boot to the dungeon-entry frame where msg 10010-10012 display.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import { COMPOSED_PALETTE, SCREEN_WIDTH, SCREEN_HEIGHT } from '../parity/decode-screen.js';
import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FIXTURES = resolve(process.cwd(), 'tools/parity/fixtures/engine');
const rgbToIdx = new Map<number, number>();
COMPOSED_PALETTE.forEach(([r,g,b],i)=>rgbToIdx.set((r<<16)|(g<<8)|b,i));
function rgbaToIndices(rgba: Uint8Array): Uint8Array {
  const idx = new Uint8Array(SCREEN_WIDTH*SCREEN_HEIGHT);
  let miss=0, firstMiss=-1;
  for (let p=0;p<idx.length;p++){
    const i = rgbToIdx.get((rgba[p*4]!<<16)|(rgba[p*4+1]!<<8)|rgba[p*4+2]!);
    if (i===undefined){ miss++; if(firstMiss<0) firstMiss=p; idx[p]=0; } else idx[p]=i;
  }
  if (miss) console.warn(`WARN ${miss} non-palette pixels (first @${firstMiss}, x=${firstMiss%320} y=${Math.floor(firstMiss/320)}) — set to 0`);
  return idx;
}

async function main() {
  const c = new HostClient();
  try {
    await c.step(3000);
    await c.key('enter','tap'); await c.step(800);
    for (let i=0;i<3;i++){ await c.key('enter','tap'); await c.step(60); await c.key('enter','tap'); await c.step(60); await c.key('up','tap'); await c.key('up','tap'); await c.key('up','tap'); await c.step(60); }
    await c.key('down','tap'); await c.key('down','tap'); await c.key('down','tap'); await c.step(60);
    await c.key('enter','tap'); await c.step(300);  // START NEW GAME
    await c.key('enter','tap'); await c.step(300);  // scenario
    await c.key('enter','tap'); await c.step(600);  // → dungeon + narration modal

    // Park the mouse cursor off the visible content (top-left clamp) so the
    // composited cursor sprite doesn't pollute the fixture (it otherwise lands
    // at a random spot run-to-run — the 32-px bottom-right artifact).
    await c.mouse(-4000, -4000); await c.step(2);
    await c.mouse(-4000, -4000); await c.step(2);
    await c.mouse(-4000, -4000); await c.step(8);

    await c.fb('/tmp/wiz6-narr-fixture.rgba');
    const rgba = readFileSync('/tmp/wiz6-narr-fixture.rgba');
    const idx = rgbaToIndices(rgba);
    writeFileSync(resolve(FIXTURES,'maze-entry-narration.idx.gz'), gzipSync(idx));
    // PNG from the idx via the composed palette
    const out = new Uint8Array(SCREEN_WIDTH*SCREEN_HEIGHT*4);
    for (let p=0;p<idx.length;p++){ const [r,g,b]=COMPOSED_PALETTE[idx[p]!]!; out[p*4]=r; out[p*4+1]=g; out[p*4+2]=b; out[p*4+3]=255; }
    writeFileSync(resolve(FIXTURES,'maze-entry-narration.png'), encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, out));
    console.log('wrote maze-entry-narration.idx.gz + .png');

    // Also serialize the state for repeatability.
    await c.serialize(resolve(process.cwd(),'tools/libretro/states/maze-entry-narration.state'));
    console.log('serialized states/maze-entry-narration.state');
  } finally { c.close(); }
}
main().catch((e)=>{console.error(e);process.exit(1);});
