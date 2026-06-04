/**
 * trace-maze.ts — delta-trace the live wmaze 3D wall renderer.
 *
 * The prior static-disasm render-path RE (wmaze-3d-view / blit-geometry /
 * texture-rasterizer) was shown by the instruction tracer to log ZERO live hits
 * on a confirmed redraw (docs/re/findings/wmaze-uv-texture.json). This harness
 * finds the REAL render path by DELTA-tracing: for each offset in the wmaze code
 * region, count trace hits while IDLE vs while a redraw is forced — offsets whose
 * hit-count INCREASES on a redraw (esp. idle==0, redraw>0) are the render code;
 * the per-frame idle/animation loop cancels out.
 *
 * Requires the PATCHED trace-capable core (tools/libretro/build-core.sh). A fresh
 * HostClient picks it up immediately (unlike the long-lived MCP child).
 *
 * Phases (argv[2]):
 *   reach      drive to the zone0 corridor frame, find OVL base, serialize +
 *              screenshot the clean frame (to CLEAN_STATE / CLEAN_PNG).
 *   calibrate  from the clean frame, confirm forward-ENTER redraws the 3D
 *              viewport (framebuffer diff in x72..247 / y32..143).
 *   coarse     delta-trace a grid of offsets (idle vs redraw) → hot offsets.
 *   fine a,b,c capture register context (DS/stack) at the given hex offsets.
 *
 * Usage: pnpm tsx tools/libretro/trace-maze.ts <phase> [args]
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const DGROUP_GAME_STATE = 0x363a;
// The wmaze render-frame signature (prior pass): exactly one copy in RAM, at
// OVL+0x4ad7. OVL (overlay load phys base) = found - 0x4ad7 (expected ~0x4784).
const RENDER_SIG = '558bec83c4f056a1a44f8946fea1a24f';
const SIG_OFFSET = 0x4ad7;

const CLEAN_STATE = '/tmp/wiz6-maze-clean.state';
const CLEAN_PNG = '/tmp/wiz6-maze-clean.fb'; // raw RGBA (320x200x4)
const OVL_FILE = '/tmp/wiz6-maze-ovl.txt';

// 3D viewport rect (from the reference frame): x72..247 (w176), y32..143 (h112).
const VP = { x0: 72, x1: 248, y0: 32, y1: 144 };
const W = 320;

async function gameState(c: HostClient): Promise<number> {
  const base = await c.anchor();
  const b = await c.read(base + DGROUP_GAME_STATE, 2);
  return b[0]! | (b[1]! << 8);
}

/** Drive a fresh boot to the zone0 corridor frame (game_state 5). */
async function driveToMaze(c: HostClient): Promise<void> {
  await c.step(3000); // cold boot
  await c.key('enter', 'tap'); await c.step(800); // title -> MASTER OPTIONS
  // Build a 3-member party: ADD PARTY MEMBER ×3 (pick first PCFILE char each).
  for (let i = 0; i < 3; i++) {
    await c.key('enter', 'tap'); await c.step(60); // ADD PARTY MEMBER
    await c.key('enter', 'tap'); await c.step(60); // pick first PCFILE char
    await c.key('up', 'tap'); await c.key('up', 'tap'); await c.key('up', 'tap');
    await c.step(60); // re-anchor cursor on ADD PARTY MEMBER
  }
  // ADD PARTY MEMBER -> START NEW GAME (3 down), then commit into the dungeon.
  await c.key('down', 'tap'); await c.key('down', 'tap'); await c.key('down', 'tap');
  await c.step(60);
  await c.key('enter', 'tap'); await c.step(200); // START NEW GAME
  await c.key('enter', 'tap'); await c.step(200); // scenario pick
  await c.key('enter', 'tap'); await c.step(400); // -> dungeon (game_state 5)
  // Dismiss the "approaching the gate" narration AND walk forward to y3.
  for (let i = 0; i < 6; i++) {
    await c.key('enter', 'down'); await c.step(20);
    await c.key('enter', 'up'); await c.step(60);
  }
}

/** Force ONE 3D redraw via a forward step (held ENTER), settle. */
async function forceRedraw(c: HostClient): Promise<void> {
  await c.key('enter', 'down'); await c.step(20);
  await c.key('enter', 'up'); await c.step(60);
}

/** Count differing pixels inside the 3D viewport between two raw-RGBA frames. */
function viewportDiff(a: Uint8Array, b: Uint8Array): number {
  let n = 0;
  for (let y = VP.y0; y < VP.y1; y++) {
    for (let x = VP.x0; x < VP.x1; x++) {
      const p = (y * W + x) * 4;
      if (a[p] !== b[p] || a[p + 1] !== b[p + 1] || a[p + 2] !== b[p + 2]) n++;
    }
  }
  return n;
}

async function findOvl(c: HostClient): Promise<number> {
  const sigPhys = await c.find(RENDER_SIG);
  if (sigPhys < 0) throw new Error('render signature not found — not in the maze view?');
  return sigPhys - SIG_OFFSET;
}

async function phaseReach(c: HostClient): Promise<void> {
  console.log('driving to maze…');
  await driveToMaze(c);
  const gs = await gameState(c);
  console.log(`game_state = ${gs} (expect 5)`);
  const ovl = await findOvl(c);
  console.log(`OVL base = 0x${ovl.toString(16)} (expect ~0x4784)`);
  writeFileSync(OVL_FILE, ovl.toString(16));
  await c.serialize(CLEAN_STATE);
  await c.fb(CLEAN_PNG);
  console.log(`serialized clean frame -> ${CLEAN_STATE}`);
  console.log(`raw RGBA framebuffer -> ${CLEAN_PNG}`);
  // also a PNG for eyeballing
  await c.fb('/tmp/wiz6-maze-clean.rgba');
}

async function phaseCalibrate(c: HostClient): Promise<void> {
  if (!existsSync(CLEAN_STATE)) throw new Error('run `reach` first');
  await c.unserialize(CLEAN_STATE);
  await c.step(2);
  await c.fb('/tmp/wiz6-cal-before.fb');
  const before = readFileSync('/tmp/wiz6-cal-before.fb');
  const gsBefore = await gameState(c);
  await forceRedraw(c);
  await c.fb('/tmp/wiz6-cal-after.fb');
  const after = readFileSync('/tmp/wiz6-cal-after.fb');
  const gsAfter = await gameState(c);
  const diff = viewportDiff(new Uint8Array(before), new Uint8Array(after));
  console.log(`game_state ${gsBefore} -> ${gsAfter}`);
  console.log(`viewport pixel diff (forward ENTER) = ${diff} / ${(VP.x1 - VP.x0) * (VP.y1 - VP.y0)}`);
  console.log(diff > 50 ? 'REDRAW CONFIRMED ✓' : 'NO meaningful redraw — try another trigger');
}

