/**
 * probe-masteropts.ts — carefully establish MASTER OPTIONS navigation.
 * Form a full 6-member party from the pinned roster, verify the menu layout,
 * then reach START NEW GAME + scenario pick. Screenshots each milestone.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const GAME_STATE = 0x363a, FACING = 0x4f9a;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function gs(c: HostClient) { return u16(await c.read((await c.anchor()) + GAME_STATE, 2), 0); }
async function fld(c: HostClient) {
  const base = await c.anchor();
  const g = u16(await c.read(base + GAME_STATE, 2), 0);
  const pos = await c.read(base + FACING, 12);
  return { gs: g, facing: u16(pos, 0), gy: u16(pos, 8), gx: u16(pos, 10) };
}
async function png(c: HostClient, tag: string) {
  await c.fb(`/tmp/wiz6-mo-${tag}.rgba`);
  writeFileSync(`/tmp/wiz6-mo-${tag}.png`, encodePngRgba(320, 200, readFileSync(`/tmp/wiz6-mo-${tag}.rgba`)));
  console.log(`  png ${tag}: ${JSON.stringify(await fld(c))}`);
}

async function main() {
  const c = new HostClient();
  try {
    await c.step(3000);
    await c.key('enter', 'tap'); await c.step(800);   // title → MASTER OPTIONS
    console.log('MASTER OPTIONS gs=', await gs(c));
    await png(c, '00-empty');

    // Form 6 members. From empty-party MASTER OPTIONS cursor is on ADD PARTY MEMBER.
    // enter → picker (cursor on first roster char) → enter picks it → returns to
    // MASTER OPTIONS with cursor possibly moved. Re-anchor to top with up x4.
    for (let i = 0; i < 6; i++) {
      await c.key('enter', 'tap'); await c.step(150);  // ADD PARTY MEMBER → picker
      await c.key('enter', 'tap'); await c.step(150);  // pick first available char
      await c.key('up', 'tap'); await c.key('up', 'tap'); await c.key('up', 'tap'); await c.key('up', 'tap'); await c.step(80);
      await png(c, `member-${i + 1}`);
    }
    console.log('after 6 adds gs=', await gs(c));
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
