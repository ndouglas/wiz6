/**
 * maze-emit-wwatch.ts — Prong B: boot fresh under the PATCHED core, navigate to a
 * frame, and write-watch the maze emission state machine during a forced redraw.
 *
 * The committed *.state files were saved by a different core build and cannot be
 * unserialized by the patched core, so we boot fresh (driveToMaze) and serialize
 * a patched-core clean state to /tmp for reuse. Then per frame we navigate from
 * the clean state, arm a write-watch over the gate+span+slot DGROUP region, force
 * a redraw, and dump every write (cseip, addr, val) IN ORDER.
 *
 * cseip is a linear CS:IP; file_offset = cseip - (OVL_phys_base). We print both.
 *
 * Usage: pnpm tsx tools/libretro/maze-emit-wwatch.ts <reach|frame>
 *   reach              boot + serialize /tmp/wiz6-maze-patched.state (+ OVL base)
 *   corridor|turn-left|lookback|asym   watch that frame (needs reach first)
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const CLEAN = '/tmp/wiz6-maze-patched.state';
const OVLF = '/tmp/wiz6-maze-patched-ovl.txt';
const RENDER_SIG = '558bec83c4f056a1a44f8946fea1a24f';
const SIG_OFFSET = 0x4ad7;
const DGROUP_GAME_STATE = 0x363a;

const u16 = (b: Uint8Array, o = 0): number => b[o]! | (b[o + 1]! << 8);
const O = { facing: 0x4f9a, gy: 0x4fa2, gx: 0x4fa4, maze_ptr: 0x4faa, span_count: 0x50ce, span_list: 0x50d0 };

// each frame: keys from the clean (facing0) corridor state.
const NAV: Record<string, string[]> = {
  corridor: [],
  'turn-left': ['left'],
  lookback: ['right', 'right'],
  asym: ['right'],
};

function label(rel: number): string {
  const named: Array<[number, number, string]> = [
    [0x504e, 0x18, 'quad504e'],
    [0x5072, 4, 'leftA5072'],
    [0x507a, 4, 'leftB507a'],
    [0x5082, 4, 'leftC5082'],
    [0x508a, 4, 'front508a'],
    [0x5092, 4, 'rightA5092'],
    [0x509a, 4, 'rightB509a'],
    [0x50a2, 4, 'rightC50a2'],
    [0x50aa, 0xc, 'quad50aa'],
    [0x50b6, 0x18, 'g50b6'],
    [0x50ce, 2, 'spanCount'],
    [0x50d0, 0x400, 'spanList'],
    [0x5040, 2, 'depthCounter'],
    [0x521a, 2, 'frameParity'],
    [0x521c, 2, 'spanParity'],
    [0x521e, 2, 'depthBound'],
    [0x5220, 2, 'slotFront'],
    [0x5222, 2, 'slotCornerL'],
    [0x5224, 2, 'slotCornerR'],
    [0x5226, 2, 'slotLeftSide'],
    [0x5228, 2, 'slotRightSide'],
  ];
  for (const [b, len, name] of named) if (rel >= b && rel < b + len) return `${name}+${rel - b}`;
  return `?0x${rel.toString(16)}`;
}

async function driveToMaze(c: HostClient): Promise<void> {
  await c.step(3000);
  await c.key('enter', 'tap'); await c.step(800);
  for (let i = 0; i < 3; i++) {
    await c.key('enter', 'tap'); await c.step(60);
    await c.key('enter', 'tap'); await c.step(60);
    await c.key('up', 'tap'); await c.key('up', 'tap'); await c.key('up', 'tap'); await c.step(60);
  }
  await c.key('down', 'tap'); await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(60);
  await c.key('enter', 'tap'); await c.step(200);
  await c.key('enter', 'tap'); await c.step(200);
  await c.key('enter', 'tap'); await c.step(400);
  for (let i = 0; i < 6; i++) { await c.key('enter', 'down'); await c.step(20); await c.key('enter', 'up'); await c.step(60); }
}

async function reach(c: HostClient): Promise<void> {
  await driveToMaze(c);
  const base = await c.anchor();
  const gs = u16(await c.read(base + DGROUP_GAME_STATE, 2));
  const sigPhys = await c.find(RENDER_SIG);
  if (sigPhys < 0) throw new Error('render sig not found — not in maze');
  const ovl = sigPhys - SIG_OFFSET;
  writeFileSync(OVLF, ovl.toString(16));
  await c.serialize(CLEAN);
  const facing = u16(await c.read(base + O.facing, 2));
  const gx = u16(await c.read(base + O.gx, 2));
  const gy = u16(await c.read(base + O.gy, 2));
  console.log(`reached maze: gs=${gs} facing${facing} g(${gx},${gy}) OVL=0x${ovl.toString(16)} base=0x${base.toString(16)}`);
  console.log(`serialized -> ${CLEAN}`);
}

async function watch(c: HostClient, which: string): Promise<void> {
  if (!existsSync(CLEAN)) throw new Error('run reach first');
  const ovl = parseInt(readFileSync(OVLF, 'utf8').trim(), 16);
  await c.unserialize(CLEAN);
  await c.step(2);
  for (const k of NAV[which]!) { await c.key(k, 'tap'); await c.step(40); }
  const base = await c.anchor();
  const facing = u16(await c.read(base + O.facing, 2));
  const gx = u16(await c.read(base + O.gx, 2));
  const gy = u16(await c.read(base + O.gy, 2));
  console.log(`# ${which} facing${facing} g(${gx},${gy}) base=0x${base.toString(16)} OVL=0x${ovl.toString(16)}`);

  await c.wwatchSet(base + 0x504e, base + 0x522c);
  // force ONE redraw: forward step held ENTER (no move if blocked) then settle.
  await c.key('enter', 'down'); await c.step(20); await c.key('enter', 'up'); await c.step(40);
  const log = await c.wwatchDrain();
  await c.wwatchSet(0, 0);

  console.log(`# ${log.length} writes`);
  for (const w of log) {
    const rel = w.addr - base;
    const fileOff = (w.cseip - ovl) & 0xffff;
    console.log(`  ${label(rel).padEnd(15)}=${w.val.toString(16).padStart(2, '0')}  cseip=${w.cseip.toString(16)} fileOff=0x${fileOff.toString(16)}`);
  }
  const cnt = u16(await c.read(base + O.span_count, 2));
  const sb = await c.read(base + O.span_list, cnt * 0xb + 4);
  console.log(`\n# final span_count=${cnt}`);
  for (let i = 0; i < cnt; i++) {
    const o = i * 0xb;
    console.log(`  span${i}: x0=${u16(sb, o)} x1=${u16(sb, o + 2)} wt=${sb[o + 8]} seam=${sb[o + 9]} df=${sb[o + 10]}`);
  }
}

async function main() {
  const arg = process.argv[2] ?? 'reach';
  const c = new HostClient();
  try {
    if (arg === 'reach') await reach(c);
    else await watch(c, arg);
  } finally {
    c.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