function ovlBase(): number {
  if (!existsSync(OVL_FILE)) throw new Error('run `reach` first (OVL base unknown)');
  return parseInt(readFileSync(OVL_FILE, 'utf8').trim(), 16);
}

/** Count trace hits at a linear address over an action. Returns record count
 *  (capped at the 4096-entry ring). */
async function countHits(c: HostClient, lin: number, action: () => Promise<void>): Promise<number> {
  await c.traceSet(lin);
  await c.traceDrain(); // clear anything pending
  await action();
  const recs = await c.traceDrain();
  await c.traceOff();
  return recs.length;
}

async function phaseCoarse(c: HostClient): Promise<void> {
  const ovl = ovlBase();
  const start = parseInt(process.argv[3] ?? '3000', 16);
  const end = parseInt(process.argv[4] ?? '5400', 16);
  const stride = parseInt(process.argv[5] ?? '20', 16);
  console.log(`coarse delta-trace OVL=0x${ovl.toString(16)} file 0x${start.toString(16)}..0x${end.toString(16)} stride 0x${stride.toString(16)}`);
  const hits: Array<{ off: number; idle: number; redraw: number }> = [];
  for (let off = start; off < end; off += stride) {
    const lin = ovl + off;
    await c.unserialize(CLEAN_STATE);
    await c.step(2);
    // idle: steady-state, no input
    const idle = await countHits(c, lin, async () => { await c.step(80); });
    // redraw: fresh restore, then force a forward redraw
    await c.unserialize(CLEAN_STATE);
    await c.step(2);
    const redraw = await countHits(c, lin, async () => { await forceRedraw(c); });
    if (redraw > idle) {
      hits.push({ off, idle, redraw });
      console.log(`  HOT 0x${off.toString(16)}: idle=${idle} redraw=${redraw} delta=${redraw - idle}`);
    }
  }
  console.log(`\n${hits.length} hot offsets (redraw>idle):`);
  for (const h of hits) console.log(`  0x${h.off.toString(16)}\tidle=${h.idle}\tredraw=${h.redraw}\tΔ=${h.redraw - h.idle}`);
  writeFileSync('/tmp/wiz6-maze-coarse.json', JSON.stringify(hits, null, 2));
}

// All 68 named wmaze.ovr function entries (docs/re/wmaze-functions.md). Tracing
// at function entries guarantees we hit a real instruction boundary (a fixed
// stride would mostly land mid-instruction and falsely log 0 hits).
const FUNCS = [
  0x42, 0xf1, 0x117, 0x184, 0x1d1, 0x3d3, 0x563, 0x644, 0x925, 0x983,
  0xdd7, 0xe54, 0xe81, 0xea0, 0xf2a, 0xfd0, 0x1053, 0x108b, 0x10ed, 0x1118,
  0x1145, 0x1190, 0x1539, 0x1574, 0x1b0b, 0x2086, 0x20cd, 0x20eb, 0x2794, 0x2abc,
  0x3073, 0x309d, 0x3244, 0x3286, 0x32f5, 0x3304, 0x357a, 0x35b7, 0x36dd, 0x3742,
  0x37a7, 0x3828, 0x3c11, 0x3dce, 0x406c, 0x4ad7, 0x5367, 0x554a, 0x577a, 0x57a8,
  0x58ed, 0x5a28, 0x5c58, 0x5cc8, 0x5e22, 0x5ebd, 0x5f91, 0x612a, 0x6144, 0x64ec,
  0x6608, 0x66bc, 0x894e, 0x8974, 0x8e4f, 0x9345, 0x9532, 0x96aa,
];

async function phaseFuncs(c: HostClient): Promise<void> {
  const ovl = ovlBase();
  console.log(`func-entry delta-trace OVL=0x${ovl.toString(16)}, ${FUNCS.length} functions`);
  const hits: Array<{ off: number; idle: number; redraw: number }> = [];
  for (const off of FUNCS) {
    const lin = ovl + off;
    await c.unserialize(CLEAN_STATE); await c.step(2);
    const idle = await countHits(c, lin, async () => { await c.step(80); });
    await c.unserialize(CLEAN_STATE); await c.step(2);
    const redraw = await countHits(c, lin, async () => { await forceRedraw(c); });
    const mark = redraw > idle ? (idle === 0 ? ' ***REDRAW-ONLY***' : ' (more on redraw)') : '';
    console.log(`  0x${off.toString(16).padStart(4, '0')}: idle=${idle}\tredraw=${redraw}${mark}`);
    if (redraw > idle) hits.push({ off, idle, redraw });
  }
  console.log(`\n${hits.length} render-path candidates (redraw>idle):`);
  for (const h of hits) console.log(`  0x${h.off.toString(16)}\tidle=${h.idle}\tredraw=${h.redraw}\tΔ=${h.redraw - h.idle}`);
  writeFileSync('/tmp/wiz6-maze-funcs.json', JSON.stringify(hits, null, 2));
}

async function phaseCtargets(c: HostClient): Promise<void> {
  const ovl = ovlBase();
  const targets: number[] = JSON.parse(readFileSync('/tmp/wmaze-calltargets.json', 'utf8'));
  console.log(`call-target delta-trace OVL=0x${ovl.toString(16)}, ${targets.length} targets`);
  const hits: Array<{ off: number; idle: number; redraw: number }> = [];
  for (const off of targets) {
    const lin = ovl + off;
    await c.unserialize(CLEAN_STATE); await c.step(2);
    const idle = await countHits(c, lin, async () => { await c.step(80); });
    await c.unserialize(CLEAN_STATE); await c.step(2);
    const redraw = await countHits(c, lin, async () => { await forceRedraw(c); });
    if (redraw > idle) {
      const mark = idle === 0 ? ' ***REDRAW-ONLY***' : ' (more on redraw)';
      console.log(`  0x${off.toString(16).padStart(4, '0')}: idle=${idle}\tredraw=${redraw}${mark}`);
      hits.push({ off, idle, redraw });
    }
  }
  console.log(`\n${hits.length} render-path candidates (redraw>idle):`);
  for (const h of hits) console.log(`  0x${h.off.toString(16)}\tidle=${h.idle}\tredraw=${h.redraw}\tΔ=${h.redraw - h.idle}`);
  writeFileSync('/tmp/wiz6-maze-ctargets.json', JSON.stringify(hits, null, 2));
}

/** Test whether 'e' (examine) redraws the viewport in-place + repeatably. */
async function phaseTestE(c: HostClient): Promise<void> {
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.fb('/tmp/wiz6-e-0.fb');
  const f0 = new Uint8Array(readFileSync('/tmp/wiz6-e-0.fb'));
  await c.key('e', 'tap'); await c.step(40);
  await c.fb('/tmp/wiz6-e-1.fb');
  const f1 = new Uint8Array(readFileSync('/tmp/wiz6-e-1.fb'));
  await c.key('e', 'tap'); await c.step(40);
  await c.fb('/tmp/wiz6-e-2.fb');
  const f2 = new Uint8Array(readFileSync('/tmp/wiz6-e-2.fb'));
  console.log(`'e' redraw: diff(0,1)=${viewportDiff(f0, f1)}  diff(1,2)=${viewportDiff(f1, f2)}  (repeatable redraw if both >0 and frame returns)`);
}

/** Positive control: confirm the tracer catches known-firing addresses in THIS
 *  session before trusting any 0-hit negative result. */
async function phaseValidate(c: HostClient): Promise<void> {
  const ovl = ovlBase();
  await c.unserialize(CLEAN_STATE); await c.step(2);
  // 0x4e0b = wmaze idle-anim (ovl-relative; prior pass: ~17/frame).
  const animLin = ovl + 0x4e0b;
  const anim = await countHits(c, animLin, async () => { await c.step(40); });
  // 0x31ac = wroot resident idle anchor (ABSOLUTE linear; prior pass: ~464/frame).
  await c.unserialize(CLEAN_STATE); await c.step(2);
  const idleAnchor = await countHits(c, 0x31ac, async () => { await c.step(40); });
  console.log(`POSITIVE CONTROL over 40 idle frames:`);
  console.log(`  wmaze 0x4e0b (lin 0x${animLin.toString(16)}): ${anim} hits  (expect ~17/frame → high)`);
  console.log(`  wroot 0x31ac (absolute idle anchor): ${idleAnchor} hits  (expect ~464/frame → very high, capped at ring 4096)`);
  console.log(anim > 0 && idleAnchor > 0 ? 'TRACER HEALTHY ✓ — zero-hit render fns are a REAL negative' : 'TRACER/OVL BROKEN — zeros are artifacts, debug setup');
}

/** Localize the render by sampling live CS:IP/DS per frame during a redraw and
 *  comparing to idle. No function-boundary or dispatch-mode assumptions. */
async function phaseWhere(c: HostClient): Promise<void> {
  const ovl = ovlBase();
  const sample = async (label: string, action: (i: number) => Promise<void>, frames: number) => {
    const seen = new Map<string, number>(); // "cs:ip" -> count
    const dsSeen = new Map<number, number>();
    for (let i = 0; i < frames; i++) {
      await action(i);
      const r = await c.regs();
      const key = `${r.cs.toString(16)}:${r.eip.toString(16)}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
      dsSeen.set(r.ds, (dsSeen.get(r.ds) ?? 0) + 1);
    }
    return { seen, dsSeen };
  };

  // IDLE baseline: 200 frames doing nothing.
  await c.unserialize(CLEAN_STATE); await c.step(2);
  const idle = await sample('idle', async () => { await c.step(1); }, 200);

  // REDRAW: re-run the forward move several times, sampling every frame.
  const redrawSeen = new Map<string, number>();
  const redrawDs = new Map<number, number>();
  for (let rep = 0; rep < 8; rep++) {
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.key('enter', 'down');
    for (let i = 0; i < 90; i++) {
      await c.step(1);
      const r = await c.regs();
      const key = `${r.cs.toString(16)}:${r.eip.toString(16)}`;
      redrawSeen.set(key, (redrawSeen.get(key) ?? 0) + 1);
      redrawDs.set(r.ds, (redrawDs.get(r.ds) ?? 0) + 1);
      if (i === 25) await c.key('enter', 'up');
    }
  }

  const dsStr = (m: Map<number, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.toString(16)}:${v}`).join(' ');
  console.log(`IDLE DS distribution: ${dsStr(idle.dsSeen)}`);
  console.log(`REDRAW DS distribution: ${dsStr(redrawDs)}`);

  console.log(`\nCS:IP seen during REDRAW but NOT idle (the render-only program counters):`);
  const onlyRedraw = [...redrawSeen.entries()].filter(([k]) => !idle.seen.has(k)).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of onlyRedraw.slice(0, 40)) {
    const [csS, ipS] = k.split(':');
    const cs = parseInt(csS!, 16), ip = parseInt(ipS!, 16);
    const lin = (cs << 4) + ip;
    const inOvl = lin >= ovl && lin < ovl + 0x973d;
    const tag = inOvl ? `wmaze+0x${(lin - ovl).toString(16)}` : (cs === 0x1a8 && ip < 0x2d04 ? `wrootResident+0x${ip.toString(16)}` : `lin 0x${lin.toString(16)}`);
    console.log(`  ${k}  (lin 0x${lin.toString(16)}, ${tag})  ×${v}`);
  }
  console.log(`\n${onlyRedraw.length} distinct redraw-only CS:IP buckets`);
}

/** Dump live RAM at an absolute linear address to a file (for binary ident). */
async function phaseDump(c: HostClient): Promise<void> {
  await c.unserialize(CLEAN_STATE); await c.step(2);
  const lin = parseInt(process.argv[3] ?? '6b910', 16);
  const len = parseInt(process.argv[4] ?? '2400', 16);
  const out = process.argv[5] ?? '/tmp/wiz6-seg.bin';
  const bytes = await c.read(lin, len);
  writeFileSync(out, Buffer.from(bytes));
  console.log(`dumped ${len} bytes at lin 0x${lin.toString(16)} -> ${out}`);
}

function tagLin(lin: number, ovl: number): string {
  const EGA_BASE = 0x6a1b0, EGA_END = 0x6a1b0 + 0x2262;
  if (lin >= ovl && lin < ovl + 0x973d) return `wmaze+0x${(lin - ovl).toString(16)}`;
  if (lin >= EGA_BASE && lin < EGA_END) return `ega.drv@0x${(lin - EGA_BASE).toString(16)}`;
  if (lin >= 0x1a80 && lin < 0x4784) return `wrootResident+0x${(lin - 0x1a80).toString(16)}`;
  return `lin 0x${lin.toString(16)}`;
}

/** Absolute-linear fine trace: ring-capture all hits over one redraw, print
 *  full register + stack context (callers + blit args). */
async function phaseAfine(c: HostClient): Promise<void> {
  const ovl = ovlBase();
  const addrs = process.argv.slice(3).map((s) => parseInt(s, 16));
  for (const lin of addrs) {
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(lin); await c.traceDrain();
    await forceRedraw(c);
    const recs = await c.traceDrain();
    await c.traceOff();
    console.log(`\n=== lin 0x${lin.toString(16)} (${tagLin(lin, ovl)}): ${recs.length} hits over one redraw ===`);
    for (const r of recs.slice(0, 16)) {
      const raw = r.stack.map((w) => w.toString(16)).join(' ');
      // far return = (ip, cs) pair on stack → linear cs<<4 + ip
      const farPairs: string[] = [];
      for (let i = 0; i + 1 < r.stack.length; i++) {
        const ipw = r.stack[i]!, csw = r.stack[i + 1]!;
        if (csw === 0x1a8 || csw === 0x6b91 || csw === 0x6a1b) farPairs.push(`${tagLin((csw << 4) + ipw, ovl)}`);
      }
      console.log(`  ds=${r.ds.toString(16)} es=${r.es.toString(16)} ss=${r.ss.toString(16)} ax=${r.eax.toString(16)} bx=${r.ebx.toString(16)} cx=${r.ecx.toString(16)} dx=${r.edx.toString(16)} si=${r.esi.toString(16)} di=${r.edi.toString(16)} bp=${r.ebp.toString(16)} sp=${r.esp.toString(16)}`);
      console.log(`     stack: ${raw}`);
      if (farPairs.length) console.log(`     far-rets: ${farPairs.join('  <-  ')}`);
    }
  }
}

/** Dump a region mid-redraw (while runtime/generated code is live) at several
 *  step offsets into the forward move. */
async function phaseDumpAt(c: HostClient): Promise<void> {
  const lin = parseInt(process.argv[3] ?? '6c400', 16);
  const len = parseInt(process.argv[4] ?? '2000', 16);
  for (const n of [2, 4, 6, 8, 10, 14]) {
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.key('enter', 'down');
    await c.step(n);
    const bytes = await c.read(lin, len);
    await c.key('enter', 'up');
    const out = `/tmp/wiz6-redraw-step${n}.bin`;
    writeFileSync(out, Buffer.from(bytes));
    // quick code-ness heuristic: count distinct bytes in first 0x200
    const head = bytes.slice(0, 0x200);
    const distinct = new Set(head).size;
    console.log(`step ${n}: dumped 0x${len.toString(16)} @ lin 0x${lin.toString(16)} -> ${out}  (distinct bytes in head: ${distinct})`);
  }
}

// ega.drv dispatch-table header (e9 jmp + first two e8..cb thunks) — unique.
const EGA_HEADER_SIG = 'e90000e89401cbe83004cb';

/** Trace FUN_1c94 / FUN_210c entries during the INITIAL dungeon LOAD (not a
 *  per-step redraw) — to test whether they are the zone-load wall compositor. */
async function phaseLoadTrace(c: HostClient): Promise<void> {
  await c.step(3000);
  await c.key('enter', 'tap'); await c.step(800);
  for (let i = 0; i < 3; i++) {
    await c.key('enter', 'tap'); await c.step(60);
    await c.key('enter', 'tap'); await c.step(60);
    await c.key('up', 'tap'); await c.key('up', 'tap'); await c.key('up', 'tap'); await c.step(60);
  }
  await c.key('down', 'tap'); await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(60);
  // ega.drv base via header sig (loaded at boot, stable).
  const egaPhys = await c.find(EGA_HEADER_SIG);
  if (egaPhys < 0) throw new Error('ega.drv header not found');
  console.log(`ega.drv base = 0x${egaPhys.toString(16)} (expect ~0x6a1b0)`);
  const fun1c94 = egaPhys + 0x1c94;
  const fun210c = egaPhys + 0x210c;
  await c.key('enter', 'tap'); await c.step(200); // START NEW GAME
  await c.key('enter', 'tap'); await c.step(200); // scenario
  // arm traces just before the dungeon render
  await c.traceSet(fun1c94); await c.traceDrain();
  await c.key('enter', 'tap'); await c.step(400); // -> dungeon (first 3D render)
  const recs1 = await c.traceDrain();
  await c.traceOff();
  console.log(`\nFUN_1c94 (0x${fun1c94.toString(16)}) during dungeon LOAD: ${recs1.length} hits`);
  for (const r of recs1.slice(0, 4)) {
    console.log(`  ds=${r.ds.toString(16)} es=${r.es.toString(16)} ax=${r.eax.toString(16)} bx=${r.ebx.toString(16)} cx=${r.ecx.toString(16)} dx=${r.edx.toString(16)} si=${r.esi.toString(16)} di=${r.edi.toString(16)} bp=${r.ebp.toString(16)}`);
    console.log(`     stack: ${r.stack.map((w) => w.toString(16)).join(' ')}`);
  }
  // also FUN_210c
  await c.traceSet(fun210c); await c.traceDrain();
  // force another full render: examine or a step
  await c.key('enter', 'down'); await c.step(20); await c.key('enter', 'up'); await c.step(60);
  const recs2 = await c.traceDrain();
  await c.traceOff();
  console.log(`\nFUN_210c (0x${fun210c.toString(16)}) on a post-load forward step: ${recs2.length} hits`);
}

/** Memory-write watch during the INITIAL dungeon LOAD — to catch the COPIER that
 *  copies the ega.drv blit template into the work buffer (+ the per-column driver).
 *  argv: <baseHex> <endHex> (default = the work-buffer rasterizer code region). */
async function phaseWWLoad(c: HostClient): Promise<void> {
  // Wide range, excluding the ~0x41820 compose page (which floods). The work
  // buffer (copy target) was ~0x6d800 via unserialize; at fresh load it lands
  // somewhere in this range. The copier is a single cseip writing a contiguous
  // ~0x472-byte run.
  const base = parseInt(process.argv[3] ?? '60000', 16);
  const end = parseInt(process.argv[4] ?? '90000', 16);
  await c.step(3000);
  await c.key('enter', 'tap'); await c.step(800);
  for (let i = 0; i < 3; i++) {
    await c.key('enter', 'tap'); await c.step(60);
    await c.key('enter', 'tap'); await c.step(60);
    await c.key('up', 'tap'); await c.key('up', 'tap'); await c.key('up', 'tap'); await c.step(60);
  }
  await c.key('down', 'tap'); await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(60);
  const egaPhys = await c.find(EGA_HEADER_SIG);
  const ovl = egaPhys >= 0 ? egaPhys - 0x6a1b0 + 0x4784 : 0x4784;
  await c.key('enter', 'tap'); await c.step(200); // START NEW GAME
  await c.key('enter', 'tap'); await c.step(200); // scenario
  // arm just before the dungeon render; step incrementally + drain so the copy
  // isn't evicted from the 4096 ring.
  await c.wwatchSet(base, end);
  await c.key('enter', 'down');
  type Agg = { count: number; minAddr: number; maxAddr: number };
  const byWriter = new Map<number, Agg>();
  let total = 0;
  for (let i = 0; i < 40; i++) {
    await c.step(10);
    if (i === 3) await c.key('enter', 'up');
    const recs = await c.wwatchDrain();
    total += recs.length;
    for (const r of recs) {
      let a = byWriter.get(r.cseip);
      if (!a) { a = { count: 0, minAddr: r.addr, maxAddr: r.addr }; byWriter.set(r.cseip, a); }
      a.count++; a.minAddr = Math.min(a.minAddr, r.addr); a.maxAddr = Math.max(a.maxAddr, r.addr);
    }
  }
  await c.wwatchSet(0, 0);
  console.log(`ega.drv base=0x${egaPhys.toString(16)} ; total writes into [0x${base.toString(16)},0x${end.toString(16)}) during LOAD: ${total}`);
  console.log('writers (cseip -> count, dest-addr span):');
  for (const [cseip, a] of [...byWriter.entries()].sort((x, y) => y[1].count - x[1].count).slice(0, 30)) {
    const span = a.maxAddr - a.minAddr;
    const flag = span >= 0x300 && span <= 0x600 ? '  <== CONTIGUOUS ~blob-sized run (COPIER?)' : '';
    console.log(`  ${tagLin(cseip, ovl)} (lin 0x${cseip.toString(16)})  x${a.count}  dest 0x${a.minAddr.toString(16)}..0x${a.maxAddr.toString(16)} (span 0x${span.toString(16)})${flag}`);
  }
}

/** Drive to a FRESH dungeon load, then trace a rasterizer writer cseip during a
 *  forward redraw and dump its register progression (si=source texel, di=dest
 *  pixel → the U/V sampling law). argv: <targetLinHex> (default 6d6c0). */
async function phaseDrvTrace(c: HostClient): Promise<void> {
  const target = parseInt(process.argv[3] ?? '6d6c0', 16);
  await c.step(3000);
  await c.key('enter', 'tap'); await c.step(800);
  for (let i = 0; i < 3; i++) {
    await c.key('enter', 'tap'); await c.step(60);
    await c.key('enter', 'tap'); await c.step(60);
    await c.key('up', 'tap'); await c.key('up', 'tap'); await c.key('up', 'tap'); await c.step(60);
  }
  await c.key('down', 'tap'); await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(60);
  await c.key('enter', 'tap'); await c.step(200); // START NEW GAME
  await c.key('enter', 'tap'); await c.step(200); // scenario
  // arm BEFORE the dungeon render — the full texture compose runs at LOAD
  await c.traceSet(target); await c.traceDrain();
  await c.key('enter', 'tap'); await c.step(400); // -> dungeon (first full compose)
  const recs = await c.traceDrain();
  await c.traceOff();
  console.log(`writer 0x${target.toString(16)}: ${recs.length} hits during LOAD compose`);
  console.log('si=source texel, di=dest pixel (the U/V progression):');
  for (const r of recs.slice(0, 32)) {
    console.log(`  ds=${r.ds.toString(16)} es=${r.es.toString(16)} si=${r.esi.toString(16)} di=${r.edi.toString(16)} ax=${r.eax.toString(16)} bx=${r.ebx.toString(16)} cx=${r.ecx.toString(16)} dx=${r.edx.toString(16)} bp=${r.ebp.toString(16)}`);
  }
}

/** Drive to a FRESH dungeon load, then dump a linear region to a file (for the
 *  source texture at ~0x550e0 etc.). argv: <linHex> <lenHex> <outPath>.
 *  Uses only `read` — works on the nightly core. */
async function phaseDumpTex(c: HostClient): Promise<void> {
  const lin = parseInt(process.argv[3] ?? '550e0', 16);
  const len = parseInt(process.argv[4] ?? '4000', 16);
  const out = process.argv[5] ?? '/tmp/wiz6-maze-tex.bin';
  await c.step(3000);
  await c.key('enter', 'tap'); await c.step(800);
  for (let i = 0; i < 3; i++) {
    await c.key('enter', 'tap'); await c.step(60);
    await c.key('enter', 'tap'); await c.step(60);
    await c.key('up', 'tap'); await c.key('up', 'tap'); await c.key('up', 'tap'); await c.step(60);
  }
  await c.key('down', 'tap'); await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(60);
  await c.key('enter', 'tap'); await c.step(200); // START NEW GAME
  await c.key('enter', 'tap'); await c.step(200); // scenario
  await c.key('enter', 'tap'); await c.step(400); // -> dungeon (textures loaded, view composed)
  // read in <=0x8000 chunks (host read cap is 65536)
  const buf = new Uint8Array(len);
  for (let off = 0; off < len; off += 0x8000) {
    const n = Math.min(0x8000, len - off);
    const part = await c.read(lin + off, n);
    buf.set(part.subarray(0, n), off);
  }
  writeFileSync(out, Buffer.from(buf));
  const distinct = new Set(buf.subarray(0, 0x800)).size;
  console.log(`dumped 0x${len.toString(16)} bytes at lin 0x${lin.toString(16)} -> ${out} (distinct bytes in head: ${distinct})`);
}

/** Drive to a FRESH dungeon load, then capture the LIVE memory at a trace target
 *  DURING the load compose (when transient blit code/data is live).
 *  argv: <targetLinHex> <capBaseLinHex> <capLenHex> [skip] [outPath]. */
async function phaseCapLoad(c: HostClient): Promise<void> {
  const target = parseInt(process.argv[3] ?? '6dbd5', 16);
  const base = parseInt(process.argv[4] ?? '6db00', 16);
  const len = parseInt(process.argv[5] ?? '200', 16);
  const skip = parseInt(process.argv[6] ?? '0', 10);
  const out = process.argv[7] ?? '/tmp/wiz6-capload.bin';
  await c.step(3000);
  await c.key('enter', 'tap'); await c.step(800);
  for (let i = 0; i < 3; i++) {
    await c.key('enter', 'tap'); await c.step(60);
    await c.key('enter', 'tap'); await c.step(60);
    await c.key('up', 'tap'); await c.key('up', 'tap'); await c.key('up', 'tap'); await c.step(60);
  }
  await c.key('down', 'tap'); await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(60);
  await c.key('enter', 'tap'); await c.step(200); // START NEW GAME
  await c.key('enter', 'tap'); await c.step(200); // scenario
  await c.traceSet(target);
  await c.captureSet(base, len, skip);
  await c.key('enter', 'tap'); await c.step(400); // -> dungeon (load compose; target fires)
  const bytes = await c.captureGet();
  await c.traceOff();
  if (!bytes) { console.log(`NOT captured (target 0x${target.toString(16)} never hit during load)`); return; }
  writeFileSync(out, Buffer.from(bytes));
  console.log(`captured 0x${bytes.length.toString(16)} bytes at lin 0x${base.toString(16)} (target 0x${target.toString(16)}, skip ${skip}) -> ${out}`);
}

/** Capture the LIVE mid-frame memory at a trace target during a redraw.
 *  argv: <traceTargetLin> <capBaseLin> <capLenHex> [skip]  — all hex except skip. */
async function phaseCap(c: HostClient): Promise<void> {
  const target = parseInt(process.argv[3] ?? '6d9e0', 16);
  const base = parseInt(process.argv[4] ?? '6d800', 16);
  const len = parseInt(process.argv[5] ?? '1000', 16);
  const skip = parseInt(process.argv[6] ?? '0', 10);
  const out = process.argv[7] ?? '/tmp/wiz6-cap.bin';
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(target);
  await c.captureSet(base, len, skip);
  await forceRedraw(c);
  const bytes = await c.captureGet();
  await c.traceOff();
  if (!bytes) { console.log(`NOT captured (target 0x${target.toString(16)} never hit, or skip ${skip} too high)`); return; }
  writeFileSync(out, Buffer.from(bytes));
  console.log(`captured 0x${bytes.length.toString(16)} bytes at lin 0x${base.toString(16)} (target 0x${target.toString(16)}, skip ${skip}) -> ${out}`);
  // quick idle-compare: is the captured (live) content different from idle?
  await c.unserialize(CLEAN_STATE); await c.step(2);
  const idle = await c.read(base, len);
  let diff = 0; for (let i = 0; i < bytes.length; i++) if (bytes[i] !== idle[i]) diff++;
  console.log(`vs idle: ${diff}/${bytes.length} bytes differ ${diff > 0 ? '(LIVE code differs from idle data — capture worked!)' : '(identical — region is stable)'}`);
}

/** Memory-write watch: find WHO writes a region during a redraw.
 *  argv: <baseHex> <endHex>  (default = the work-buffer code region). */
async function phaseWWatch(c: HostClient): Promise<void> {
  const ovl = ovlBase();
  const base = parseInt(process.argv[3] ?? '6d800', 16);
  const end = parseInt(process.argv[4] ?? '6e000', 16);
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.wwatchSet(base, end);
  await forceRedraw(c);
  const recs = await c.wwatchDrain();
  await c.wwatchSet(0, 0);
  console.log(`writes into [0x${base.toString(16)},0x${end.toString(16)}) during redraw: ${recs.length}`);
  // group by writer cseip
  const byWriter = new Map<number, { count: number; addrs: Set<number> }>();
  for (const r of recs) {
    let e = byWriter.get(r.cseip);
    if (!e) { e = { count: 0, addrs: new Set() }; byWriter.set(r.cseip, e); }
    e.count++; e.addrs.add(r.addr);
  }
  console.log('writers (cseip -> count, distinct dest addrs):');
  for (const [cseip, e] of [...byWriter.entries()].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${tagLin(cseip, ovl)} (lin 0x${cseip.toString(16)})  x${e.count}  -> ${e.addrs.size} dest addrs`);
  }
}

/** Capture the FULLY-COMPOSED 4-plane maze page from the CLEAN_STATE corridor
 *  frame and pixel-compare the 3D viewport (x72..247/y32..143) to the live
 *  framebuffer. The page->VRAM blit is offset-preserving (si==di), so a uniform
 *  decode IS the screen — the only trick is capturing the page at the LAST
 *  plane-0 store (skip = storeCount-1), after the interleaved compositor has
 *  finished. Plane-0 store = cs=0x6b91 ip 0x909 (lin 0x6c219 in CLEAN_STATE).
 *  argv: [plane0StoreLin=6c219] [pageLin=41820]  → writes /tmp/wiz6-vp-page.bin + fb. */
async function phaseCapVp(c: HostClient): Promise<void> {
  const STORE = parseInt(process.argv[3] ?? '6c219', 16);
  const PAGE = parseInt(process.argv[4] ?? '41820', 16);
  const PS = 0x2000;
  if (!existsSync(CLEAN_STATE)) throw new Error('run `reach` first');
  // Count plane-0 stores in this run's redraw.
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(STORE); await c.traceDrain();
  await forceRedraw(c);
  const n = (await c.traceDrain()).length; await c.traceOff();
  console.log(`plane-0 store count = ${n}`);
  // Capture each plane at the LAST store (fully composed page).
  const full = new Uint8Array(0x8000);
  for (let p = 0; p < 4; p++) {
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(STORE);
    await c.captureSet(PAGE + p * PS, PS, n - 1);
    await forceRedraw(c);
    const part = await c.captureGet();
    await c.traceOff();
    if (!part || part.length < PS) throw new Error(`plane ${p} capture short`);
    full.set(part.subarray(0, PS), p * PS);
  }
  writeFileSync('/tmp/wiz6-vp-page.bin', Buffer.from(full));
  await c.unserialize(CLEAN_STATE); await c.step(2); await forceRedraw(c);
  await c.fb('/tmp/wiz6-vp-fb.fb');
  // Decode + compare the viewport (offset-preserving uniform decode).
  const fb = new Uint8Array(readFileSync('/tmp/wiz6-vp-fb.fb'));
  const ROWB = 40;
  const idxAt = (x: number, y: number) => {
    const o = y * ROWB + (x >> 3); const bit = 7 - (x & 7); let v = 0;
    for (let p = 0; p < 4; p++) v |= ((full[o + p * PS]! >> bit) & 1) << p;
    return v;
  };
  const votes = Array.from({ length: 16 }, () => new Map<number, number>());
  for (let y = 0; y < 200; y++) for (let x = 0; x < W; x++) {
    const i = idxAt(x, y); const o = (y * W + x) * 4;
    const k = (fb[o]! << 16) | (fb[o + 1]! << 8) | fb[o + 2]!;
    votes[i]!.set(k, (votes[i]!.get(k) ?? 0) + 1);
  }
  const pal = votes.map((m) => { let best = 0, bc = -1; for (const [k, v] of m) if (v > bc) { bc = v; best = k; } return [best >> 16 & 255, best >> 8 & 255, best & 255]; });
  const mr = (x0: number, x1: number, y0: number, y1: number) => {
    let n2 = 0, m = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = idxAt(x, y); const o = (y * W + x) * 4; n2++;
      if (pal[i]![0] === fb[o] && pal[i]![1] === fb[o + 1] && pal[i]![2] === fb[o + 2]) m++;
    }
    return (100 * m / n2).toFixed(2);
  };
  console.log(`VIEWPORT (x72..247 y32..143): ${mr(VP.x0, VP.x1, VP.y0, VP.y1)}%  (target 100)`);
  console.log(`CHROME   (y144..199):         ${mr(0, 320, 144, 200)}%`);
  console.log(`page -> /tmp/wiz6-vp-page.bin (decode via tools/parity/render-maze-page.ts)`);
}

/**
 * geom — FROM-GEOMETRY wall render validation (the stage-1 (walltype,depth) ->
 * piece -> source-cell bridge). Captures, for the CLEAN_STATE corridor redraw:
 *   - the descriptor/atlas seg (ds at FUN_1c94's `mov ds,bx`, live lin 0x6d6d9)
 *   - the 11 compositor calls' arg frames + piece bytes (FUN_1c94 entry 0x6d6a4)
 *   - the off-screen page composed by the engine (last wall store)
 *   - the live framebuffer (for the palette)
 * Then renders the walls FROM GEOMETRY (descriptor table + atlas + the recovered
 * di/cl law) via tools/parity/render-maze-frame.ts renderFrameFromGeometry, and
 * pixel-compares to the engine composed page (walls over the engine background;
 * the floor/ceiling OR-blit is separately tracked).
 *
 * The live linear addresses are the relocated transient copy (cs=0x6ba1, base
 * lin 0x6ba10 = wmaze/ega.drv blit region): FUN_1c94 entry = 0x6ba10+0x1c94 =
 * 0x6d6a4; the `mov ds,bx` (descriptor seg) at +0x35 = 0x6d6d9; the plane-0
 * wall store = 0x6d9dd. RE-DERIVE per run if the heap layout shifts (find the
 * entry by tracing 0x6ba10+0x1c94; confirm 11 hits).
 */
async function phaseGeom(c: HostClient): Promise<void> {
  const { renderFrameFromGeometry } = await import('../parity/render-maze-frame.js');
  const ENTRY = 0x6d6a4;
  const AFTER_DS = ENTRY + (0x1cc9 - 0x1c94); // 0x6d6d9
  const STORE = 0x6d9dd;
  const PAGE = 0x41820, PS = 0x2000, ROWB = 40;
  const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
  if (!existsSync(CLEAN_STATE)) throw new Error('run `reach` first');

  // descriptor/atlas seg (ds after the FUN_1c94 mov ds,bx)
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(AFTER_DS); await c.traceDrain();
  await forceRedraw(c);
  const dsRecs = await c.traceDrain(); await c.traceOff();
  const dseg = dsRecs[0]!.ds;
  console.log(`descriptor/atlas seg = 0x${dseg.toString(16)} (${dsRecs.length} FUN_1c94 calls)`);

  // full atlas + descriptor table (captured at the first call's after-ds)
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(AFTER_DS); await c.captureSet(dseg << 4, 0x4000, 0);
  await forceRedraw(c);
  const atlas = (await c.captureGet())!; await c.traceOff();
  const descs: Array<{ srcPtr: number; w: number; h: number; bitmap: number[] }> = [];
  for (let p = 1; p <= 0x18; p++) {
    const o = (p - 1) * 0x18;
    descs.push({ srcPtr: u16(atlas, o), w: atlas[o + 2]!, h: atlas[o + 3]!, bitmap: [...atlas.slice(o + 4, o + 0x18)] });
  }

  // compositor call list (piece byte + x0 + arg10) per FUN_1c94 entry
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(ENTRY); await c.traceDrain();
  await forceRedraw(c);
  const calls = await c.traceDrain(); await c.traceOff();
  const callList: Array<{ piece: number; x0: number; arg10: number }> = [];
  for (let k = 0; k < calls.length; k++) {
    const r = calls[k]!; const ssbase = r.ss << 4; const bp = (r.esp & 0xffff) - 2;
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(ENTRY); await c.captureSet(ssbase + bp, 0x40, k);
    await forceRedraw(c);
    const win = (await c.captureGet())!; await c.traceOff();
    const x0 = u16(win, 0xe), arg10 = u16(win, 0x10), ptr = u16(win, 0x1a);
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(ENTRY); await c.captureSet(ssbase + ptr, 0x4, k);
    await forceRedraw(c);
    const pb = (await c.captureGet())!; await c.traceOff();
    callList.push({ piece: pb[0]!, x0, arg10 });
  }
  console.log('compositor calls:', callList.map((cc) => `0x${cc.piece.toString(16)}@${cc.x0}/${cc.arg10}`).join(' '));

  // engine composed page (last wall store) + framebuffer
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(STORE); await c.traceDrain(); await forceRedraw(c);
  const nStores = (await c.traceDrain()).length; await c.traceOff();
  const composed = new Uint8Array(0x8000);
  for (let p = 0; p < 4; p++) {
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(STORE); await c.captureSet(PAGE + p * PS, PS, nStores - 1);
    await forceRedraw(c);
    const part = (await c.captureGet())!; await c.traceOff();
    composed.set(part.subarray(0, PS), p * PS);
  }
  await c.unserialize(CLEAN_STATE); await c.step(2); await forceRedraw(c);
  await c.fb('/tmp/wiz6-geom-fb.fb');
  const fb = new Uint8Array(readFileSync('/tmp/wiz6-geom-fb.fb'));

  // FROM-GEOMETRY render: walls over the engine background (composed = bg+walls;
  // we re-render walls over it, so opaque texels overwrite identically and the
  // mismatch count = pure wall-render error). Reports the viewport match.
  const idxAt = (pg: Uint8Array, x: number, y: number) => {
    const o = y * ROWB + (x >> 3); const bit = 7 - (x & 7); let v = 0;
    for (let p = 0; p < 4; p++) v |= ((pg[o + p * PS]! >> bit) & 1) << p;
    return v;
  };
  const page = new Uint8Array(composed);
  renderFrameFromGeometry(page, atlas, descs, callList);
  // palette from the composed page (exact)
  const votes = Array.from({ length: 16 }, () => new Map<number, number>());
  for (let y = 0; y < 200; y++) for (let x = 0; x < W; x++) {
    const i = idxAt(composed, x, y); const o = (y * W + x) * 4;
    const key = (fb[o]! << 16) | (fb[o + 1]! << 8) | fb[o + 2]!;
    votes[i]!.set(key, (votes[i]!.get(key) ?? 0) + 1);
  }
  const pal = votes.map((m) => { let best = 0, bc = -1; for (const [k, v] of m) if (v > bc) { bc = v; best = k; } return [best >> 16 & 255, best >> 8 & 255, best & 255]; });
  let n = 0, mIdx = 0, mFb = 0;
  for (let y = VP.y0; y < VP.y1; y++) for (let x = VP.x0; x < VP.x1; x++) {
    n++; const i = idxAt(page, x, y);
    if (i === idxAt(composed, x, y)) mIdx++;
    const o = (y * W + x) * 4;
    if (pal[i]![0] === fb[o] && pal[i]![1] === fb[o + 1] && pal[i]![2] === fb[o + 2]) mFb++;
  }
  writeFileSync('/tmp/wiz6-geom-meta.json', JSON.stringify({ dseg, descs, callList, nStores }, null, 2));
  writeFileSync('/tmp/wiz6-geom-atlas.bin', Buffer.from(atlas));
  writeFileSync('/tmp/wiz6-geom-composed.bin', Buffer.from(composed));
  console.log(`\nFROM-GEOMETRY wall render (walls over engine bg), VIEWPORT (x72..247 y32..143):`);
  console.log(`  index match  = ${(100 * mIdx / n).toFixed(2)}%`);
  console.log(`  fb-color match = ${(100 * mFb / n).toFixed(2)}%  (${n - mIdx} mismatching px)`);
  console.log(`artifacts: /tmp/wiz6-geom-{meta.json,atlas.bin,composed.bin,fb.fb}`);
}

async function phaseFine(c: HostClient): Promise<void> {
  const ovl = ovlBase();
  const offs = process.argv.slice(3).map((s) => parseInt(s, 16));
  for (const off of offs) {
    await c.unserialize(CLEAN_STATE);
    await c.step(2);
    await c.traceSet(ovl + off);
    await c.traceDrain();
    await forceRedraw(c);
    const recs = await c.traceDrain();
    await c.traceOff();
    console.log(`\n=== 0x${off.toString(16)} (lin 0x${(ovl + off).toString(16)}): ${recs.length} hits ===`);
    for (const r of recs.slice(0, 12)) {
      console.log(`  cs=${r.cs.toString(16)} ip=${r.eip.toString(16)} ds=${r.ds.toString(16)} ax=${r.eax.toString(16)} bx=${r.ebx.toString(16)} cx=${r.ecx.toString(16)} dx=${r.edx.toString(16)} si=${r.esi.toString(16)} di=${r.edi.toString(16)} bp=${r.ebp.toString(16)} stack=[${r.stack.map((w) => w.toString(16)).join(',')}]`);
    }
  }
}

async function main() {
  const phase = process.argv[2];
  const c = new HostClient();
  try {
    if (phase === 'reach') await phaseReach(c);
    else if (phase === 'calibrate') await phaseCalibrate(c);
    else if (phase === 'coarse') await phaseCoarse(c);
    else if (phase === 'funcs') await phaseFuncs(c);
    else if (phase === 'ctargets') await phaseCtargets(c);
    else if (phase === 'teste') await phaseTestE(c);
    else if (phase === 'validate') await phaseValidate(c);
    else if (phase === 'where') await phaseWhere(c);
    else if (phase === 'dump') await phaseDump(c);
    else if (phase === 'afine') await phaseAfine(c);
    else if (phase === 'dumpat') await phaseDumpAt(c);
    else if (phase === 'loadtrace') await phaseLoadTrace(c);
    else if (phase === 'wwload') await phaseWWLoad(c);
    else if (phase === 'drvtrace') await phaseDrvTrace(c);
    else if (phase === 'dumptex') await phaseDumpTex(c);
    else if (phase === 'capload') await phaseCapLoad(c);
    else if (phase === 'cap') await phaseCap(c);
    else if (phase === 'wwatch') await phaseWWatch(c);
    else if (phase === 'capvp') await phaseCapVp(c);
    else if (phase === 'geom') await phaseGeom(c);
    else if (phase === 'fine') await phaseFine(c);
    else console.log('phases: reach | calibrate | teste | funcs | ctargets | coarse | fine <off...>');
  } finally {
    c.close();
  }
}
main();
