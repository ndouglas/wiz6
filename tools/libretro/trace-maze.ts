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
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { HostClient, type TraceRecord } from '../../packages/mcp/src/live/host-client.js';

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

/** Little-endian u16 read (module-scope helper for the capture harness). */
function u16(b: Uint8Array, o: number): number { return b[o]! | (b[o + 1]! << 8); }

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

// The "forward step" key used by forceRedraw / OR-base resolution. In the legacy
// CLEAN_STATE (gy118, scripted-entry mode) ENTER IS forward; in TRUE free-roam
// (the `freeroam` phase's origin states) the forward key is the UP arrow (ENTER
// opens OPTIONS). phaseFreeRoam flips this to 'up' for its capture.
let FORWARD_KEY = 'enter';

/** Force ONE 3D redraw via a forward step (held FORWARD_KEY), settle. */
async function forceRedraw(c: HostClient): Promise<void> {
  await c.key(FORWARD_KEY, 'down'); await c.step(20);
  await c.key(FORWARD_KEY, 'up'); await c.step(60);
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
  const { renderFrameFromGeometry, generateCallList, MAZE_FRAME_Y3_SPANS } = await import('../parity/render-maze-frame.js');
  // FROM-GEOMETRY: derive whether to GENERATE the call-list from the span list
  // (the recovered flush law) instead of replaying the captured FUN_1c94 list.
  // `geom gen` -> generate; `geom` -> replay the live capture (back-compat).
  const useGenerated = process.argv[3] === 'gen';
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
  // The from-geometry call-list: either GENERATED via the recovered flush law
  // (generateCallList over the reconstructed span list) or the live capture.
  const genList = generateCallList(MAZE_FRAME_Y3_SPANS);
  const renderList = useGenerated ? genList : callList;
  if (useGenerated) {
    const same = genList.length === callList.length && genList.every((g, i) =>
      g.piece === callList[i]?.piece && g.x0 === callList[i]?.x0 && g.arg10 === callList[i]?.arg10);
    console.log(`GENERATED call-list (flush law over reconstructed spans): ${genList.map((cc) => `0x${cc.piece.toString(16)}@${cc.x0}/${cc.arg10}`).join(' ')}`);
    console.log(`  matches live capture: ${same}`);
  }
  renderFrameFromGeometry(page, atlas, descs, renderList);
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

/**
 * geomspan — the FROM-RAW-GEOMETRY validation (PRIMARY deliverable). Unlike
 * `geom` (which uses a held-ENTER forceRedraw that drives MULTIPLE frames and
 * conflates two frames' call lists into 11 calls), this phase validates the
 * TRUE single-frame BUILD law:
 *   1. drive a SINGLE forward step (y2->y3) that genuinely rebuilds the span list
 *   2. read the per-frame span list LIVE from DGROUP 0x50d0 (count @0x50ce)
 *   3. GENERATE the FUN_1c94 call list from those spans via the flush
 *      (generateCallList: one call per wt!=0xff span, depth outer 0x521e..0)
 *   4. render the walls FROM GEOMETRY over the engine composed page
 *   5. pixel-compare the viewport (target 100%)
 *
 * This closes the BUILD link: maze span list -> call list -> page. The span
 * list ITSELF is the build-emitter output (wall_emit_corner/quad span_append),
 * read live here as ground truth; the seam-refinement that turns the emitter's
 * x0_base=0/x1_base=0 + seamIdx into the screen columns is the validated
 * refineSpanColumns law (docs/re/findings/maze-span-build.json).
 */
async function phaseGeomSpan(c: HostClient): Promise<void> {
  const { renderFrameFromGeometry, generateCallList } = await import('../parity/render-maze-frame.js');
  const AFTER_DS = 0x6d6a4 + (0x1cc9 - 0x1c94);
  const STORE = 0x6d9dd, PAGE = 0x41820, PS = 0x2000, ROWB = 40;
  const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
  const s16 = (b: Uint8Array, o: number) => { const v = u16(b, o); return v & 0x8000 ? v - 0x10000 : v; };
  if (!existsSync(CLEAN_STATE)) throw new Error('run `reach` first');

  // A single forward step (y2->y3) that REBUILDS the span list, then read it.
  const oneStepRebuild = async () => { await c.key('up', 'tap'); await c.step(40); };

  await c.unserialize(CLEAN_STATE); await c.step(2);
  const base = await c.anchor();
  await oneStepRebuild();
  const size = u16(await c.read(base + 0x521e, 2), 0) || 4;
  const cnt = u16(await c.read(base + 0x50ce, 2), 0);
  const sb = await c.read(base + 0x50d0, cnt * 0xb + 4);
  const spans = [];
  for (let i = 0; i < cnt; i++) {
    const o = i * 0xb;
    spans.push({
      x0: s16(sb, o), x1: s16(sb, o + 2), clipLo: u16(sb, o + 4), clipHi: u16(sb, o + 6),
      walltype: sb[o + 8]!, seamIdx: sb[o + 9]!, depthField: sb[o + 0xa]!,
    });
  }
  console.log(`live span list (count=${cnt}, depth-bound ${size}):`);
  for (const s of spans) console.log(`  x0=${s.x0} x1=${s.x1} clip=${s.clipLo}/${s.clipHi} wt=${s.walltype} seam=${s.seamIdx} depth=${s.depthField}`);
  const calls = generateCallList(spans, size);
  console.log(`generated call list: ${calls.map((cc) => `0x${cc.piece.toString(16)}@${cc.x0}/${cc.arg10}`).join(' ')}`);

  // Capture descriptor seg + atlas + engine composed page on the SAME rebuild.
  // (forceRedraw also drives the renderer; the engine page after the step is the
  // y3 composite — capture it via the last wall store on a forceRedraw replay.)
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(AFTER_DS); await c.traceDrain();
  await forceRedraw(c);
  const dsRecs = await c.traceDrain(); await c.traceOff();
  const dseg = dsRecs[0]!.ds;
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(AFTER_DS); await c.captureSet(dseg << 4, 0x4000, 0);
  await forceRedraw(c);
  const atlas = (await c.captureGet())!; await c.traceOff();
  const descs = [];
  for (let p = 1; p <= 0x18; p++) {
    const o = (p - 1) * 0x18;
    descs.push({ srcPtr: u16(atlas, o), w: atlas[o + 2]!, h: atlas[o + 3]!, bitmap: [...atlas.slice(o + 4, o + 0x18)] });
  }
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
  await c.fb('/tmp/wiz6-geomspan-fb.fb');
  const fb = new Uint8Array(readFileSync('/tmp/wiz6-geomspan-fb.fb'));

  const idxAt = (pg: Uint8Array, x: number, y: number) => {
    const o = y * ROWB + (x >> 3); const bit = 7 - (x & 7); let v = 0;
    for (let p = 0; p < 4; p++) v |= ((pg[o + p * PS]! >> bit) & 1) << p;
    return v;
  };
  const page = new Uint8Array(composed);
  renderFrameFromGeometry(page, atlas, descs, calls);
  const votes = Array.from({ length: 16 }, () => new Map<number, number>());
  for (let y = 0; y < 200; y++) for (let x = 0; x < W; x++) {
    const i = idxAt(composed, x, y); const o = (y * W + x) * 4;
    const k = (fb[o]! << 16) | (fb[o + 1]! << 8) | fb[o + 2]!;
    votes[i]!.set(k, (votes[i]!.get(k) ?? 0) + 1);
  }
  const pal = votes.map((m) => { let b = 0, bc = -1; for (const [k, v] of m) if (v > bc) { bc = v; b = k; } return [b >> 16 & 255, b >> 8 & 255, b & 255]; });
  let n = 0, mIdx = 0, mFb = 0;
  for (let y = VP.y0; y < VP.y1; y++) for (let x = VP.x0; x < VP.x1; x++) {
    n++; const i = idxAt(page, x, y);
    if (i === idxAt(composed, x, y)) mIdx++;
    const o = (y * W + x) * 4;
    if (pal[i]![0] === fb[o] && pal[i]![1] === fb[o + 1] && pal[i]![2] === fb[o + 2]) mFb++;
  }
  console.log(`\nFROM-GEOMETRY (single-frame span list -> flush -> render), VIEWPORT (x72..247 y32..143):`);
  console.log(`  index match    = ${(100 * mIdx / n).toFixed(2)}%`);
  console.log(`  fb-color match = ${(100 * mFb / n).toFixed(2)}%  (${n - mIdx} mismatch px)`);
}

/**
 * geomgen — the FULL from-GEOMETRY validation (the PRIMARY deliverable). Unlike
 * geomspan (which reads the live span list), this GENERATES the span list — incl
 * seamIdx — purely from geometry: per-depth solid-side flags + the seam tables
 * (deriveCorridorSpans), then flush -> render, and pixel-matches the engine page
 * for BOTH the y2 (clean) and y3 (one-step) corridor frames. NO live span read.
 */
async function phaseGeomGen(c: HostClient): Promise<void> {
  const { renderFrameFromGeometry, generateCallList, deriveCorridorSpans } =
    await import('../parity/render-maze-frame.js');
  const AFTER_DS = 0x6d6a4 + (0x1cc9 - 0x1c94);
  const STORE = 0x6d9dd, PAGE = 0x41820, PS = 0x2000, ROWB = 40;
  const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
  if (!existsSync(CLEAN_STATE)) throw new Error('run `reach` first');

  // The per-frame solid-side classification (from the live wt=2 spans' seamIdx,
  // decoded via the cornerSolidSeamIdx law: base 12=left, 10=right; this IS the
  // geometry input a full classifier would produce):
  //   y2 (clean):     df1 left, df2 right, df3 left
  //   y3 (one step):  df1 right, df2 left
  // prep MUST land on the target frame's RENDER without advancing past it. For
  // y2 the clean state is ALREADY the y2 composite (rendered on entry) — re-run
  // its render WITHOUT moving by toggling the redraw via a no-op that re-enters
  // the renderer. forceRedraw (forward step) MOVES y2->y3, so for y2 we capture
  // the page already present in the clean serialized state (no redraw).
  const FRAMES: Array<{ name: string; prep: () => Promise<void>; noRedraw?: boolean; sides: Array<Array<'left' | 'right'>> }> = [
    { name: 'y2 (clean, no-move)', prep: async () => { await c.step(2); }, noRedraw: true, sides: [['left'], ['right'], ['left']] },
    { name: 'y3 (one fwd step)', prep: async () => { await c.key('up', 'tap'); await c.step(40); await forceRedraw(c); }, sides: [['right'], ['left']] },
  ];

  // Seam tables (live, walltype 2 region) — DATA, read once.
  await c.unserialize(CLEAN_STATE); await c.step(2);
  const base = await c.anchor();
  const sx0 = await c.read(base + 0x36e4, 0x13a * 3);
  const sx1 = await c.read(base + 0x3717, 0x13a * 3);

  const idxAt = (pg: Uint8Array, x: number, y: number) => {
    const o = y * ROWB + (x >> 3); const bit = 7 - (x & 7); let v = 0;
    for (let p = 0; p < 4; p++) v |= ((pg[o + p * PS]! >> bit) & 1) << p;
    return v;
  };

  for (const fr of FRAMES) {
    // GENERATE the span list from geometry (no live span read).
    const spans = deriveCorridorSpans(fr.sides, sx0, sx1);
    const calls = generateCallList(spans);
    console.log(`\n=== ${fr.name} ===`);
    console.log(`  generated spans: ${spans.map((s) => `seam${s.seamIdx}@${s.x0}/${s.x1}(df${s.depthField})`).join(' ')}`);
    console.log(`  generated calls: ${calls.map((cc) => `0x${cc.piece.toString(16)}@${cc.x0}/${cc.arg10}`).join(' ')}`);

    // descriptor seg + atlas: the tile-2 descriptor table is frame-independent;
    // capture it from a redraw (always available via the y3 fwd-step path).
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(AFTER_DS); await c.traceDrain();
    await c.key('up', 'tap'); await c.step(40); await forceRedraw(c);
    const dsRecs = await c.traceDrain(); await c.traceOff();
    const dseg = dsRecs[0]!.ds;
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(AFTER_DS); await c.captureSet(dseg << 4, 0x4000, 0);
    await c.key('up', 'tap'); await c.step(40); await forceRedraw(c);
    const atlas = (await c.captureGet())!; await c.traceOff();
    const descs = [];
    for (let p = 1; p <= 0x18; p++) {
      const o = (p - 1) * 0x18;
      descs.push({ srcPtr: u16(atlas, o), w: atlas[o + 2]!, h: atlas[o + 3]!, bitmap: [...atlas.slice(o + 4, o + 0x18)] });
    }
    // engine composed page for THIS frame.
    const composed = new Uint8Array(0x8000);
    if (fr.noRedraw) {
      // y2: the clean serialized state already holds the y2 composite in the
      // off-screen page — read it directly (no move, no redraw).
      await c.unserialize(CLEAN_STATE); await c.step(2);
      for (let p = 0; p < 4; p++) {
        const part = await c.read(PAGE + p * PS, PS);
        composed.set(part.subarray(0, PS), p * PS);
      }
    } else {
      await c.unserialize(CLEAN_STATE); await c.step(2);
      await c.traceSet(STORE); await c.traceDrain(); await fr.prep();
      const nStores = (await c.traceDrain()).length; await c.traceOff();
      for (let p = 0; p < 4; p++) {
        await c.unserialize(CLEAN_STATE); await c.step(2);
        await c.traceSet(STORE); await c.captureSet(PAGE + p * PS, PS, nStores - 1); await fr.prep();
        const part = (await c.captureGet())!; await c.traceOff();
        composed.set(part.subarray(0, PS), p * PS);
      }
    }
    const fb = new Uint8Array(0);

    const page = new Uint8Array(composed);
    renderFrameFromGeometry(page, atlas, descs, calls);
    let n = 0, mIdx = 0;
    for (let y = VP.y0; y < VP.y1; y++) for (let x = VP.x0; x < VP.x1; x++) {
      n++; if (idxAt(page, x, y) === idxAt(composed, x, y)) mIdx++;
    }
    void fb;
    console.log(`  FROM-GEOMETRY viewport index match = ${(100 * mIdx / n).toFixed(2)}%  (${n - mIdx} mismatch px)`);
  }
}

/**
 * seamdump — read the live span list + frame-level inputs (parity, depth-bound,
 * slot arrays) for BOTH the y2 (clean) and y3 (one-step) frames. The purpose is
 * to PIN the (depth, side, parity) -> seamIdx assignment empirically: print, per
 * span, (seamIdx, depthField, x0, x1, wt) plus the frame parity/depth-bound, so
 * a closed-form can be cross-checked against the static emit-site disasm.
 */
async function phaseSeamTables(c: HostClient): Promise<void> {
  const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
  if (!existsSync(CLEAN_STATE)) throw new Error('run `reach` first');
  await c.unserialize(CLEAN_STATE); await c.step(2);
  const base = await c.anchor();
  for (const wt of [0, 1, 2]) {
    const x0t = await c.read(base + 0x36e4 + 0x13a * wt, 0x40);
    const x1t = await c.read(base + 0x3717 + 0x13a * wt, 0x40);
    console.log(`\nwalltype ${wt}:`);
    // seam_x0 indexed by 2*seamIdx; seam_x1 by 1*seamIdx
    console.log(`  seam_x0 (by 2*seam): ${Array.from({ length: 20 }, (_, s) => `[${s}]=${x0t[2 * s]}`).join(' ')}`);
    console.log(`  seam_x1 (by 1*seam): ${Array.from({ length: 20 }, (_, s) => `[${s}]=${x1t[s]}`).join(' ')}`);
  }
  // convergence
  const cv = await c.read(base + 0x40, 0x14);
  console.log(`\nconvergence @0x42 (L): [${[0,1,2,3].map((d)=>u16(cv,2+2*d)).join(',')}] @0x4a (R): [${[0,1,2,3].map((d)=>u16(cv,0xa+2*d)).join(',')}]`);
}

async function dumpFrameFile(c: HostClient, label: string, path: string): Promise<void> {
  const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
  const s16 = (b: Uint8Array, o: number) => { const v = u16(b, o); return v & 0x8000 ? v - 0x10000 : v; };
  await c.step(3000); // boot the core so unserialize has a running game
  await c.unserialize(path); await c.step(2);
  const base = await c.anchor();
  const parity = u16(await c.read(base + 0x521a, 2), 0);
  const facing = u16(await c.read(base + 0x4f9a, 2), 0);
  const gx = u16(await c.read(base + 0x4fa4, 2), 0);
  const gy = u16(await c.read(base + 0x4fa2, 2), 0);
  const cnt = u16(await c.read(base + 0x50ce, 2), 0);
  const sb = await c.read(base + 0x50d0, cnt * 0xb + 4);
  console.log(`\n=== ${label} ===`);
  console.log(`  parity[0x521a]=${parity} facing=${facing} gx=${gx} gy=${gy} span count=${cnt}`);
  for (let i = 0; i < cnt; i++) {
    const o = i * 0xb;
    console.log(`    [${i}] x0=${s16(sb, o)} x1=${s16(sb, o + 2)} clip=${u16(sb, o + 4)}/${u16(sb, o + 6)} wt=${sb[o + 8]} seam=${sb[o + 9]} depthField=${sb[o + 0xa]}`);
  }
}

async function phaseSeamDump(c: HostClient): Promise<void> {
  const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
  const s16 = (b: Uint8Array, o: number) => { const v = u16(b, o); return v & 0x8000 ? v - 0x10000 : v; };
  if (!existsSync(CLEAN_STATE)) throw new Error('run `reach` first');

  const dumpFrame = async (label: string, after: () => Promise<void>) => {
    await c.unserialize(CLEAN_STATE); await c.step(2);
    const base = await c.anchor();
    await after();
    // frame-level inputs
    const parity = u16(await c.read(base + 0x521a, 2), 0);
    const perSpanParity = u16(await c.read(base + 0x521c, 2), 0);
    const depthBound = u16(await c.read(base + 0x521e, 2), 0);
    const facing = u16(await c.read(base + 0x4f9a, 2), 0);
    const gx = u16(await c.read(base + 0x4fa4, 2), 0);
    const gy = u16(await c.read(base + 0x4fa2, 2), 0);
    const cx = u16(await c.read(base + 0x4f9e, 2), 0);
    const cy = u16(await c.read(base + 0x4fa0, 2), 0); // ordering per findings: x/y/z
    // slot array @0x5220 (last-depth scratch)
    const slots = await c.read(base + 0x5220, 10);
    // span list
    const cnt = u16(await c.read(base + 0x50ce, 2), 0);
    const sb = await c.read(base + 0x50d0, cnt * 0xb + 4);
    console.log(`\n=== ${label} ===`);
    console.log(`  parity[0x521a]=${parity} perSpanParity[0x521c]=${perSpanParity} depthBound[0x521e]=${depthBound} facing[0x4f9a]=${facing} gx=${gx} gy=${gy} c1=${cx} c2=${cy}`);
    console.log(`  slot scratch @0x5220 (last depth): [${[0,2,4,6,8].map((o)=>u16(slots,o)).join(', ')}]`);
    console.log(`  span count=${cnt}`);
    for (let i = 0; i < cnt; i++) {
      const o = i * 0xb;
      const wt = sb[o + 8]!, seam = sb[o + 9]!, depth = sb[o + 0xa]!;
      const x0 = s16(sb, o), x1 = s16(sb, o + 2);
      const side = wt === 0xff ? 'edge' : (x0 < 160 ? 'L' : 'R');
      console.log(`    [${i}] x0=${x0} x1=${x1} clip=${u16(sb,o+4)}/${u16(sb,o+6)} wt=${wt} seam=${seam} depthField=${depth} side=${side}`);
    }
  };

  const stateArg = process.argv[3];
  if (stateArg) {
    // Dump the span list of an arbitrary committed state file (decompress .gz).
    let path = stateArg;
    if (stateArg.endsWith('.gz')) {
      const zlib = await import('node:zlib');
      const raw = zlib.gunzipSync(readFileSync(stateArg));
      path = '/tmp/wiz6-seamdump-state.bin';
      writeFileSync(path, raw);
    }
    const prevClean = CLEAN_STATE;
    await dumpFrameFile(c, `state ${stateArg}`, path);
    void prevClean;
    return;
  }
  await dumpFrame('clean', async () => { await forceRedraw(c); });
  await dumpFrame('back one (down)', async () => { await c.key('down', 'tap'); await c.step(40); });
  await dumpFrame('back two (down x2)', async () => { await c.key('down', 'tap'); await c.step(40); await c.key('down', 'tap'); await c.step(40); });
  await dumpFrame('fwd one (up)', async () => { await c.key('up', 'tap'); await c.step(40); });
}

/**
 * emitargs — find the RELOCATED wmaze code in RAM (via the span_append entry
 * signature) and trace the relocated span_append entry + the corner type-9 emit
 * site to capture the LIVE [bp+...] args, pinning seamIdx's source.
 */
async function phaseEmitArgs(c: HostClient): Promise<void> {
  const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
  if (!existsSync(CLEAN_STATE)) throw new Error('run `reach` first');
  const SPAN_APPEND_SIG = '558bec8a460450a1ce508bd0d1e003c2';
  const SPAN_APPEND_FILE = 0x3f8d;

  await c.unserialize(CLEAN_STATE); await c.step(2);
  // Scan the high RAM (overlay relocation) region for ALL copies of the
  // span_append sig — the in-image copy (~0x8711) is dormant; the LIVE renderer
  // runs from a relocated transient copy.
  const sigBytes = SPAN_APPEND_SIG.match(/../g)!.map((h) => parseInt(h, 16));
  const findAll = async (loBase: number, hiBase: number): Promise<number[]> => {
    const hits: number[] = [];
    const CHUNK = 0x8000;
    for (let b = loBase; b < hiBase; b += CHUNK - 16) {
      const buf = await c.read(b, Math.min(CHUNK, hiBase - b));
      for (let i = 0; i + sigBytes.length <= buf.length; i++) {
        let ok = true;
        for (let j = 0; j < sigBytes.length; j++) if (buf[i + j] !== sigBytes[j]) { ok = false; break; }
        if (ok) hits.push(b + i);
      }
    }
    return [...new Set(hits)];
  };
  // First force a redraw so the transient copy is resident, THEN scan (the
  // renderer copy is loaded lazily). Capture during a held redraw window.
  const ovl = ovlBase();
  console.log(`ovlBase = 0x${ovl.toString(16)}; renderer entry (file 0x4ad7) @lin 0x${(ovl + 0x4ad7).toString(16)}; span_append (file 0x3f8d) @lin 0x${(ovl + 0x3f8d).toString(16)}`);
  // Probe several redraw triggers to find one that re-runs the BUILD phase
  // (fires the renderer entry 0x4ad7). The forward step is blocked when the
  // party faces a wall (no rebuild). Try turn-left/right (which always redraw).
  const triggers: Array<[string, () => Promise<void>]> = [
    ['fwd (up)', async () => { await c.key('up', 'tap'); await c.step(40); }],
    ['turn-left', async () => { await c.key('left', 'tap'); await c.step(40); }],
    ['turn-right', async () => { await c.key('right', 'tap'); await c.step(40); }],
    ['back (down)', async () => { await c.key('down', 'tap'); await c.step(40); }],
  ];
  triggers; // (kept for reference; the renderer runs relocated, so we locate it via FUN_1c94)
  const fire = () => forceRedraw(c);
  // Locate the LIVE relocated renderer via the ega.drv FUN_1c94 entry (0x6d6a4,
  // per geom phase). At the FUN_1c94 hit, the call chain on the stack contains
  // the wmaze renderer's CS-relative return (file 0x5347 flush call -> ret
  // 0x534a, CS-offset 0x534a+0x4564=0x98ae). Read the live CS to compute the
  // relocated linear base = CS*16; reloc(fileOff) = CS*16 + (fileOff+0x4564).
  const FUN_1C94 = 0x6d6a4;
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(FUN_1C94); await c.traceDrain();
  await fire();
  const f1 = await c.traceDrain(); await c.traceOff();
  console.log(`FUN_1c94 entry @0x${FUN_1C94.toString(16)}: ${f1.length} hits`);
  if (f1.length === 0) { console.log('FUN_1c94 did not fire — forceRedraw not driving the renderer.'); return; }
  // Capture the FUN_1c94 caller stack to find the renderer CS. The renderer's
  // flush return (CS-off 0x98ae) appears in the call chain; its CS is the
  // relocated wmaze segment. Dump a deep stack window at the first hit.
  const r0 = f1[0]!; const ss0 = r0.ss << 4; const sp0 = r0.esp & 0xffff;
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(FUN_1C94); await c.captureSet(ss0 + sp0, 0x40, 0);
  await fire();
  const stk = (await c.captureGet())!; await c.traceOff();
  const stkWords: number[] = [];
  for (let i = 0; i < 0x40; i += 2) stkWords.push(u16(stk, i));
  console.log(`FUN_1c94 caller stack words: ${stkWords.map((w) => w.toString(16)).join(' ')}`);
  // Find 0x98ae (the renderer flush return CS-offset) in the stack; the word
  // BELOW it (toward higher addr, the far-call CS) is the renderer CS.
  let rendCS = -1;
  for (let i = 0; i < stkWords.length - 1; i++) {
    if (stkWords[i] === 0x98ae) { rendCS = stkWords[i + 1]!; break; }
  }
  // The renderer runs at CS-offset = file + 0x4564 (overlay delta). Scan RAM for
  // ALL copies of the renderer entry signature; the live copy is the one whose
  // renderer-entry (0x4ad7) fires under forceRedraw. renderer-entry CS-off =
  // 0x4ad7 + 0x4564 = 0x903b, so the copy's linear = rendBase such that
  // rendBase + 0x903b - <delta>... simplest: scan for RENDER_SIG, test each.
  const rsBytes = RENDER_SIG.match(/../g)!.map((h) => parseInt(h, 16));
  const scanSig = async (lo: number, hi: number, bytes: number[]): Promise<number[]> => {
    const hits: number[] = []; const CHUNK = 0x8000;
    for (let b = lo; b < hi; b += CHUNK - 32) {
      let buf: Uint8Array;
      try { buf = await c.read(b, Math.min(CHUNK, hi - b)); } catch { continue; }
      for (let i = 0; i + bytes.length <= buf.length; i++) {
        let ok = true; for (let j = 0; j < bytes.length; j++) if (buf[i + j] !== bytes[j]) { ok = false; break; }
        if (ok) hits.push(b + i);
      }
    }
    return [...new Set(hits)];
  };
  rsBytes; scanSig; r0;
  // WRITE-WATCH the span-list region (DGROUP 0x50d0..0x5140) during the redraw.
  // The writing instruction's cseip IS the relocated span_append store; from any
  // store's cseip we recover the relocated wmaze base (cseip of the 0x3fa6 store
  // `mov [bx+0x50d8],al` etc.). Then trap the relocated emit sites.
  await c.unserialize(CLEAN_STATE); await c.step(2);
  const dgroup = await c.anchor();
  const sl0 = dgroup + 0x50d0;
  await c.wwatchSet(sl0, sl0 + 0x80);
  await fire();
  const ww = await c.wwatchDrain();
  console.log(`span-list writes: ${ww.length}`);
  const cseips = new Set<number>();
  for (const w of ww.slice(0, 24)) { cseips.add(w.cseip); }
  console.log(`writer cseips: ${[...cseips].map((x) => '0x' + x.toString(16)).join(' ')}`);
  if (ww.length === 0) { console.log('NO span-list writes seen — wwatch base wrong or no rebuild.'); return; }
  // The store at file 0x3fa6 (`mov [bx+0x50d8],al`, walltype) is the FIRST write
  // per span. Its cseip = relocBase + 0x3fa6. Recover relocBase from the writer
  // whose (cseip & 0xf...) matches a known store offset; simplest: the smallest
  // cseip among the writers corresponds to the earliest store (0x3fa6 region).
  // We instead recover base by matching the in-file store offsets.
  const storeOffsets = [0x3fa6, 0x3fad, 0x3fb4, 0x3fd6, 0x3ff9, 0x4002, 0x400a, 0x4012, 0x401a];
  let relocBase = -1;
  for (const ce of cseips) {
    for (const so of storeOffsets) {
      const b = ce - so;
      // sanity: base should be consistent — verify another cseip matches base+someStore
      let matches = 0;
      for (const ce2 of cseips) for (const so2 of storeOffsets) if (ce2 === b + so2) matches++;
      if (matches >= 2) { relocBase = b; break; }
    }
    if (relocBase >= 0) break;
  }
  if (relocBase < 0) { console.log(`could not recover relocBase from cseips`); return; }
  console.log(`recovered relocBase = 0x${relocBase.toString(16)} (in-image ovlBase was 0x${ovl.toString(16)})`);
  const reloc = (f: number) => relocBase + f;

  // Trace a file offset (in-image == live), capturing the stack/regs per hit.
  const traceAndCapture = async (lin: number, label: string) => {
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(lin); await c.traceDrain();
    await fire();
    const recs = await c.traceDrain(); await c.traceOff();
    console.log(`\n=== ${label} @lin 0x${lin.toString(16)}: ${recs.length} hits ===`);
    for (let k = 0; k < Math.min(recs.length, 8); k++) {
      const r = recs[k]!;
      console.log(`  [${k}] cs=${r.cs.toString(16)} ip=${r.eip.toString(16)} ax=${r.eax.toString(16)} bx=${r.ebx.toString(16)} sp=${(r.esp & 0xffff).toString(16)} bp=${(r.ebp & 0xffff).toString(16)} stack=[${r.stack.map((w) => w.toString(16)).join(',')}]`);
    }
    return recs;
  };

  // span_append entry: trap, then for each hit read the stack to decode args.
  const recs = await traceAndCapture(reloc(SPAN_APPEND_FILE), 'span_append entry');
  for (let k = 0; k < recs.length; k++) {
    const r = recs[k]!; const ss = r.ss << 4; const sp = r.esp & 0xffff;
    // at entry (before push bp): [sp]=ret, [sp+2]=arg0(wt) ... so arg at bp+N is [sp + (N-2)].
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(reloc(SPAN_APPEND_FILE)); await c.captureSet(ss + sp, 0x24, k);
    await fire();
    const w = (await c.captureGet())!; await c.traceOff();
    // [sp]=ret(2), then args: wt=[sp+2], x0=[sp+4], x1=[sp+6], seam=[sp+8], clipLo=[sp+0xa], clipHi=[sp+0xc], depth=[sp+0xe]
    const wt = u16(w, 2) & 0xff, x0 = u16(w, 4), x1 = u16(w, 6), seam = u16(w, 8) & 0xff,
      clipLo = u16(w, 0xa), clipHi = u16(w, 0xc), depth = u16(w, 0xe) & 0xff;
    console.log(`  span_append[${k}] wt=${wt} x0_base=${x0} x1_base=${x1} seamIdx=${seam} clip=${clipLo}/${clipHi} depthField=${depth}`);
  }

  // corner type-9 emit site (the wt=2 solid span). Capture the CALLER's frame
  // ([bp+4]=depth, [bp+0xa]) at the relocated 0x4720.
  const cr = await traceAndCapture(reloc(0x4720), 'corner type-9 emit (0x4720)');
  for (let k = 0; k < cr.length; k++) {
    const r = cr[k]!; const ss = r.ss << 4; const bp = r.ebp & 0xffff;
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(reloc(0x4720)); await c.captureSet(ss + bp, 0x28, k);
    await fire();
    const w = (await c.captureGet())!; await c.traceOff();
    console.log(`  caller frame[${k}] [bp+4]=${u16(w, 4)} [bp+6]=${u16(w, 6)} [bp+8]=${u16(w, 8)} [bp+0xa]=${u16(w, 0xa)} [bp+0xc]=${u16(w, 0xc)}`);
  }

  // corner emitter ENTRY (0x45b4): capture [bp+6]=corner-type dispatch + [bp+4]
  const er = await traceAndCapture(reloc(0x45b4), 'wall_emit_corner entry (0x45b4)');
  for (let k = 0; k < er.length; k++) {
    const r = er[k]!; const ss = r.ss << 4; const sp = r.esp & 0xffff;
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(reloc(0x45b4)); await c.captureSet(ss + sp, 0x28, k);
    await fire();
    const w = (await c.captureGet())!; await c.traceOff();
    // before push bp: [sp]=ret, [sp+2]=[bp+4], [sp+4]=[bp+6], [sp+6]=[bp+8], [sp+8]=[bp+0xa]
    console.log(`  corner-entry[${k}] [bp+4]=${u16(w, 2)} [bp+6](type)=${u16(w, 4)} [bp+8]=${u16(w, 6)} [bp+0xa]=${u16(w, 8)}`);
  }
}

/**
 * buildwatch — capture the BUILD-phase span_append stores live by arming a
 * write-watch on the span-list region BEFORE a move that genuinely rebuilds it.
 * Records (cseip, addr, val) per store: from the cseip we recover the relocated
 * wmaze base; from the values we read each span's fields (incl. seamIdx) AND the
 * store order, which pins which emit site produced each span.
 */
async function phaseBuildWatch(c: HostClient): Promise<void> {
  const fresh = process.argv[3] === 'fresh';
  let dgroup: number;
  if (fresh) {
    // Cold-drive into the maze; arm wwatch just before the forward-walk that
    // genuinely moves the party (and rebuilds the span list).
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
    await c.key('enter', 'tap'); await c.step(400); // -> dungeon
    dgroup = await c.anchor();
    const sl0f = dgroup + 0x50d0;
    await c.wwatchSet(sl0f, sl0f + 0x150);
    for (let i = 0; i < 8; i++) { await c.key('enter', 'down'); await c.step(20); await c.key('enter', 'up'); await c.step(60); }
  } else {
    if (!existsSync(CLEAN_STATE)) throw new Error('run `reach` first');
    await c.unserialize(CLEAN_STATE); await c.step(2);
    dgroup = await c.anchor();
    await c.wwatchSet(dgroup + 0x50d0, dgroup + 0x50d0 + 0x150);
    for (const k of ['up', 'left', 'up', 'right', 'up', 'down', 'up']) { await c.key(k as any, 'tap'); await c.step(40); }
  }
  const sl0 = dgroup + 0x50d0;
  const ww = await c.wwatchDrain();
  console.log(`span-list region writes: ${ww.length}`);
  if (ww.length === 0) { console.log('no rebuild observed from CLEAN_STATE moves.'); return; }
  // group by store offset within the span list
  for (const w of ww.slice(0, 60)) {
    const off = w.addr - sl0;
    console.log(`  cseip=0x${w.cseip.toString(16)} addr=+0x${off.toString(16)} (span ${Math.floor(off / 0xb)} field +${off % 0xb}) val=0x${w.val.toString(16)}`);
  }
  // recover relocated base from any store cseip (file 0x3fa6/0x3fad/...).
  const storeOffsets = [0x3fa6, 0x3fad, 0x3fb4, 0x3fd6, 0x3ff9, 0x4002, 0x400a, 0x4012, 0x401a];
  const ceips = [...new Set(ww.map((w) => w.cseip))];
  let relocBase = -1;
  for (const ce of ceips) for (const so of storeOffsets) {
    const b = ce - so; let m = 0;
    for (const c2 of ceips) for (const s2 of storeOffsets) if (c2 === b + s2) m++;
    if (m >= 2) { relocBase = b; break; }
  }
  console.log(relocBase >= 0 ? `recovered relocBase = 0x${relocBase.toString(16)} (ovlBase 0x${ovlBase().toString(16)})` : 'could not recover relocBase');
}

/**
 * move — DEMONSTRATE dungeon movement via the harness (the unblock).
 *
 * The dungeon movement keys are the ARROW KEYS (matching the on-screen "TURN ←/→"
 * + "↑" widget), NOT ENTER (ENTER = "PRESS RETURN FOR OPTIONS" = the main menu):
 *   left  -> turn left  (facing -1 mod 4)
 *   right -> turn right (facing +1 mod 4)
 *   up    -> step forward (blocked by a wall ahead -> no-op)
 *   down  -> NOT a movement key in the dungeon view (no-op; Wiz6 has no back-step;
 *            to reverse, turn 180 [right x2] then step forward).
 * A turn ALWAYS rebuilds the span list + redraws the viewport (parity flips); a
 * forward step only moves when the cell ahead is open. The prior `reach` recipe's
 * "boxed at the gate" was a DEAD-END POCKET (a 3-cell stub x5<->6<->7 with walls
 * on both ends) compounded by using ENTER (= OPTIONS) for "forward" and never
 * trying the arrows for turns. The arrows work fine; turns + a forward step both
 * rebuild the span list.
 *
 * Loads the committed corridor fixture (tools/libretro/states/maze-corridor.state),
 * prints before/after party fields (facing/x/gx/gy/parity/span-count) per key,
 * and serializes a turned-left frame to maze-corridor-turn-left.state.
 * Usage: pnpm tsx tools/libretro/trace-maze.ts move [statePath]
 */
async function phaseMove(c: HostClient): Promise<void> {
  const { resolve } = await import('node:path');
  const STATE = resolve(process.argv[3] ?? 'tools/libretro/states/maze-corridor.state');
  const TURN_LEFT_OUT = resolve('tools/libretro/states/maze-corridor-turn-left.state');
  const u16 = async (base: number, off: number) => { const b = await c.read(base + off, 2); return b[0]! | (b[1]! << 8); };
  const restore = async () => { await c.unserialize(STATE); await c.step(2); return c.anchor(); };
  const snap = async (base: number) =>
    `facing=${await u16(base, 0x4f9a)} x=${await u16(base, 0x4f9e)} gx=${await u16(base, 0x4fa4)} ` +
    `gy=${await u16(base, 0x4fa2)} parity=${await u16(base, 0x521a)} spans=${await u16(base, 0x50ce)}`;

  await c.step(3000); // boot so unserialize has a running game
  const base = await restore();
  console.log(`corridor fixture: ${STATE}`);
  console.log(`base=0x${base.toString(16)}\n`);

  const moves: Array<[string, string]> = [
    ['turn left  (key left)', 'left'],
    ['turn right (key right)', 'right'],
    ['step fwd   (key up)', 'up'],
    ['down (NOT a move key)', 'down'],
  ];
  for (const [label, key] of moves) {
    const b = await restore();
    const before = await snap(b);
    await c.key(key, 'tap'); await c.step(40);
    const after = await snap(b);
    const changed = before !== after;
    console.log(`${label}`);
    console.log(`   before: ${before}`);
    console.log(`   after : ${after}   ${changed ? '<== CHANGED' : '(no-op)'}`);
  }

  // Reverse-traverse demo: turn 180 (right x2) then step forward returns toward
  // the start cell (Wiz6 has no back-step key).
  {
    const b = await restore();
    console.log(`\nreverse via 180+fwd:`);
    console.log(`   start : ${await snap(b)}`);
    await c.key('up', 'tap'); await c.step(40);
    console.log(`   fwd   : ${await snap(b)}`);
    await c.key('right', 'tap'); await c.step(40); await c.key('right', 'tap'); await c.step(40);
    console.log(`   180   : ${await snap(b)}`);
    await c.key('up', 'tap'); await c.step(40);
    console.log(`   fwd   : ${await snap(b)}   <== returned to the start cell`);
  }

  // Serialize a turned-left frame as a second corridor fixture for the renderer.
  const b = await restore();
  await c.key('left', 'tap'); await c.step(40);
  await c.serialize(TURN_LEFT_OUT);
  console.log(`\nserialized turned-left frame -> ${TURN_LEFT_OUT}  (${await snap(b)})`);
}

// ===========================================================================
// FIRST-RENDER CAPTURE HARNESS (deliverable: deterministic transient-state grab)
// ---------------------------------------------------------------------------
// The maze background OR-blit (ega.drv entry-15 FUN_0a93) + its placement
// (cs:[0x190]) / image-descriptor (cs:[0x18e]) tables + per-image source
// work-buffers are TRANSIENT: built per-render from a RELOCATED copy of ega.drv
// at a heap-dependent CS, gone by frame boundary. A fixed file-offset breakpoint
// logs 0 hits (the in-image copy at 0x6acdd never executes). These phases beat
// that by (1) RESOLVING the relocated base PER RUN from a live write into the
// compose page (the OR plane-0 store + its 3 plane siblings = a unique cluster),
// then (2) arming capture-on-breakpoint at the resolved OR-blit during the FIRST
// render (state 4->5) to snapshot the tables + source work-buffers at fire time.
//
// OR-store plane offsets within ega.drv (file): plane0 0xb31, plane1 0xb45,
// plane2 0xb5c, plane3 0xb75 (the `lodsb; or al,es:[di]; stosb` cluster). The
// OR-blit entry (dispatch entry 15) is file 0xa93. The per-row inner-loop entry
// (cx,si,di,ds,bp ready) is file 0xb2c. Reloc base = plane0-store-cseip - 0xb31.
// ===========================================================================

const OR_PLANE_STORES = [0xb31, 0xb45, 0xb5c, 0xb75]; // ega.drv file offsets
const OR_ENTRY_FILE = 0xa93;   // dispatch entry 15 (FUN_0a93)
const OR_ROW_FILE = 0xb2c;     // per-row inner-loop entry (push cx; cx=copyWidth)
const COMPOSE_PAGE = 0x41820;  // off-screen 4-plane page (cs:[0x14d] seg 0x4182)
const PS = 0x2000;             // page plane stride
const ROWB2 = 40;              // page row stride (320px)

/** Drive a fresh boot to the dungeon entry, STOPPING right before the final
 *  ENTER that triggers the state-4->5 first render. Leaves the game one ENTER
 *  away from the first dungeon render so a caller can arm watches/traces. */
async function driveToDungeonEntry(c: HostClient): Promise<void> {
  await c.step(3000);
  await c.key('enter', 'tap'); await c.step(800);
  for (let i = 0; i < 3; i++) {
    await c.key('enter', 'tap'); await c.step(60);
    await c.key('enter', 'tap'); await c.step(60);
    await c.key('up', 'tap'); await c.key('up', 'tap'); await c.key('up', 'tap'); await c.step(60);
  }
  await c.key('down', 'tap'); await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(60);
  await c.key('enter', 'tap'); await c.step(200); // START NEW GAME
  await c.key('enter', 'tap'); await c.step(200); // scenario pick
  // NOT the final ENTER — caller fires the first render.
}

/** Recover the relocated OR-blit base from a set of compose-page writer cseips by
 *  finding the OR plane-0 store's unique 4-sibling cluster (plane stores at
 *  base+0xb31/+0xb45/+0xb5c/+0xb75). Returns -1 if no cluster. */
function recoverOrBase(writers: Map<number, number>): number {
  const ceset = new Set(writers.keys());
  for (const ce of ceset) {
    const b = ce - OR_PLANE_STORES[0]!;
    let sib = 0;
    for (const d of OR_PLANE_STORES.slice(1)) if (ceset.has(b + d)) sib++;
    if (sib >= 2) return b;
  }
  return -1;
}

/** Write-watch the compose page over `action`, returning per-cseip write counts
 *  (drained incrementally so the 4096 ring never evicts the OR stores). */
async function watchComposePage(c: HostClient, action: () => Promise<void>): Promise<Map<number, number>> {
  const writers = new Map<number, number>();
  await c.wwatchSet(COMPOSE_PAGE, COMPOSE_PAGE + 0x8000);
  const drain = async () => { for (const w of await c.wwatchDrain()) writers.set(w.cseip, (writers.get(w.cseip) ?? 0) + 1); };
  // The action drives input; we interleave step+drain so the ring (4096) never
  // evicts the (relatively sparse) OR stores under the wall-store flood.
  await action();
  for (let i = 0; i < 60; i++) { await c.step(6); await drain(); }
  await c.wwatchSet(0, 0);
  return writers;
}

/** RESOLVE the relocated OR-blit base PER RUN by write-watching the compose page
 *  during the FIRST render (state 4->5) and recovering the OR-store cluster.
 *  Drives boot->first render INTERNALLY (consuming the transition) so it proves
 *  the resolved address hits the genuine FIRST-render OR-blit, not a replay. */
async function resolveOrBaseFirstRender(c: HostClient): Promise<{ base: number; writers: Map<number, number> }> {
  await driveToDungeonEntry(c);
  const writers = await watchComposePage(c, async () => { await c.key('enter', 'tap'); }); // fire state 4->5
  return { base: recoverOrBase(writers), writers };
}

/** RESOLVE the base from a settled CLEAN_STATE forceRedraw recompose (the
 *  reproducible replay path the capture uses). Heap-dependent → re-derive here. */
async function resolveOrBaseReplay(c: HostClient): Promise<number> {
  return resolveOrBaseReplayState(c, CLEAN_STATE);
}

/** Same as resolveOrBaseReplay but against an explicit serialize-state path. The
 *  `inPlace` variant turns left/right (redraw without moving) so a frame whose
 *  forward cell differs (e.g. gy=120 standing one behind the target) still
 *  resolves on the CURRENT view rather than walking off it. */
async function resolveOrBaseReplayState(c: HostClient, state: string, inPlace = false): Promise<number> {
  await c.unserialize(state); await c.step(2);
  const writers = inPlace
    ? await watchComposePage(c, async () => { await c.key('left', 'tap'); await c.step(40); await c.key('right', 'tap'); })
    // Forward arrival: a held FORWARD_KEY that is RELEASED (down/settle/up)
    // reliably walks one cell + drives the full recompose. FORWARD_KEY is ENTER
    // for the legacy scripted-entry CLEAN_STATE, UP for free-roam origin states.
    : await watchComposePage(c, async () => { await c.key(FORWARD_KEY, 'down'); await c.step(24); await c.key(FORWARD_KEY, 'up'); });
  await c.key(FORWARD_KEY, 'up');
  return recoverOrBase(writers);
}

/** `resolve` — the RUNTIME-ADDRESS RESOLVER (deliverable 1). Drives boot->first
 *  render, recovers the relocated OR-blit base from the compose-page write
 *  cluster, then VERIFIES the resolved OR-blit entry actually HITS during a
 *  re-render (CLEAN_STATE forceRedraw replay on the same session). */
async function phaseResolve(c: HostClient): Promise<void> {
  const { base, writers } = await resolveOrBaseFirstRender(c);
  if (base < 0) {
    console.log('FAILED to resolve OR-blit base (no plane-store cluster in compose-page writes)');
    console.log('top writers:', [...writers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `0x${k.toString(16)}:${v}`).join(' '));
    return;
  }
  const entry = base + OR_ENTRY_FILE;
  console.log(`resolved relocated ega.drv base = 0x${base.toString(16)} (OR-blit entry 0x${entry.toString(16)}, plane-0 store 0x${(base + 0xb31).toString(16)})`);
  console.log(`compose-page writers: ${writers.size} distinct cseips`);
  // serialize this first-rendered frame so we can verify the entry hits on replay.
  await c.serialize(CLEAN_STATE);
  await c.fb(CLEAN_PNG);
  // VERIFY: arm a trace on the resolved entry + force a re-render, count hits.
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(entry); await c.traceDrain();
  await forceRedraw(c);
  const recs = await c.traceDrain(); await c.traceOff();
  console.log(`VERIFY: OR-blit entry 0x${entry.toString(16)} hits over a re-render = ${recs.length}`);
  if (recs.length > 0) {
    const r = recs[0]!;
    console.log(`  first hit: cs=0x${r.cs.toString(16)} ip=0x${r.eip.toString(16)} (cs<<4+ip=0x${((r.cs << 4) + r.eip).toString(16)}) ds=0x${r.ds.toString(16)} es=0x${r.es.toString(16)}`);
    console.log(recs.length >= 20 ? 'RESOLVER HEALTHY ✓ (OR-blit reliably hits at the resolved address)' : 'WARN: few hits — re-render may not have run the full OR-blit pass');
  } else {
    console.log('RESOLVER: entry did NOT hit on replay — base may be stale across the serialize/unserialize boundary');
  }
  writeFileSync('/tmp/wiz6-orbase.txt', base.toString(16));
}

interface FirstRenderRowRec { ds: number; si: number; di: number; cx: number; bp: number; ss: number; }

/** `firstrender` — the DETERMINISTIC FIRST-RENDER CAPTURE HARNESS (deliverable 2).
 *  Drives a fresh boot to the dungeon FIRST render (state 4->5), resolves the
 *  relocated OR-blit base, then captures the transient maze-background state at
 *  fire time:
 *    (a) the cs-relative table pointers (cs:[0x149] dataSeg, cs:[0x14d] pageSeg,
 *        cs:[0x18e] imgDescOff, cs:[0x190] placementOff)
 *    (b) the PLACEMENT table (cs:[0x190], 5B recs) + IMAGE-DESCRIPTOR table
 *        (cs:[0x18e], 5B recs)  — Gap B's geometry-keyed placement records
 *    (c) per-placed-image SOURCE WORK-BUFFER snapshots (the EXPANDER OUTPUT) at
 *        each image's first OR store, with its (w,h,cx,si,di,planeStride)
 *    (d) the EXPANDER INPUT/OUTPUT pair: who WRITES the source work-buffer just
 *        before the OR-blit reads it (write-watch on the first image's source
 *        segment during the render) — Gap A's record->work-buffer transform.
 *    (e) the engine background-only compose page (last OR plane-0 store)
 *  All written to a fixture dir as JSON + raw .bin so Gap A/B passes can crack
 *  from data. The capture works because the OR-blit runs as a FULL recompose at
 *  the first render and (re)runs on a forceRedraw replay of the serialized frame.
 *
 *  Usage: pnpm tsx tools/libretro/trace-maze.ts firstrender [outDir] */
async function phaseFirstRender(c: HostClient): Promise<void> {
  const outDir = process.argv[3] ?? '/tmp/wiz6-firstrender';
  const { mkdirSync } = await import('node:fs');
  mkdirSync(outDir, { recursive: true });

  // CLEAN_STATE = the settled-at-gate first-rendered corridor frame (gy=118; Gap A
  // is geometry-independent, Gap B generalizes). It replays the OR-blit
  // DETERMINISTICALLY on a forceRedraw (unlike a right-at-entry serialize, which
  // is heap-layout-fragile). Build it via `reach` if absent.
  if (!existsSync(CLEAN_STATE)) {
    console.log('CLEAN_STATE absent — driving `reach` to build it…');
    await driveToMaze(c);
    await c.serialize(CLEAN_STATE); await c.fb(CLEAN_PNG);
  }
  // PROVE the resolver hits the genuine FIRST render (state 4->5) on THIS core
  // build, in a fresh session, before relying on the replay path.
  {
    const c0 = new HostClient();
    try {
      const { base: frBase } = await resolveOrBaseFirstRender(c0);
      console.log(frBase >= 0
        ? `FIRST-render resolver: OR-blit base=0x${frBase.toString(16)} (entry 0x${(frBase + OR_ENTRY_FILE).toString(16)}) — the state-4->5 OR-blit was caught ✓`
        : 'FIRST-render resolver: no OR-store cluster (the OR-blit did not fire at first render this run)');
    } finally { c0.close(); }
  }

  // --- Resolve the base PER RUN from the reproducible replay recompose. ---
  const base = await resolveOrBaseReplay(c);
  if (base < 0) { console.log('FAILED to resolve OR-blit base from replay — abort'); return; }
  const entry = base + OR_ENTRY_FILE;
  const rowPt = base + OR_ROW_FILE;
  const orP0 = base + 0xb31;
  console.log(`reloc base=0x${base.toString(16)} entry=0x${entry.toString(16)} row=0x${rowPt.toString(16)} orP0=0x${orP0.toString(16)}`);

  // The relocated ega.drv runs at a CS whose segment base (cs<<4) is NOT `base`
  // (base is the FILE-offset linear base: base+0xa93 == entry). The OR-blit reads
  // its table pointers as cs:[0x149] etc. — literal offsets into the cs SEGMENT.
  // Capture the live cs at the entry fire to compute the segment base robustly.
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(entry); await c.traceDrain();
  await forceRedraw(c);
  const er = await c.traceDrain(); await c.traceOff();
  if (!er.length) { console.log('OR-blit entry did not fire on replay — abort'); return; }
  const segBase = er[0]!.cs << 4; // cs<<4: literal-offset base for cs:[off] reads
  console.log(`relocated cs=0x${er[0]!.cs.toString(16)} segBase(cs<<4)=0x${segBase.toString(16)}`);

  // (a) capture the cs-relative table pointers at the OR-blit entry first fire.
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(entry); await c.captureSet(segBase + 0x140, 0x60, 0);
  await forceRedraw(c);
  const ptrs = await c.captureGet(); await c.traceOff();
  if (!ptrs) { console.log('table-pointer capture failed (entry did not fire on replay)'); return; }
  const at = (o: number) => u16(ptrs, o - 0x140);
  const dataSeg = at(0x149), pageSeg = at(0x14d), imgDescOff = at(0x18e), placeOff = at(0x190);
  console.log(`cs:[0x149] dataSeg=0x${dataSeg.toString(16)} cs:[0x14d] pageSeg=0x${pageSeg.toString(16)} cs:[0x18e] imgDescOff=0x${imgDescOff.toString(16)} cs:[0x190] placeOff=0x${placeOff.toString(16)}`);

  // (b) capture the PLACEMENT + IMAGE-DESCRIPTOR tables at entry fire.
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(entry); await c.captureSet((dataSeg << 4) + placeOff, 0x800, 0);
  await forceRedraw(c);
  const placeTbl = (await c.captureGet())!; await c.traceOff();
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(entry); await c.captureSet((dataSeg << 4) + imgDescOff, 0x400, 0);
  await forceRedraw(c);
  const imgTbl = (await c.captureGet())!; await c.traceOff();
  const placements = [];
  for (let k = 0; k < 0x800 / 5; k++) {
    const o = k * 5;
    const rec = { imgIdx: placeTbl[o]!, destX: placeTbl[o + 1]!, destRow: placeTbl[o + 2]!, bias: placeTbl[o + 3]!, count: placeTbl[o + 4]! };
    placements.push(rec);
  }
  const imgDescs = [];
  for (let k = 0; k < 0x400 / 5; k++) {
    const o = k * 5;
    imgDescs.push({ segDelta: u16(imgTbl, o), srcOff: u16(imgTbl, o + 2), w: imgTbl[o + 4]! });
  }

  // (c) per-row walk capture over ONE recompose pass -> group into images and
  //     snapshot each image's SOURCE work buffer (the EXPANDER OUTPUT).
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(rowPt); await c.traceDrain();
  const rows: FirstRenderRowRec[] = [];
  await c.key('enter', 'down');
  for (let i = 0; i < 14; i++) { await c.step(4); for (const r of await c.traceDrain()) rows.push({ ds: r.ds, si: r.esi & 0xffff, di: r.edi & 0xffff, cx: r.ecx & 0xffff, bp: r.ebp & 0xffff, ss: r.ss }); if (i === 10) await c.key('enter', 'up'); }
  await c.key('enter', 'up'); await c.traceOff();
  // isolate pass 1.
  const fd = rows[0]!.di, fs = rows[0]!.ds;
  let endIdx = rows.length;
  for (let i = 1; i < rows.length; i++) if (rows[i]!.di === fd && rows[i]!.ds === fs) { endIdx = i; break; }
  const pass1 = rows.slice(0, endIdx);
  console.log(`OR rows captured=${rows.length}, pass1=${pass1.length}`);
  // group contiguous rows into placed images.
  interface Img { ds: number; rows: FirstRenderRowRec[]; startIdx: number; w: number; planeStride: number; }
  const imgs: Img[] = []; let cur: Img | null = null;
  for (let k = 0; k < pass1.length; k++) {
    const r = pass1[k]!; const prev = cur && cur.rows.length ? cur.rows[cur.rows.length - 1]! : null;
    const contig = cur && prev && r.ds === cur.ds && (r.di - prev.di) === ROWB2 && (r.si - prev.si) > 0;
    if (!contig) { if (cur) imgs.push(cur); cur = { ds: r.ds, rows: [r], startIdx: k, w: 0, planeStride: 0 }; }
    else cur!.rows.push(r);
  }
  if (cur) imgs.push(cur);
  console.log(`pass1 grouped into ${imgs.length} placed images`);
  // per-image w + planeStride (its first store), then source snapshot.
  const fixImages: Array<Record<string, number>> = [];
  for (let gi = 0; gi < imgs.length; gi++) {
    const im = imgs[gi]!; const r = im.rows[0]!;
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(rowPt); await c.captureSet((r.ss << 4) + ((r.bp - 8) & 0xffff), 0x10, im.startIdx);
    await forceRedraw(c); const win = (await c.captureGet())!; await c.traceOff();
    im.w = u16(win, 2); im.planeStride = u16(win, 6);
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(rowPt); await c.captureSet(im.ds << 4, 0x4000, im.startIdx);
    await forceRedraw(c); const src = (await c.captureGet())!; await c.traceOff();
    // slice the bytes this image reads (the EXPANDER OUTPUT region).
    const need = r.si + 3 * im.planeStride + (im.rows.length - 1) * im.w + r.cx;
    const slice = src.subarray(0, Math.min(src.length, Math.max(need, r.si + 4 * im.planeStride)));
    writeFileSync(`${outDir}/wb-${gi}.bin`, Buffer.from(slice));
    fixImages.push({ gi, ds: im.ds, si: r.si, di: r.di, cx: r.cx, w: im.w, h: im.rows.length, planeStride: im.planeStride, srcLen: slice.length });
  }

  // (d) EXPANDER I/O. On the settled REPLAY path the source work buffers are
  //     already resident (the OR-blit reads them verbatim) — so the per-image
  //     wb-*.bin captures above ARE the clean expander OUTPUT (the decompressed
  //     4-plane planar sub-images). The record->work-buffer EXPAND itself only
  //     runs at the genuine FIRST render (the work buffer is re-decoded per
  //     group). So we locate the expander by write-watching the work-buffer heap
  //     region during a FRESH first render (separate session) — recording the
  //     writers (cseip + dest span) for the next pass to walk. The expander
  //     INPUT (the on-disk floor/ceiling record) is loaded by the DOS file-read
  //     path (BIOS cs=f000) into a load buffer in the same window.
  const exp: Record<string, unknown> = {
    note: 'expander = who fills the OR-blit source work buffer at FIRST render; on the replay path the buffer is already resident (wb-*.bin = clean expander OUTPUT). Writers below are the first-render candidates to walk for Gap A.',
  };
  {
    const cE = new HostClient();
    try {
      await driveToDungeonEntry(cE);
      // Watch the low-mid heap (work buffers + load buffer) during first render,
      // EXCLUDING the compose page (0x41820) which floods with OR/wall stores.
      const WB_LO = 0x20000, WB_HI = 0x40000;
      await cE.wwatchSet(WB_LO, WB_HI);
      await cE.key('enter', 'tap'); // fire first render
      const wWriters = new Map<number, { count: number; min: number; max: number }>();
      for (let i = 0; i < 60; i++) { await cE.step(6); for (const w of await cE.wwatchDrain()) { const e = wWriters.get(w.cseip) ?? { count: 0, min: w.addr, max: w.addr }; e.count++; e.min = Math.min(e.min, w.addr); e.max = Math.max(e.max, w.addr); wWriters.set(w.cseip, e); } }
      await cE.wwatchSet(0, 0);
      // Rank by dest SPAN (a decompressor sweeps a wide contiguous range), then count.
      const ranked = [...wWriters.entries()].map(([ce, e]) => ({ ce, ...e, span: e.max - e.min }))
        .sort((a, b) => (b.span - a.span) || (b.count - a.count)).slice(0, 12);
      exp.first_render_writers = ranked.map((w) => ({ cseip: w.ce.toString(16), count: w.count, destSpan: `0x${w.min.toString(16)}..0x${w.max.toString(16)}`, span: `0x${w.span.toString(16)}`, seg: (w.ce >>> 4).toString(16) }));
      console.log(`EXPANDER first-render write-watch (heap 0x${WB_LO.toString(16)}..0x${WB_HI.toString(16)}), ${wWriters.size} writers, top by dest-span:`);
      for (const w of (exp.first_render_writers as Array<Record<string, unknown>>)) console.log(`  cseip=0x${w.cseip} x${w.count} dest ${w.destSpan} (span ${w.span})`);
    } finally { cE.close(); }
  }

  // (e) engine background-only page (last OR plane-0 store of pass1).
  const orStores = pass1.reduce((a, r) => a + r.cx, 0);
  const bg = new Uint8Array(0x8000);
  for (let p = 0; p < 4; p++) {
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(orP0); await c.captureSet(COMPOSE_PAGE + p * PS, PS, orStores - 1);
    await forceRedraw(c); bg.set((await c.captureGet())!.subarray(0, PS), p * PS); await c.traceOff();
  }
  writeFileSync(`${outDir}/bg.bin`, Buffer.from(bg));

  // --- dump the fixture metadata. ---
  const meta = {
    note: 'first-render maze background capture (Gap A expander I/O + Gap B placement records)',
    reloc_base: base.toString(16),
    or_blit_entry: entry.toString(16),
    table_pointers: { dataSeg: dataSeg.toString(16), pageSeg: pageSeg.toString(16), imgDescOff: imgDescOff.toString(16), placeOff: placeOff.toString(16) },
    pass1_rows: pass1.length,
    placements: placements.slice(0, 40),
    image_descriptors: imgDescs.slice(0, 24),
    placed_images: fixImages,
    expander: exp,
    or_stores_pass1: orStores,
  };
  writeFileSync(`${outDir}/meta.json`, JSON.stringify(meta, null, 2));
  console.log(`\nfixture -> ${outDir}/ (meta.json + ${fixImages.length} wb-*.bin + bg.bin)`);
  console.log(`placements[0..5]: ${placements.slice(0, 6).map((p) => `img${p.imgIdx}@(${p.destX},${p.destRow})b${p.bias}c${p.count}`).join(' ')}`);
  console.log(`image-descs[0..3]: ${imgDescs.slice(0, 4).map((d) => `seg+0x${d.segDelta.toString(16)}/off0x${d.srcOff.toString(16)}/w${d.w}`).join(' ')}`);
}

/** `firstcheck` — REPRODUCIBILITY GATE (deliverable 3). Runs the firstrender
 *  capture TWICE (two fresh boots, two outDirs) and byte-diffs the placement
 *  table, image-descriptor table, the per-image source work-buffers (expander
 *  output) and the background page. Confirms the captures are stable across
 *  runs. */
async function phaseFirstCheck(c: HostClient): Promise<void> {
  const { mkdirSync, readFileSync: rf } = await import('node:fs');
  const dirA = '/tmp/wiz6-firstrender-a', dirB = '/tmp/wiz6-firstrender-b';
  // Run A in this session.
  process.argv[3] = dirA;
  await phaseFirstRender(c);
  c.close();
  // Run B in a FRESH session (fresh boot/heap).
  const c2 = new HostClient();
  try { process.argv[3] = dirB; await phaseFirstRender(c2); } finally { c2.close(); }

  mkdirSync('/tmp/wiz6-firstcheck', { recursive: true });
  const cmp = (name: string, a: Buffer, b: Buffer) => {
    if (a.length !== b.length) { console.log(`  ${name}: LENGTH DIFFERS (${a.length} vs ${b.length})`); return; }
    let diff = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
    console.log(`  ${name}: ${a.length - diff}/${a.length} bytes equal ${diff === 0 ? '✓ reproducible' : `(${diff} differ)`}`);
  };
  const ma = JSON.parse(rf(`${dirA}/meta.json`, 'utf8'));
  const mb = JSON.parse(rf(`${dirB}/meta.json`, 'utf8'));
  console.log(`\n=== REPRODUCIBILITY (run A ${dirA} vs run B ${dirB}) ===`);
  console.log(`  reloc_base: A=0x${ma.reloc_base} B=0x${mb.reloc_base} (heap-dependent; per-run resolve is the point)`);
  console.log(`  placements equal: ${JSON.stringify(ma.placements) === JSON.stringify(mb.placements) ? '✓' : 'DIFFER'}`);
  console.log(`  image_descriptors equal: ${JSON.stringify(ma.image_descriptors) === JSON.stringify(mb.image_descriptors) ? '✓' : 'DIFFER'}`);
  console.log(`  placed_images count: A=${ma.placed_images.length} B=${mb.placed_images.length}`);
  cmp('bg.bin', rf(`${dirA}/bg.bin`), rf(`${dirB}/bg.bin`));
  const n = Math.min(ma.placed_images.length, mb.placed_images.length);
  for (let gi = 0; gi < n; gi++) {
    try { cmp(`wb-${gi}.bin (expander output)`, rf(`${dirA}/wb-${gi}.bin`), rf(`${dirB}/wb-${gi}.bin`)); } catch { /* missing */ }
  }
}

/** `placements` — GAP B (b1): capture the ORDERED placement-INDEX list the engine
 *  emits at the OR-blit for the maze-corridor frame, over a COMPLETE single
 *  recompose pass (deterministic, reproducible).
 *
 *  The OR-blit (ega.drv FUN_0a93, file 0xa93) is called ONCE PER PLACEMENT. Its
 *  arg [bp+0xc] is the placement index into cs:[0x190] (asm 0x0aaa:
 *  `mov bx,[bp+0xc]; mov ax,5; mul bx; add ax,cs:[0x190]; mov si,ax`). The je at
 *  0x0aa4 (when [bp+0x10]==0xffff) routes to 0x0aa9->0x0aaa->0x0aad — so any
 *  execution reaching file 0x0aad is the OR branch; the non-OR branch jumps away
 *  at 0x0aa6. We trace at 0x0aad (snapshot taken BEFORE the instruction) where
 *  ebx already holds the placement index.
 *
 *  Completeness: a forceRedraw runs N identical recompose passes. We collect a
 *  generous run of hits, then extract ONE FULL PASS as the maximal cycle that
 *  repeats (the index sequence between two occurrences of the pass start). The
 *  pass is the deterministic per-view placement-index list.
 *
 *  Usage: pnpm tsx tools/libretro/trace-maze.ts placements [outFile] */
/** `maskedloop` — INNER-LOOP capture of the masked-mirror branch (ega.drv 0xbc6).
 *  For the FIRST few masked calls of the first compose pass, capture per-outer-row
 *  the live register state at 0xc5f (si=siBase, di=di0, cx=[bp-4] per-row count,
 *  ds=source seg) so we can pin the EXACT per-row source start / count / direction
 *  the engine uses — and snapshot the dest page region before+after each call so we
 *  can read the actual bytes the masked write produces (ground truth, not a guess).
 *  Usage: pnpm tsx tools/libretro/trace-maze.ts maskedloop [maxCalls=4] */
async function phaseMaskedLoop(c: HostClient): Promise<void> {
  const maxCalls = Number(process.argv[3] ?? 4);
  if (!existsSync(CLEAN_STATE)) {
    console.log('CLEAN_STATE absent — driving `reach` to build it…');
    await driveToMaze(c);
    await c.serialize(CLEAN_STATE); await c.fb(CLEAN_PNG);
  }
  const base = await resolveOrBaseReplay(c);
  if (base < 0) { console.log('FAILED to resolve OR-blit base — abort'); return; }
  const rowPt = base + 0xc5f;   // per-outer-row, plane0 start: si/di/cx/ds set
  const COMPOSE_PAGE = 0x41820; // cs:[0x14d] seg 0x4182
  const PSx = 0x2000;
  console.log(`reloc base=0x${base.toString(16)} rowPt=0x${rowPt.toString(16)}`);

  // 1) Snapshot per-outer-row register state across the whole settled redraw.
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(rowPt); await c.traceDrain();
  const recs: TraceRecord[] = [];
  await c.key('enter', 'down');
  for (let i = 0; i < 22; i++) { await c.step(4); for (const r of await c.traceDrain()) recs.push(r); if (i === 16) await c.key('enter', 'up'); }
  await c.key('enter', 'up'); await c.traceOff();
  console.log(`per-row hits over redraw: ${recs.length}`);

  // 2) Group consecutive rows into calls: a new call starts when di jumps back up
  //    (di of row0 < di of prev row's last). Simpler: detect runs where di
  //    increases by 0x28 each row; a break = new call.
  // [bp+0xe] flag (OR-merge vs REPLACE) per row-hit: stack[ (0xe)/2 ] relative to bp.
  // stack[] in TraceRecord is words from esp upward; bp = esp + (frame). Simpler:
  // read it from the live stack via ss:bp+0xe. We re-capture per call below; here
  // approximate from the trace's stack array if available.
  interface RowRec { si: number; di: number; cx: number; ds: number; es: number; bp: number; ss: number; }
  const rows: RowRec[] = recs.map((r) => ({ si: r.esi & 0xffff, di: r.edi & 0xffff, cx: r.ecx & 0xffff, ds: r.ds, es: r.es, bp: r.ebp & 0xffff, ss: r.ss }));
  const calls: RowRec[][] = [];
  let cur: RowRec[] = [];
  for (const rr of rows) {
    if (cur.length && rr.di !== (cur[cur.length - 1]!.di + 0x28)) { calls.push(cur); cur = []; }
    cur.push(rr);
  }
  if (cur.length) calls.push(cur);
  console.log(`grouped into ${calls.length} call-runs (by di+0x28 continuity)`);

  // 3) Decode EVERY call-run into (di0, si0, ds, cx, rows). Capture [bp+0xe] flag at
  //    each call's FIRST row-hit (skip = cumulative hit index of that first row).
  const dump: Array<Record<string, unknown>> = [];
  let hitIdx = 0;
  for (let k = 0; k < calls.length; k++) {
    const run = calls[k]!;
    const r0 = run[0]!;
    // capture [bp+0xe] at this call's first row-hit.
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(rowPt); await c.captureSet((r0.ss << 4) + ((r0.bp + 0xe) & 0xffff), 2, hitIdx);
    await c.key('enter', 'down');
    let flagW: Uint8Array | null = null;
    for (let i = 0; i < 22; i++) { await c.step(4); const w = await c.captureGet(); if (w) { flagW = w; break; } if (i === 16) await c.key('enter', 'up'); }
    await c.key('enter', 'up'); await c.traceOff();
    const flag = flagW ? u16(flagW, 0) : -1;
    dump.push({ call: k, rows: run.length, cx: r0.cx, ds: r0.ds, di0: r0.di, si0: r0.si, flag });
    hitIdx += run.length;
  }
  for (let k = 0; k < Math.min(maxCalls, calls.length); k++) {
    const run = calls[k]!; const r0 = run[0]!; const cx = r0.cx;
    const lo = Math.max(0, r0.si - cx - 2);
    const len = (r0.si + 3) - lo + 1;
    const srcBytes = await readRowSrc(c, base, k, (r0.ds << 4) + lo, len);
    console.log(`\ncall#${k}: rows=${run.length} cx=${cx} ds=0x${r0.ds.toString(16)} si0=0x${r0.si.toString(16)} di0=0x${r0.di.toString(16)}`);
    if (srcBytes) console.log(`  src[ds:0x${lo.toString(16)}..] = ${[...srcBytes].map((b) => b.toString(16).padStart(2, '0')).join(' ')}  (si idx ${r0.si - lo})`);
  }

  // 4) Capture the engine's FINAL settled background page (after a clean redraw) so
  //    we have the byte-exact dest oracle for each masked call's region.
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await forceRedraw(c);
  const pageOut: Uint8Array[] = [];
  for (let p = 0; p < 4; p++) pageOut.push((await c.read(COMPOSE_PAGE + p * PSx, PSx)) ?? new Uint8Array(PSx));
  const pageFlat = new Uint8Array(4 * PSx);
  for (let p = 0; p < 4; p++) pageFlat.set(pageOut[p]!, p * PSx);
  writeFileSync('/tmp/wiz6-masked-page.bin', Buffer.from(pageFlat));
  writeFileSync('/tmp/wiz6-masked-loop.json', JSON.stringify(dump, null, 2));
  console.log(`\nengine background page -> /tmp/wiz6-masked-page.bin (4*0x2000)`);
  console.log(`call dump -> /tmp/wiz6-masked-loop.json`);
}

/** Read `len` source bytes at physical `phys` at the k-th masked-call fire. */
async function readRowSrc(c: HostClient, base: number, k: number, phys: number, len: number): Promise<Uint8Array | null> {
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(base + 0xc5f); await c.captureSet(phys, len, 0);
  await c.key('enter', 'down');
  let out: Uint8Array | null = null;
  for (let i = 0; i < 22; i++) { await c.step(4); const w = await c.captureGet(); if (w) { out = w; break; } if (i === 16) await c.key('enter', 'up'); }
  await c.key('enter', 'up'); await c.traceOff();
  return out;
}

// Overridable capture state for phasePlacements (set by `placements121`). The
// resolver + traceAll below all key off this; default is the settled gy=118
// CLEAN_STATE built by `reach`.
let PLACEMENTS_STATE = CLEAN_STATE;
// When true, the capture forces an IN-PLACE redraw (turn left then right, back to
// the original facing/cell) instead of a forward step. Needed for gy=121: a
// forward forceRedraw would walk the party off the captured cell mid-trace.
let PLACEMENTS_INPLACE = false;
// When set, phasePlacements grabs the framebuffer FROM THE SAME compose it traced
// (one final unserialize(PLACEMENTS_STATE) + the identical trigger + c.fb), writing
// raw RGBA to this path. This is the frame-sync fix: the call-list and framebuffer
// are then byte-for-byte the result of the SAME settled compose, not two drives.
let PLACEMENTS_FB_OUT: string | null = null;

async function phasePlacements(c: HostClient): Promise<void> {
  const outFile = process.argv[3] ?? '/tmp/wiz6-placements.json';
  const CLEAN_STATE = PLACEMENTS_STATE; // shadow so all reads use the override
  if (!existsSync(CLEAN_STATE)) {
    console.log('CLEAN_STATE absent — driving `reach` to build it…');
    await driveToMaze(c);
    await c.serialize(CLEAN_STATE); await c.fb(CLEAN_PNG);
  }
  // Resolve the OR-blit base IN-PLACE (turn left/right) — the base is
  // frame-independent, and in-place resolution avoids walking the party off a
  // capture cell whose forward neighbour differs (gy=120 standing one behind).
  let base = process.env.WIZ6_ORBASE ? parseInt(process.env.WIZ6_ORBASE, 16) : -1;
  if (base < 0) base = await resolveOrBaseReplayState(c, CLEAN_STATE, true);
  if (base < 0) base = await resolveOrBaseReplayState(c, CLEAN_STATE, false);
  if (base < 0) { console.log('FAILED to resolve OR-blit base from replay — abort'); return; }
  const entry = base + 0xa93;
  // The blit (FUN_0a93) has TWO branches keyed by arg [bp+0x10]:
  //   arg10 == 0xffff  -> OR branch (file 0xaa9..): single-image OR-blit of
  //                       placement [bp+0xc] into the page (forward read).
  //   arg10 != 0xffff  -> MASKED branch (file 0xbc6..): a two-index, xlatb-LUT,
  //                       REVERSE-read blit — arg10 is the placement (dest geom),
  //                       [bp+0xc] is the source image; OR-merge or REPLACE per
  //                       [bp+0xe]. This is the horizontally-mirrored right-half
  //                       (and some left) pieces. Both branches WRITE the page, so
  //                       a from-asset compose needs BOTH.
  //
  // To capture the interleaved call list deterministically (held-ENTER runs N
  // identical passes), trace three points over the SAME redraw:
  //   0x0aa1 (`cmp ax,0xffff`): eax = arg10 for EVERY call (both branches) — the
  //                             ordered branch/arg10 sequence.
  //   0x0aad (OR branch):       ebx = arg0c for OR calls, in order.
  //   0x0bca (masked branch):   ebx = arg0c for masked calls, in order.
  // Reconstruct by walking the 0xaa1 sequence, consuming OR/masked arg0c in turn.
  const cmpPt = base + 0xaa1;
  const orArgPt = base + 0xaad;
  const mArgPt = base + 0xbca;
  console.log(`reloc base=0x${base.toString(16)} cmp=0x${cmpPt.toString(16)} OR-arg=0x${orArgPt.toString(16)} masked-arg=0x${mArgPt.toString(16)}`);

  // The SETTLED maze-corridor frame (CLEAN_STATE) recomposes FULLY on the first
  // forceRedraw frame, then does dirty-only PARTIAL redraws. The FULL first compose
  // is the complete background. Trace each branch point ALONE over the settled
  // forceRedraw: at 0xaad (OR) and 0xbca (masked) the snapshot has eax=arg10 AND
  // ebx=arg0c. The cmp point (0xaa1) gives arg10 for EVERY call -> the interleave
  // order. Take the FIRST compose pass = the prefix before the OR head recurs.
  const traceAll = async (pt: number): Promise<TraceRecord[]> => {
    await c.unserialize(CLEAN_STATE); await c.step(2);
    if (PLACEMENTS_INPLACE) {
      // In-place: turn left (redraw at facing-3), settle, drain (discard), THEN
      // arm the trace and turn right (redraw back at the ORIGINAL facing/cell).
      await c.key('left', 'tap'); await c.step(40);
      await c.traceSet(pt); await c.traceDrain();
      const out: TraceRecord[] = [];
      await c.key('right', 'tap');
      for (let i = 0; i < 16; i++) { await c.step(4); for (const r of await c.traceDrain()) out.push(r); }
      await c.traceOff();
      return out;
    }
    await c.traceSet(pt); await c.traceDrain();
    const out: TraceRecord[] = [];
    await c.key(FORWARD_KEY, 'down');
    for (let i = 0; i < 22; i++) { await c.step(4); for (const r of await c.traceDrain()) out.push(r); if (i === 16) await c.key(FORWARD_KEY, 'up'); }
    await c.key(FORWARD_KEY, 'up'); await c.traceOff();
    return out;
  };

  // FRAME-SYNC: replay the IDENTICAL recompose trigger on the IDENTICAL state with
  // NO trace armed, then SETTLE and grab the framebuffer. Because the state +
  // trigger match traceAll exactly (and the compose is deterministic), this
  // framebuffer is the rendered result of the call-list traced below — same frame.
  const grabSyncedFb = async (out: string): Promise<void> => {
    await c.unserialize(CLEAN_STATE); await c.step(2);
    if (PLACEMENTS_INPLACE) {
      await c.key('left', 'tap'); await c.step(40);
      await c.key('right', 'tap'); await c.step(80);
    } else {
      await c.key(FORWARD_KEY, 'down'); await c.step(24);
      await c.key(FORWARD_KEY, 'up'); await c.step(80);
    }
    await c.fb(out);
  };

  // Capture the live table pointers + tables at the OR-blit entry fire (settled).
  const segBaseHolder: { dataSeg: number; placeOff: number; imgDescOff: number; placeTbl: Uint8Array | null; descTbl: Uint8Array | null } = { dataSeg: 0, placeOff: 0, imgDescOff: 0, placeTbl: null, descTbl: null };
  {
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(entry); await c.traceDrain();
    await forceRedraw(c);
    const er = await c.traceDrain(); await c.traceOff();
    if (er.length) {
      const segBase = er[0]!.cs << 4;
      await c.unserialize(CLEAN_STATE); await c.step(2);
      await c.traceSet(entry); await c.captureSet(segBase + 0x140, 0x60, 0);
      await forceRedraw(c);
      const ptrs = await c.captureGet(); await c.traceOff();
      if (ptrs) {
        segBaseHolder.dataSeg = u16(ptrs, 0x149 - 0x140);
        segBaseHolder.placeOff = u16(ptrs, 0x190 - 0x140);
        segBaseHolder.imgDescOff = u16(ptrs, 0x18e - 0x140);
        await c.unserialize(CLEAN_STATE); await c.step(2);
        await c.traceSet(entry); await c.captureSet((segBaseHolder.dataSeg << 4) + segBaseHolder.placeOff, 0x800, 0);
        await forceRedraw(c); segBaseHolder.placeTbl = await c.captureGet(); await c.traceOff();
        await c.unserialize(CLEAN_STATE); await c.step(2);
        await c.traceSet(entry); await c.captureSet((segBaseHolder.dataSeg << 4) + segBaseHolder.imgDescOff, 0x400, 0);
        await forceRedraw(c); segBaseHolder.descTbl = await c.captureGet(); await c.traceOff();
      }
    }
  }

  interface Call { branch: 'OR' | 'masked'; arg0c: number; arg10: number; orFlag?: number }
  const cmpRecs = await traceAll(cmpPt);
  const orRecs = await traceAll(orArgPt);
  const mRecs = await traceAll(mArgPt);
  // Per-masked-call [bp+0xe] flag (OR-merge vs REPLACE). Trace 0xbca (masked entry,
  // bp set), capture the stack word [bp+0xe] per masked-call skip index.
  const mFlags: number[] = [];
  for (let k = 0; k < mRecs.length; k++) {
    const r = mRecs[k]!;
    await c.unserialize(CLEAN_STATE); await c.step(2);
    if (PLACEMENTS_INPLACE) {
      await c.key('left', 'tap'); await c.step(40);
      await c.traceSet(mArgPt); await c.captureSet((r.ss << 4) + ((r.ebp + 0xe) & 0xffff), 2, k);
      await c.key('right', 'tap'); await c.step(40);
    } else {
      await c.traceSet(mArgPt); await c.captureSet((r.ss << 4) + ((r.ebp + 0xe) & 0xffff), 2, k);
      await forceRedraw(c);
    }
    const w = await c.captureGet(); await c.traceOff();
    mFlags.push(w ? u16(w, 0) : -1);
  }
  console.log(`masked flags (first ${Math.min(30, mFlags.length)}): [${mFlags.slice(0, 30).join(',')}]`);
  // masked branch [bp+0xe] (OR-merge vs REPLACE flag): captured at 0xc5f where
  // `cmp [bp+0xe],0` runs. ds/si there point at the LUT — grab xlatb LUT too.
  const mFlagRecs = await traceAll(base + 0xc5f);
  console.log(`settled redraw hits: cmp=${cmpRecs.length}, OR=${orRecs.length}, masked=${mRecs.length}, mFlag=${mFlagRecs.length}`);
  if (cmpRecs.length === 0) { console.log('no blit hits — abort'); return; }
  // Capture the xlatb LUT (CS:[0x192], 256 bytes — the `cs: xlatb` at 0xc69 uses a
  // CS segment override) at the first masked-blit fire. segBase = cs<<4.
  let lut: Uint8Array | null = null;
  if (mFlagRecs.length) {
    const fr = mFlagRecs[0]!;
    const segBase = fr.cs << 4;
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(base + 0xc5f); await c.captureSet(segBase + 0x192, 0x100, 0);
    await forceRedraw(c); lut = await c.captureGet(); await c.traceOff();
    const r = mFlagRecs[0]!;
    await c.unserialize(CLEAN_STATE); await c.step(2);
    await c.traceSet(base + 0xc5f); await c.captureSet((r.ss << 4) + ((r.ebp + 0xe) & 0xffff), 2, 0);
    await forceRedraw(c); const fw = await c.captureGet(); await c.traceOff();
    const flag = fw ? u16(fw, 0) : -1;
    const isIdentity = lut ? lut.every((b, i) => b === i) : false;
    console.log(`masked [bp+0xe] flag=${flag} (0=REPLACE, !=0 OR-merge); LUT identity=${isIdentity}; LUT[0..15]=${lut ? [...lut.subarray(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join(' ') : 'n/a'}`);
    if (lut) writeFileSync('/tmp/wiz6-maze-xlat-lut.bin', Buffer.from(lut));
  }

  // Reconstruct the FULL interleaved sequence; take the FIRST COMPOSE PASS = the
  // prefix before the OR head recurs (the dirty partial-redraws follow).
  const allCalls: Call[] = [];
  let oi = 0, mi = 0;
  for (const r of cmpRecs) {
    const a10 = r.eax & 0xffff;
    if (a10 === 0xffff) { const rr = orRecs[oi++]; allCalls.push({ branch: 'OR', arg0c: (rr?.ebx ?? -1) & 0xffff, arg10: (rr?.eax ?? a10) & 0xffff }); }
    else { const rr = mRecs[mi++]; allCalls.push({ branch: 'masked', arg0c: (rr?.ebx ?? -1) & 0xffff, arg10: a10 }); }
  }
  const eq = (a: Call, b: Call) => a.branch === b.branch && a.arg0c === b.arg0c && a.arg10 === b.arg10;
  let firstPassLen = allCalls.length;
  let passStart = 0;
  // ROBUST periodic-pass detector (runs first). The settled recompose emits the
  // FULL first pass = an optional leading prefix (the near pieces the FIRST pass
  // draws) + a periodic block that repeats once per dirty redraw, then a trailing
  // run of malformed 0xffff calls (arg under-run mid-build) that must be excluded.
  // Detect the period on the per-call SIGNATURE `branch:arg0c:arg10`, over the
  // VALID prefix (arg0c < 366 — a real placement index). The smallest period that
  // (a) covers the whole valid prefix periodically and (b) is NOT a degenerate
  // single repeated element is the true pass. We pick the period maximizing
  // coverage (reps*p) so a corridor's repeated ceiling strip can't masquerade as a
  // period-1 pass.
  {
    const sig = (cc: Call): string => `${cc.branch}:${cc.arg0c}:${cc.arg10}`;
    let validLen = 0;
    while (validLen < allCalls.length && allCalls[validLen]!.arg0c < 366) validLen++;
    if (validLen >= 6) {
      let bestP = 0, bestCover = 0, bestStart = 0;
      for (let p = 1; p <= validLen >> 1; p++) {
        for (let s = 0; s <= Math.min(validLen - 2 * p, 12); s++) {
          // Reject degenerate periods where the candidate block is a single value
          // repeated (e.g. p>1 but all p elements identical) — those aren't a pass.
          const blockSigs = new Set<string>();
          for (let k = 0; k < p; k++) blockSigs.add(sig(allCalls[s + k]!));
          // Count consecutive full periods matching at s (both blocks must fully fit).
          let reps = 0, ok = true;
          while (ok && s + (reps + 2) * p <= validLen) {
            for (let k = 0; k < p; k++) {
              if (sig(allCalls[s + reps * p + k]!) !== sig(allCalls[s + (reps + 1) * p + k]!)) { ok = false; break; }
            }
            if (ok) reps++;
          }
          // A real pass has p>=2 distinct sigs (or p==1 with reps covering all) and
          // repeats >=2x. Prefer the period with the LARGEST coverage; on a tie the
          // SMALLER period wins (the fundamental period, not a multiple).
          const cover = reps * p;
          const isReal = reps >= 2 && (p === 1 ? blockSigs.size === 1 : blockSigs.size >= 2);
          if (isReal && (cover > bestCover || (cover === bestCover && p < bestP))) {
            bestCover = cover; bestP = p; bestStart = s;
          }
        }
      }
      if (bestCover > 0 && bestP > 0) {
        passStart = 0;
        firstPassLen = bestStart + bestP;
      }
    }
  }
  // PRIMARY pass boundary (legacy): the first OR call and its next recurrence (the
  // OR-head heuristic — proven exact for open/corridor views whose OR-head is the
  // ceiling strip 122). Start AT the first OR so a leading masked fragment is dropped.
  if (firstPassLen === allCalls.length) {
    const firstOr = allCalls.findIndex((cc) => cc.branch === 'OR');
    if (firstOr >= 0) {
      const head = allCalls[firstOr]!;
      passStart = firstOr;
      for (let p = firstOr + 1; p < allCalls.length; p++) if (allCalls[p]!.branch === 'OR' && eq(allCalls[p]!, head)) { firstPassLen = p - firstOr; break; }
    }
  }
  // FALLBACK (blocked-front / heavily-masked views where the OR-head recurs only a
  // full cycle later, e.g. all 6 OR top-strips are contiguous): use the DOMINANT
  // consecutive gap between repeats of the FIRST captured call. NOTE: for such views
  // the masked src->dst PAIRING + order oscillate run-to-run (mid-build); only the
  // placement-index SET, the OR list, and the pass LENGTH are deterministic.
  if (firstPassLen === allCalls.length) {
    const head = allCalls[0];
    if (head) {
      const recurs: number[] = [0];
      for (let i = 1; i < allCalls.length; i++) if (eq(allCalls[i]!, head)) recurs.push(i);
      const counts = new Map<number, number>();
      for (let i = 1; i < recurs.length; i++) { const g = recurs[i]! - recurs[i - 1]!; counts.set(g, (counts.get(g) ?? 0) + 1); }
      let bestG = 0, bestC = -1;
      for (const [g, ct] of counts) if (ct > bestC) { bestC = ct; bestG = g; }
      if (bestG > 0 && recurs.length >= 2) { firstPassLen = bestG; passStart = recurs[0]!; }
    }
  }
  const passCalls = allCalls.slice(passStart, passStart + firstPassLen);
  const orPass = passCalls.filter((cc) => cc.branch === 'OR');
  const mPass = passCalls.filter((cc) => cc.branch === 'masked');
  const pass = passCalls.map((cc) => cc.arg0c);
  console.log(`first compose pass = ${passCalls.length} blit calls (${orPass.length} OR, ${mPass.length} masked)`);
  console.log(`masked: [${mPass.map((cc) => `${cc.arg0c}->${cc.arg10}`).join(', ')}]`);
  console.log(`OR: [${orPass.map((cc) => cc.arg0c).join(', ')}]`);
  const reproducible = firstPassLen < allCalls.length;

  // Dump the LIVE placement + descriptor records for each index, to compare to the
  // offline expander (mazedata.ega). Read from the captured live tables. Include
  // BOTH the OR/masked SOURCE indices (`pass` = arg0c) AND the masked DEST indices
  // (arg10) — the masked dst supplies the mirror GEOMETRY, so recording it lets a
  // downstream check verify the mirror law src.destX + dst.destX + dst.w == 40
  // (the masked-mirror branch geometry) without re-deriving dst from mazedata.ega.
  const liveRecs: Array<Record<string, number>> = [];
  const pt = segBaseHolder.placeTbl, dt = segBaseHolder.descTbl;
  if (pt && dt) {
    const recIndices = new Set<number>(pass);
    for (const cc of mPass) recIndices.add(cc.arg10); // masked DST geometry indices
    for (const idx of [...recIndices].sort((a, b) => a - b)) {
      const po = idx * 5;
      const imgIdx = pt[po]!;
      const do2 = imgIdx * 5;
      liveRecs.push({ idx, imgIdx, destX: pt[po + 1]!, destRow: pt[po + 2]!, bias: pt[po + 3]!, count: pt[po + 4]!, segDelta: u16(dt, do2), srcOffLow: dt[do2 + 2]!, w: dt[do2 + 3]!, h: dt[do2 + 4]! });
    }
    console.log('live placement records (idx -> {imgIdx,destX,destRow,bias,count} desc{segDelta,srcOffLow,w,h}):');
    for (const r of liveRecs.slice(0, 8)) console.log(`  ${r.idx}: img${r.imgIdx}@(${r.destX},${r.destRow}) b${r.bias} c${r.count}  seg+0x${r.segDelta.toString(16)}/off0x${r.srcOffLow.toString(16)}/w${r.w}/h${r.h}`);
    // Verify the masked-mirror geometry law for every masked call we captured.
    for (const cc of mPass) {
      const sp = liveRecs.find((r) => r.idx === cc.arg0c);
      const dp = liveRecs.find((r) => r.idx === cc.arg10);
      if (sp && dp) {
        const sum = sp.destX! + dp.destX! + dp.w!;
        console.log(`  masked ${cc.arg0c}->${cc.arg10}: srcX${sp.destX}+dstX${dp.destX}+w${dp.w}=${sum} ${sum === 40 ? 'mirror-law-OK' : 'MIRROR-LAW-MISMATCH'}`);
      }
    }
  }

  // FRAME-SYNC framebuffer grab: same state + same trigger as the trace above.
  if (PLACEMENTS_FB_OUT) {
    await grabSyncedFb(PLACEMENTS_FB_OUT);
    console.log(`frame-synced framebuffer -> ${PLACEMENTS_FB_OUT} (same compose as the traced call-list)`);
  }

  writeFileSync(outFile, JSON.stringify({
    note: 'maze-corridor (zone0, facing0) blit call list — first full compose pass at ega.drv FUN_0a93. OR branch (arg10==ffff) = single-image forward OR-blit of placement arg0c. masked branch (arg10!=ffff) = xlatb-LUT reverse-read blit, dest=placement arg10, src image=placement arg0c. Static placement records live in mazedata.ega (366). This is the per-view SELECTION + the masked-mirror pairing.',
    reloc_base: base.toString(16),
    frame: { game_state: 5, zone: 0, facing: 0, name: 'maze-corridor' },
    total_hits: cmpRecs.length,
    pass_length: passCalls.length,
    reproducible,
    placementIndices: pass,
    calls: passCalls.map((cc) => ({ branch: cc.branch, arg0c: cc.arg0c, arg10: cc.arg10 })),
    masked_flags: mFlags,
    table_pointers: { dataSeg: segBaseHolder.dataSeg.toString(16), placeOff: segBaseHolder.placeOff.toString(16), imgDescOff: segBaseHolder.imgDescOff.toString(16) },
    liveRecords: liveRecs,
    raw_calls: allCalls.map((cc) => ({ branch: cc.branch, arg0c: cc.arg0c, arg10: cc.arg10 })),
  }, null, 2));
  console.log(`\n-> ${outFile}`);
}

/** `placements121` — capture the blit call list for the gy=121 ORACLE frame (the
 *  committed maze-corridor.idx.gz perspective), which `reach`/`placements` cannot
 *  reach (a fresh drive settles at gy=118, at the gate). gy=121 is 3 cells forward
 *  of gy=118 (the door is at gy=123, so 118->119->120->121 walks freely). This
 *  drives a fresh boot to gy=118, force-redraws forward to gy=121 (verifying the
 *  party each step), serializes a gy=121 clean state, then captures the call list
 *  there via phasePlacements (state-overridden). */
async function phasePlacements121(c: HostClient): Promise<void> {
  const STATE121 = '/tmp/wiz6-maze-clean-121.state';
  const outFile = process.argv[3] ?? '/tmp/wiz6-placements-121.json';
  const rdU16 = async (base: number, off: number) => { const b = await c.read(base + off, 2); return b[0]! | (b[1]! << 8); };
  console.log('driving fresh boot to maze (gy=118)…');
  await driveToMaze(c);
  let base = await c.anchor();
  let gy = await rdU16(base, 0x4fa2);
  let gx = await rdU16(base, 0x4fa4);
  let facing = await rdU16(base, 0x4f9a);
  console.log(`settled: gx=${gx} gy=${gy} facing=${facing}`);
  // Walk forward until gy=120 (ONE cell BEHIND the target), then serialize. The
  // capture step is a forward forceRedraw 120->121 — stepping INTO gy=121 forces
  // a COMPLETE (non-dirty) redraw of the gy=121 view, which the in-place turn or a
  // settled re-redraw does not (those do partial/dirty redraws that drop the
  // deepest door piece). So the gy=120 state + a forward step is the clean
  // full-compose capture of gy=121.
  const TARGET = Number(process.env.WIZ6_PLACE121_STOP ?? '121');
  for (let i = 0; i < 40 && gy < TARGET; i++) {
    await forceRedraw(c);
    base = await c.anchor();
    gy = await rdU16(base, 0x4fa2);
    gx = await rdU16(base, 0x4fa4);
    facing = await rdU16(base, 0x4f9a);
    console.log(`  step ${i + 1}: gx=${gx} gy=${gy} facing=${facing}`);
  }
  if (gy !== TARGET || facing !== 0) {
    console.log(`FAILED to reach gy=${TARGET} facing=0 (got gy=${gy} facing=${facing}) — abort`);
    return;
  }
  await c.serialize(STATE121);
  await c.fb('/tmp/wiz6-maze-clean-121.fb');
  console.log(`serialized gy=${gy} clean frame -> ${STATE121}`);
  // Capture the call list. With WIZ6_PLACE121_INPLACE=0 + STOP=120, the trace's
  // forward step walks 120->121 = a FULL (non-dirty) recompose of gy=121.
  PLACEMENTS_STATE = STATE121;
  PLACEMENTS_INPLACE = process.env.WIZ6_PLACE121_INPLACE !== '0';
  process.argv[3] = outFile;
  await phasePlacements(c);
}

// Party DGROUP fields (poke targets) — same as probe-maze-poke.ts.
const PK_FACING = 0x4f9a, PK_Z = 0x4f9c, PK_CELLA = 0x4f9e, PK_CELLB = 0x4fa0, PK_GY = 0x4fa2, PK_GX = 0x4fa4;
// Forward (gx,gy) delta per facing (classify findings): f0=+gy, f1=+gx, f2=-gy, f3=-gx.
const FWD_GXGY: Array<[number, number]> = [[0, 1], [1, 0], [0, -1], [-1, 0]];

// ===========================================================================
// FREE-ROAM NAVIGATION (the turn-unlock — primary deliverable).
// ---------------------------------------------------------------------------
// THE UNLOCK (proven by tools/libretro/probe-freeroam-turn.ts):
//   The START-NEW-GAME entry has two input modes inside game_state=5
//   (maze-entry-sequence.json): (B) scripted gate-walk — ENTER-only, steps gy
//   118->121, ARROWS NO-OP; (C) free-roam — ARROWS turn/step. The handoff from
//   B to C does NOT happen merely on reaching gy=121 (the 'HMMMM' front-wall
//   bump leaves the scripted walker still holding control). It completes after
//   ~5-6 MORE ENTERs DRAIN the walker. The reliable unlock detector: keep
//   pressing ENTER and after each, test a LEFT tap — when facing 0x4f9a changes
//   (f0->f3), the walker has released and free-roam ARROWS work. Confirmed:
//   LEFT cycles 0->3->2->1->0, RIGHT 0->1->2->3->0, UP steps when the cell
//   ahead is open (gy121 f0->forward gy122; f3->gx126; f1->gx126->127). This is
//   the SAME core that cannot unserialize the nightly-minted maze-corridor.state
//   (err unser), so a free-roam frame is reached by COLD-BOOT + this unlock, not
//   by loading a committed state.
// ===========================================================================

/** Press ENTER (held-tap) — the scripted-walk forward / drain key. */
async function frEnter(c: HostClient): Promise<void> {
  await c.key('enter', 'down'); await c.step(24); await c.key('enter', 'up'); await c.step(70);
}

/** Read the live party (game_state, facing, gx, gy, span count). */
async function frParty(c: HostClient, base: number) {
  const rd = async (off: number) => u16(await c.read(base + off, 2), 0);
  return { gs: await rd(0x363a), f: await rd(PK_FACING), gx: await rd(PK_GX), gy: await rd(PK_GY), sp: await rd(0x50ce) };
}

/** Cold-boot to the dungeon and UNLOCK free-roam (drain the scripted walker).
 *  Returns the DGROUP base, leaving the party at gx127 gy121 facing0 in TRUE
 *  free-roam (arrows verified working). Throws if the unlock can't be reached. */
async function driveToFreeRoam(c: HostClient): Promise<number> {
  await c.step(3000);
  await c.key('enter', 'tap'); await c.step(800); // title -> MASTER OPTIONS
  for (let i = 0; i < 3; i++) {
    await c.key('enter', 'tap'); await c.step(60);
    await c.key('enter', 'tap'); await c.step(60);
    await c.key('up', 'tap'); await c.key('up', 'tap'); await c.key('up', 'tap'); await c.step(60);
  }
  await c.key('down', 'tap'); await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(60);
  await c.key('enter', 'tap'); await c.step(200); // START NEW GAME
  await c.key('enter', 'tap'); await c.step(200); // scenario
  await c.key('enter', 'tap'); await c.step(400); // -> dungeon (mode B)
  let base = await c.anchor();
  // mode B: ENTER-walk to gy>=121 (the front-wall bump frame).
  for (let i = 0; i < 25; i++) {
    const p = await frParty(c, base);
    if (p.gs !== 5) throw new Error(`encounter/menu (game_state=${p.gs}) during entry walk`);
    if (p.gy >= 121) break;
    await frEnter(c);
  }
  // unlock: drain the walker with ENTERs until a LEFT tap rotates facing. The
  // probing LEFT itself turns the party; we then turn back RIGHT to leave a clean
  // facing-0 free-roam frame. The drain count is mildly non-deterministic
  // (observed 6..>14 across runs), so use a generous budget.
  for (let i = 0; i < 30; i++) {
    await frEnter(c);
    const fb = await frParty(c, base);
    await c.key('left', 'tap'); await c.step(50);
    const fa = await frParty(c, base);
    if (fa.f !== fb.f) {
      await c.key('right', 'tap'); await c.step(50); // back to facing 0
      const p = await frParty(c, base);
      if (p.f !== 0) throw new Error(`unlock left facing=${p.f} (expected 0 after left+right)`);
      return base;
    }
  }
  throw new Error('free-roam unlock failed (scripted walker never released after 30 drain-ENTERs)');
}

/** Drive a single free-roam move (verified). Returns true if it took effect. */
async function frMove(c: HostClient, base: number, key: 'left' | 'right' | 'up'): Promise<boolean> {
  const b = await frParty(c, base);
  await c.key(key, 'tap'); await c.step(45);
  const a = await frParty(c, base);
  return a.f !== b.f || a.gx !== b.gx || a.gy !== b.gy;
}

/** Replay a movement.ts key-PATH (left/right/forward) live in free-roam, verifying
 *  each move took. forward maps to `up`. Aborts (throws) on an encounter. */
async function frDrivePath(c: HostClient, base: number, path: string[]): Promise<void> {
  for (const mv of path) {
    const key = mv === 'forward' ? 'up' : (mv as 'left' | 'right');
    const p0 = await frParty(c, base);
    if (p0.gs !== 5) throw new Error(`encounter (game_state=${p0.gs}) mid-path`);
    const took = await frMove(c, base, key);
    if (!took && mv === 'forward') throw new Error(`forward step blocked at gx${p0.gx} gy${p0.gy} f${p0.f} (path divergence)`);
  }
}

/**
 * `freeroam` — DRIVE the engine to an arbitrary (gx,gy,facing) view via REAL
 * collision-gated moves (the turn-unlock applied), capture the engine framebuffer
 * AND the full background blit call-list there, on a genuine BUILD-LOOP-rerun
 * frame (a forward step into the target = a complete recompose).
 *
 * Unlike `pokeview` (which POKES coords + does an in-place DIRTY recompose that
 * replays a cached span list — wrong placement selection per navreach), this
 * NAVIGATES via the validated movement.ts path, so the build loop genuinely runs
 * for the target view. We drive to the cell ONE step behind the target along its
 * forward axis (the "origin"), serialize that PATCHED-CORE-NATIVE state (it
 * unserializes fine — same core), then capture the call-list via phasePlacements'
 * forward-step path (PLACEMENTS_INPLACE=false → full recompose of the target).
 *
 * Usage: pnpm tsx tools/libretro/trace-maze.ts freeroam <gx> <gy> <facing> [outDir]
 */
async function phaseFreeRoam(c: HostClient): Promise<void> {
  const { loadLevel0, pathTo, ENGINE_ENTRANCE } = await import('../parity/maze-view-cases.js');
  const { COMPOSED_PALETTE, SCREEN_WIDTH, SCREEN_HEIGHT } = await import('../parity/decode-screen.js');
  const { encodePngRgba } = await import('../../packages/cli/src/lib/png.js');
  const gx = Number(process.argv[3]), gy = Number(process.argv[4]), facing = Number(process.argv[5]);
  const outDir = process.argv[6] ?? '/tmp/wiz6-freeroam';
  if (![gx, gy, facing].every(Number.isFinite)) { console.log('usage: freeroam <gx> <gy> <facing> [outDir]'); return; }
  mkdirSync(outDir, { recursive: true });
  const tag = `gx${gx}-gy${gy}-f${facing}`;

  const rgbToIdx = new Map<number, number>();
  COMPOSED_PALETTE.forEach((rgb: readonly number[], i: number) => rgbToIdx.set(((rgb[0]! << 16) | (rgb[1]! << 8) | rgb[2]!) >>> 0, i));
  const rgbaToIdx = (rgba: Uint8Array): Uint8Array | null => {
    const idx = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);
    for (let p = 0; p < idx.length; p++) {
      const i = rgbToIdx.get(((rgba[p * 4]! << 16) | (rgba[p * 4 + 1]! << 8) | rgba[p * 4 + 2]!) >>> 0);
      if (i === undefined) return null;
      idx[p] = i;
    }
    return idx;
  };

  // Plan the real-move path offline (movement.ts collision rules). We capture from a
  // single SETTLED state via one trigger so the call-list + framebuffer are the same
  // compose. PREFERRED: drive to the ORIGIN (one cell behind the target on its
  // forward axis), then a FULL forward-step recompose lands on the target — and the
  // framebuffer is grabbed from THAT SAME origin state + forward step (the prior bug
  // grabbed it from a *separate* target drive). FALLBACK (origin unreachable): an
  // in-place turn recompose at the settled target (dirty; may drop the deepest piece).
  const { block } = loadLevel0();
  const [dgx, dgy] = FWD_GXGY[facing]!;
  const target = { gx, gy, facing };
  const origin = { gx: gx - dgx, gy: gy - dgy, facing };
  const pathToTarget = pathTo(block, ENGINE_ENTRANCE, target);
  const pathToOrigin = pathTo(block, ENGINE_ENTRANCE, origin);
  console.log(`freeroam target ${tag}; entrance=(gx${ENGINE_ENTRANCE.gx},gy${ENGINE_ENTRANCE.gy},f${ENGINE_ENTRANCE.facing})`);
  console.log(`  path->target: ${pathToTarget ? `[${pathToTarget.join(',')}]` : 'UNREACHABLE'}`);
  console.log(`  origin (one behind)=(gx${origin.gx},gy${origin.gy},f${facing}); path->origin: ${pathToOrigin ? `[${pathToOrigin.join(',')}]` : 'UNREACHABLE'}`);
  if (!pathToTarget) { console.log('target unreachable under movement.ts — abort'); return; }

  // UNLOCK ONCE, serialize the entrance free-roam frame (PATCHED-CORE-NATIVE, so
  // it round-trips on this core), then drive each capture from an unserialize of
  // that frame — avoids a fragile second cold-boot unlock per session.
  const base = await driveToFreeRoam(c);
  console.log(`unlocked free-roam: ${JSON.stringify(await frParty(c, base))}`);
  const entranceState = `${outDir}/freeroam-entrance.state`;
  await c.serialize(entranceState);
  const fromEntrance = async (path: string[]): Promise<number> => {
    await c.unserialize(entranceState); await c.step(2);
    const b = await c.anchor();
    await frDrivePath(c, b, path);
    return b;
  };

  // FRAME-SYNC: the call-list and the framebuffer MUST be the result of the SAME
  // settled compose. The prior bug paired a framebuffer grabbed at the settled
  // TARGET (after a real-move drive) with a call-list traced from a SEPARATELY
  // driven ORIGIN forward-step — two different composes (30-52% self-repro). The
  // fix: capture BOTH from ONE serialized state via ONE trigger. phasePlacements
  // traces the call-list AND (via PLACEMENTS_FB_OUT) grabs the framebuffer by
  // re-running the IDENTICAL state+trigger — so they are the same frame.
  //
  // CAPTURE TRIGGER = in-place turn recompose at the SETTLED TARGET. We tested the
  // alternative (drive to ORIGIN one-behind, forward-step into target = full
  // non-dirty recompose): it adds the deepest near pieces BUT the masked-mirror
  // arg0c trace under-runs run-to-run there, injecting 0xffff garbage that breaks
  // pass detection (the findings' "masked pairing oscillates mid-build"). The
  // in-place turn is STABLE (clean periodic pass) and frame-syncs trivially, and on
  // the gate view it actually self-reproduced HIGHER (89% vs 88%). It is a DIRTY
  // recompose that may drop the single deepest sub-pixel door-leaf (<1% of the
  // viewport) — acceptable for the ground-truth gate.
  const tbase = await fromEntrance(pathToTarget);
  const at = await frParty(c, tbase);
  console.log(`arrived: gx${at.gx} gy${at.gy} f${at.f} gs${at.gs} span${at.sp}`);
  if (at.gx !== gx || at.gy !== gy || at.f !== facing) {
    console.log(`POSITION MISMATCH (got gx${at.gx} gy${at.gy} f${at.f}) — abort`); return;
  }
  await c.step(80); // settle the build loop before serializing
  const captureState = `${outDir}/${tag}-capture.state`;
  await c.serialize(captureState);
  console.log(`serialized settled-target capture state -> ${captureState}`);

  const inPlace = true;
  PLACEMENTS_STATE = captureState;
  PLACEMENTS_INPLACE = inPlace;
  // In TRUE free-roam the forward key is UP (ENTER = OPTIONS). Flip so the
  // forward-step OR-base resolution (used by phasePlacements internally) fires.
  const savedForward = FORWARD_KEY;
  FORWARD_KEY = 'up';

  // SELF-REPRO scorer: compose the just-captured call-list and pixel-compare it to
  // the just-captured framebuffer through the same wired path the validator uses.
  // The in-place recompose's masked-vs-OR mix oscillates run-to-run (the findings'
  // mid-build masked instability), so a clean reproducible pass isn't guaranteed on
  // the FIRST try. We RETRY the capture (off the SAME serialized state) up to N
  // times and KEEP the highest-self-repro frame-synced pair — built-in best-of-N.
  const { renderMazeViewport } = await import('../../packages/parser/src/maze/render.js');
  const { loadMazeAssets } = await import('../../packages/parser/src/maze/assets.js');
  const { composeCallList } = await import('../../packages/parser/src/maze/callist.js');
  const { expandMazeData } = await import('../../packages/parser/src/maze/maze-data.js');
  const { MazeBlockSchema, MAZE_VIEWPORT } = await import('../../packages/data/src/index.js');
  const FRAMES = JSON.parse(readFileSync(`${process.cwd()}/tools/parity/fixtures/engine/maze-frames.json`, 'utf8').toString());
  const BLOCK = MazeBlockSchema.parse(FRAMES.mazeBlock);
  const assets = loadMazeAssets();
  const wbForScore = expandMazeData(assets.mazedata);
  const VP = MAZE_VIEWPORT;
  const NPIX = VP.w * VP.h;
  const selfRepro = (callsJson: any, rgba: Uint8Array): number => {
    const idxFull = rgbaToIdx(rgba);
    if (!idxFull) return -1;
    const calls: any[] = [];
    for (const cc of callsJson.calls) {
      if (cc.arg0c >= 366) continue;
      if (cc.branch === 'OR') calls.push({ kind: 'OR', src: cc.arg0c });
      else calls.push({ kind: 'masked', src: cc.arg0c, dst: cc.arg10, mode: 'or' });
    }
    const page = composeCallList(wbForScore, calls);
    const ours = renderMazeViewport(BLOCK, { gx, gy, z: 0, facing }, assets, { page });
    let match = 0;
    for (let r = 0; r < VP.h; r++) for (let col = 0; col < VP.w; col++) {
      const e = idxFull[(VP.y + r) * SCREEN_WIDTH + VP.x + col]!;
      if (ours[r * VP.w + col] === e) match++;
    }
    return match / NPIX;
  };

  const RETRIES = Number(process.env.WIZ6_FREEROAM_RETRIES ?? '5');
  let bestScore = -1;
  let bestCalls: any = null;
  let bestRgba: Uint8Array | null = null;
  const tmpRgba = `${outDir}/${tag}.rgba`;
  const tmpCalls = `${outDir}/${tag}-callist.json`;
  try {
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
      PLACEMENTS_FB_OUT = tmpRgba;
      process.argv[3] = tmpCalls;
      await phasePlacements(c);
      PLACEMENTS_FB_OUT = null;
      if (!existsSync(tmpRgba) || !existsSync(tmpCalls)) { console.log(`  attempt ${attempt}: capture aborted`); continue; }
      const rgba = new Uint8Array(readFileSync(tmpRgba));
      const callsJson = JSON.parse(readFileSync(tmpCalls, 'utf8'));
      const score = selfRepro(callsJson, rgba);
      const nm = callsJson.calls.filter((cc: any) => cc.branch === 'masked').length;
      const no = callsJson.calls.filter((cc: any) => cc.branch === 'OR').length;
      console.log(`  attempt ${attempt}: self-repro ${(100 * score).toFixed(2)}% (${no} OR, ${nm} masked, reproducible=${callsJson.reproducible})`);
      if (score > bestScore) { bestScore = score; bestCalls = callsJson; bestRgba = rgba; }
      if (score >= 0.99) break; // good enough — frame-matched ground truth
    }
  } finally {
    FORWARD_KEY = savedForward;
    PLACEMENTS_FB_OUT = null;
  }

  if (bestRgba && bestCalls) {
    // Write the BEST frame-synced pair: framebuffer (.rgba/.png/.idx.gz) + call-list.
    writeFileSync(tmpRgba, Buffer.from(bestRgba));
    writeFileSync(`${outDir}/${tag}.png`, encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, bestRgba));
    const idx = rgbaToIdx(bestRgba);
    if (idx) {
      writeFileSync(`${outDir}/${tag}.idx.gz`, gzipSync(idx));
      console.log(`BEST framebuffer -> ${tag}.idx.gz + .png (self-repro ${(100 * bestScore).toFixed(2)}%, ${new Set(idx).size} palette indices)`);
    } else {
      console.log(`framebuffer -> ${tag}.png ONLY (non-WIZ6_MAIN colour — transition/narration frame)`);
    }
    bestCalls.target = { gx, gy, facing };
    bestCalls.capture = 'in-place turn recompose at SETTLED TARGET; framebuffer grabbed from the SAME state+trigger (frame-synced; best-of-N by self-repro)';
    bestCalls.self_repro = bestScore;
    bestCalls.path_to_target = pathToTarget;
    writeFileSync(tmpCalls, JSON.stringify(bestCalls, null, 2));
    console.log(`call-list -> ${tmpCalls} (best self-repro ${(100 * bestScore).toFixed(2)}%)`);
  } else {
    console.log('WARN: no usable capture across all retries');
  }
}

/** `pokeview` — capture a FULL-recompose blit call list for an ARBITRARY (gx,gy,
 *  facing) view. The full (non-dirty) recompose only fires when the party STEPS
 *  INTO a cell. So: poke the party ONE cell BACK along the forward axis (target -
 *  forward_delta), serialize that "origin" state, then let phasePlacements capture
 *  via a forward step (PLACEMENTS_INPLACE=false) — the forward `up` walks origin->
 *  target = a complete recompose of the TARGET view. Region-0 mapping: cellA=gy-116,
 *  cellB=gx-120 (poke per the target's region bases; default region 0).
 *
 *  Usage: pnpm tsx tools/libretro/trace-maze.ts pokeview <gx> <gy> <facing> [outFile] [gxBase=120] [gyBase=116] */
async function phasePokeView(c: HostClient): Promise<void> {
  const gx = Number(process.argv[3]);
  const gy = Number(process.argv[4]);
  const facing = Number(process.argv[5]);
  const outFile = process.argv[6] ?? `/tmp/wiz6-pokeview-${gx}-${gy}-f${facing}.json`;
  const gxBase = Number(process.argv[7] ?? 120);
  const gyBase = Number(process.argv[8] ?? 116);
  const z = 0;
  if (!Number.isFinite(gx) || !Number.isFinite(gy) || !Number.isFinite(facing)) {
    console.log('usage: pokeview <gx> <gy> <facing> [outFile] [gxBase] [gyBase]'); return;
  }
  const STATE = `/tmp/wiz6-pokeview-origin.state`;
  const w16 = async (base: number, off: number, v: number) => c.write(base + off, [v & 0xff, (v >> 8) & 0xff]);
  const rdU16 = async (base: number, off: number) => { const b = await c.read(base + off, 2); return b[0]! | (b[1]! << 8); };

  console.log(`pokeview target gx=${gx} gy=${gy} facing=${facing} (region base gx${gxBase} gy${gyBase})`);
  console.log('driving fresh boot to maze…');
  await driveToMaze(c);

  // Poke DIRECTLY to the target cell, settle, serialize. Capture is an IN-PLACE
  // turn-left/right recompose at the target (the reliable, reproducible trigger —
  // same mechanism placements121 used for gy=121). This is a DIRTY recompose: it
  // emits the full per-view placement list (the SELECTION + dest geometry we are
  // characterizing) but may drop the single deepest sub-pixel door-leaf detail
  // (the known 18px residual). That residual is a sub-placement draw-path gap, NOT
  // a missing placement, so the IN-PLACE list is the correct ground truth for the
  // GENERATION pattern (which placement indices + their dest geometry per view).
  let base = await c.anchor();
  await w16(base, PK_FACING, facing); await w16(base, PK_Z, z);
  await w16(base, PK_CELLA, gy - gyBase); await w16(base, PK_CELLB, gx - gxBase);
  await w16(base, PK_GY, gy); await w16(base, PK_GX, gx);
  await c.step(4); // rebuild from the poked party
  base = await c.anchor();
  const rgx = await rdU16(base, PK_GX), rgy = await rdU16(base, PK_GY), rf = await rdU16(base, PK_FACING);
  const stuck = rgx === gx && rgy === gy && rf === facing;
  console.log(`poked target gx=${gx} gy=${gy} f=${facing} -> readback gx=${rgx} gy=${rgy} f=${rf} ${stuck ? 'STUCK✓' : 'SNAPPED✗ (poke rejected — cell is a wall/void; capture invalid)'}`);
  await c.serialize(STATE);
  await c.fb(`/tmp/wiz6-pokeview-${gx}-${gy}-f${facing}.fb`);

  PLACEMENTS_STATE = STATE;
  PLACEMENTS_INPLACE = true; // in-place turn recompose at the target (reliable)
  process.argv[3] = outFile;
  await phasePlacements(c);

  // Annotate the output with the target info.
  try {
    const j = JSON.parse(readFileSync(outFile, 'utf8'));
    j.target = { gx, gy, facing, gxBase, gyBase, cellA: gy - gyBase, cellB: gx - gxBase };
    j.poke_stuck = stuck;
    j.capture_trigger = 'poke-target + in-place turn recompose (dirty; full placement list, may drop deepest sub-pixel detail)';
    writeFileSync(outFile, JSON.stringify(j, null, 2));
  } catch { /* phasePlacements may have aborted */ }
}

/**
 * `dectrace` — DECORATION EMIT TRACE on a REAL forward MOVE frame (the decisive
 * evidence the write-watch / poke-recompose could not get).
 *
 * The prior `depthemit` pass POKED the party coords into DGROUP then turned
 * left/right to recompose — that DIRTY in-place recompose replays a cached span
 * list WITHOUT re-running the BUILD loop, so the per-cell special4 decoration
 * dispatch never fires. `navreach` proved a GENUINE forward step DOES re-run the
 * build loop (span count [0x50ce] changes). This phase combines the two: cold-boot
 * drive up the gx127 entry corridor (real ENTER forward steps), and at EACH step
 * trap the relocated wmaze emit fns (wall_emit_quad 0x406c / wall_emit_corner
 * 0x45b4) + the ega.drv OR-blit ARG point, reading per-hit the LIVE build depth
 * [0x5040], parity [0x521a], the per-(depth,slot) walltype/shape-code array
 * [0x5220..0x5228], and the emitted placement INDEX.
 *
 * GEOMETRY: the party walks gy118 -> 121 facing NORTH up the gx127 column. The
 * FOUNTAIN column (special4==7 -> shape code 4) is at gx126 (cellB6) gy118..121 —
 * ALONGSIDE the corridor on the LEFT. So as the party steps north the build-loop
 * classify includes the gx126 decoration cell on the LEFT slot, the special4
 * dispatch writes shape code 4 into the left-side walltype slot [0x5226], and the
 * emit fn translates it to a placement index. Trapping the emit on the real move
 * CAPTURES that decoration emit — no turning needed.
 *
 * Usage: pnpm tsx tools/libretro/trace-maze.ts dectrace [outFile]
 */
/**
 * `decwatch` — DECORATION-DRAWPATH write-watch. Drive (free-roam) to a target view
 * whose framebuffer carries a CENTERED decoration sprite the FUN_0a93 OR/masked
 * call-list does NOT reproduce (dead-end gx127 gy123 f0 SWORD/STATUE; gate
 * look-back gx127 gy121 f2 LEAF-GRID). Settle, then write-watch the EXACT
 * off-screen-page byte region those residue pixels map to during an in-place
 * recompose, and tally the WRITER cseips — separating the known relocated FUN_0a93
 * OR-blit stores (orBase + {0xb31,0xb45,0xb5c,0xb75,...}) from ANY OTHER routine
 * that writes the same bytes (the decoration draw-path entry).
 *
 * Page layout: COMPOSE_PAGE (0x41820), 4 EGA planes × 0x2000, 40 bytes/row.
 * Screen pixel (x,y) -> plane byte = y*40 + (x>>3), at plane p offset COMPOSE_PAGE
 * + p*0x2000. The residue bbox is given on the command line as screen coords.
 *
 * Usage: pnpm tsx tools/libretro/trace-maze.ts decwatch <gx> <gy> <facing> <sx0> <sx1> <sy0> <sy1> [out]
 */
async function phaseDecWatch(c: HostClient): Promise<void> {
  const { loadLevel0, pathTo, ENGINE_ENTRANCE } = await import('../parity/maze-view-cases.js');
  const gx = Number(process.argv[3]), gy = Number(process.argv[4]), facing = Number(process.argv[5]);
  const sx0 = Number(process.argv[6]), sx1 = Number(process.argv[7]);
  const sy0 = Number(process.argv[8]), sy1 = Number(process.argv[9]);
  const outFile = process.argv[10] ?? '/tmp/wiz6-decwatch.json';
  if (![gx, gy, facing, sx0, sx1, sy0, sy1].every(Number.isFinite)) {
    console.log('usage: decwatch <gx> <gy> <facing> <sx0> <sx1> <sy0> <sy1> [out]'); return;
  }
  const PS = 0x2000, ROWB = 40;
  const colLo = sx0 >> 3, colHi = sx1 >> 3;
  console.log(`decwatch target gx${gx}gy${gy}f${facing}, residue screen x[${sx0}..${sx1}] y[${sy0}..${sy1}] -> page cols[${colLo}..${colHi}] rows[${sy0}..${sy1}]`);

  // Drive to the target via free-roam (the only reachable path on this core).
  const { block } = loadLevel0();
  const pathToTarget = pathTo(block, ENGINE_ENTRANCE, { gx, gy, facing });
  if (!pathToTarget) { console.log('target unreachable under movement.ts — abort'); return; }
  console.log(`path->target: [${pathToTarget.join(',')}]`);
  const base = await driveToFreeRoam(c);
  const entranceState = `/tmp/wiz6-decwatch-entrance.state`;
  await c.serialize(entranceState);
  await c.unserialize(entranceState); await c.step(2);
  const b = await c.anchor();
  await frDrivePath(c, b, pathToTarget);
  const at = await frParty(c, b);
  console.log(`arrived: gx${at.gx} gy${at.gy} f${at.f} gs${at.gs} span${at.sp}`);
  if (at.gx !== gx || at.gy !== gy || at.f !== facing) { console.log('POSITION MISMATCH — abort'); return; }
  await c.step(80);
  const captureState = `/tmp/wiz6-decwatch-capture.state`;
  await c.serialize(captureState);

  // Resolve the relocated OR-blit base via the compose-page cluster (so we can
  // LABEL FUN_0a93 stores). Use an in-place turn recompose (free-roam UP=forward,
  // so a turn is non-moving). recoverOrBase returns cseip-of-plane0-store - 0xb31.
  FORWARD_KEY = 'up';
  await c.unserialize(captureState); await c.step(2);
  const orWriters = await watchComposePage(c, async () => { await c.key('left', 'tap'); await c.step(40); await c.key('right', 'tap'); });
  const orBase = recoverOrBase(orWriters);
  console.log(`OR-blit base = ${orBase < 0 ? 'NONE' : '0x' + orBase.toString(16)}`);

  // The off-screen page region the residue pixels land in. Watch JUST that region
  // (small) during an in-place recompose so the writer ring never floods.
  const out: any = {
    note: 'decwatch: write-watch the off-screen page bytes the unreproduced decoration sprite lands in; tally writer cseips, separating FUN_0a93 OR-blit stores from the decoration draw-path.',
    target: { gx, gy, facing }, residueScreen: { sx0, sx1, sy0, sy1 },
    orBase: orBase < 0 ? null : orBase.toString(16),
    writers: [] as any[],
  };

  // Watch the RESIDUE sub-region AND a CONTROL sub-region (same rows, a column
  // range with NO sprite — far left of the viewport). A cseip that writes the
  // residue but is ABSENT/rare in the control is the DECORATION draw-path; the
  // OR/masked wall stores hit BOTH equally. SINGLE recompose per pass (one turn),
  // short drain — minimizes idle-redraw noise. Control cols: viewport-left wall.
  const ctlColLo = 9, ctlColHi = 11; // screen x ~72..95 (far-left wall)
  type WMap = Map<number, { count: number; minAddr: number; maxAddr: number; planes: Set<number> }>;
  const tally = (m: WMap, w: { cseip: number; addr: number }, plane: number) => {
    let e = m.get(w.cseip);
    if (!e) { e = { count: 0, minAddr: w.addr, maxAddr: w.addr, planes: new Set() }; m.set(w.cseip, e); }
    e.count++; e.planes.add(plane);
    if (w.addr < e.minAddr) e.minAddr = w.addr;
    if (w.addr > e.maxAddr) e.maxAddr = w.addr;
  };
  const watchRegion = async (cLo: number, cHi: number): Promise<WMap> => {
    const m: WMap = new Map();
    for (let plane = 0; plane < 4; plane++) {
      const planeBase = COMPOSE_PAGE + plane * PS;
      const lo = planeBase + sy0 * ROWB + cLo;
      const hi = planeBase + sy1 * ROWB + cHi + 1;
      await c.unserialize(captureState); await c.step(2);
      await c.wwatchSet(lo, hi);
      await c.key('left', 'tap'); await c.step(40); // SINGLE recompose (one turn)
      for (let i = 0; i < 12; i++) {
        await c.step(6);
        for (const w of await c.wwatchDrain()) { if (w.addr >= lo && w.addr < hi) tally(m, w, plane); }
      }
      await c.wwatchSet(0, 0);
    }
    return m;
  };
  const byWriter = await watchRegion(colLo, colHi);
  const ctlWriter = await watchRegion(ctlColLo, ctlColHi);

  // FUN_1c94 (decoration masked-blit) arg trace: at orBase+0x1c94, the stack frame
  // carries [bp+0xc]=bank index, [bp+0xe]/[bp+0x12]=dest x-range, [bp+0x16]=flags
  // (bit0 LUT-clear/bit1 hflip), [bp+0x18]=VGA-direct flag, [bp+0x1a]=descriptor
  // stream ptr. Capture the stack window at each hit over an in-place recompose.
  if (orBase >= 0) {
    const FUN_1C94 = orBase + 0x1c94;
    await c.unserialize(captureState); await c.step(2);
    await c.traceSet(FUN_1C94); await c.traceDrain();
    await c.key('left', 'tap'); await c.step(40);
    const hits: TraceRecord[] = [];
    for (let k = 0; k < 10; k++) { await c.step(4); for (const r of await c.traceDrain()) hits.push(r); }
    await c.traceOff();
    console.log(`\nFUN_1c94 (decoration masked-blit @0x${FUN_1C94.toString(16)}): ${hits.length} hits on in-place recompose`);
    out.fun1c94Hits = hits.length;
    out.fun1c94Args = [];
    // For up to the first few hits, capture the stack frame to read the args.
    const seen = new Set<string>();
    for (let hi = 0; hi < Math.min(hits.length, 24); hi++) {
      const r = hits[hi]!;
      const sig = `${(r.esp & 0xffff).toString(16)}:${r.ss.toString(16)}`;
      if (seen.has(sig)) continue; // dedup identical frames across passes
      seen.add(sig);
      // re-run, capture the bp frame at the hi-th hit (bp = sp on entry after push bp).
      await c.unserialize(captureState); await c.step(2);
      await c.traceSet(FUN_1C94); await c.captureSet((r.ss << 4) + (r.esp & 0xffff), 0x40, hi);
      await c.key('left', 'tap'); await c.step(40);
      const stk = await c.captureGet(); await c.traceOff();
      if (!stk) continue;
      // On entry, [sp]=return ip, [sp+2]=return cs; bp not yet set. Args are at
      // caller's [sp+4+N] = bp+2+N after `push bp;mov bp,sp`. So arg at bp+K is at
      // captured offset (K-2) from the entry sp... but entry sp points at return.
      // Frame after push bp;mov bp,sp: bp=oldsp-2. bp+K maps to entry_sp + (K-2).
      const argAt = (k: number) => stk[k - 2]! | (stk[k - 1]! << 8);
      const args = {
        retIp: argAt(0), bank: argAt(0xc), destXlo: argAt(0xe), destXmid: argAt(0x10),
        destXhi: argAt(0x12), flags16: argAt(0x16), flags18: argAt(0x18), descPtr: argAt(0x1a),
      };
      out.fun1c94Args.push(args);
      console.log(`  hit${hi}: bank=${args.bank} destX[${args.destXlo}..${args.destXhi}] flags16=0x${args.flags16.toString(16)} flags18=0x${args.flags18.toString(16)} descPtr=0x${args.descPtr.toString(16)} (retIp=0x${args.retIp.toString(16)})`);
    }
  }

  const ovl = (() => { try { return ovlBase(); } catch { return -1; } })();
  console.log(`\nwriters of residue page bytes (cseip -> residueCount / controlCount, plane set, dest span):`);
  for (const [cseip, e] of [...byWriter.entries()].sort((x, y) => y[1].count - x[1].count)) {
    const egaOff = orBase >= 0 ? cseip - orBase : NaN;
    const label = orBase >= 0 && egaOff >= 0 && egaOff < 0x2262 ? `ega.drv@0x${egaOff.toString(16)}` : tagLin(cseip, ovl);
    const isOr = orBase >= 0 && OR_PLANE_STORES.some((d) => cseip === orBase + d);
    const ctl = ctlWriter.get(cseip)?.count ?? 0;
    const residueOnly = ctl === 0 || e.count > ctl * 3;
    const planeSpan = (e.maxAddr - e.minAddr);
    const flag = isOr ? ' [FUN_0a93 OR-store]' : residueOnly ? ' <== DECORATION DRAW-PATH (residue-biased)' : ' (also writes control wall)';
    console.log(`  cseip 0x${cseip.toString(16)} = ${label}${flag}  res x${e.count} / ctl x${ctl}  planes{${[...e.planes].join('')}} dest 0x${e.minAddr.toString(16)}..0x${e.maxAddr.toString(16)} (span 0x${planeSpan.toString(16)})`);
    out.writers.push({ cseip: cseip.toString(16), egaOff: orBase >= 0 ? (cseip - orBase).toString(16) : null, label, isOrStore: isOr, residueCount: e.count, controlCount: ctl, residueBiased: !isOr && residueOnly, planes: [...e.planes], destMin: e.minAddr.toString(16), destMax: e.maxAddr.toString(16) });
  }
  writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`\n-> ${outFile}`);
}

async function phaseDecTrace(c: HostClient): Promise<void> {
  const outFile = process.argv[3] ?? '/tmp/wiz6-dectrace.json';
  const u16f = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
  const DG_DEPTH = 0x5040, DG_PARITY = 0x521a, DG_SPANPAR = 0x521c, DG_DEPTHBOUND = 0x521e;
  const SLOT = 0x5220; // 5 words: [front, cornerL, cornerR, leftSide, rightSide]
  const SPANCOUNT = 0x50ce;

  console.log('dectrace: cold-boot drive into dungeon level 0…');
  await driveToMaze(c);
  let base = await c.anchor();
  const rd = async (o: number) => u16f(await c.read(base + o, 2), 0);
  const party = async () => ({
    gs: await rd(0x363a), f: await rd(PK_FACING), gx: await rd(PK_GX), gy: await rd(PK_GY),
    cellA: await rd(PK_CELLA), cellB: await rd(PK_CELLB), sp: await rd(SPANCOUNT),
  });
  let p = await party();
  console.log(`landed: base=0x${base.toString(16)} gs=${p.gs} gx=${p.gx} gy=${p.gy} f=${p.f} cellA=${p.cellA} cellB=${p.cellB} sp=${p.sp}`);
  if (p.gs !== 5) { console.log(`NOT in maze (game_state=${p.gs}) — aborting`); return; }

  // --- Resolve the LIVE relocated ega.drv OR-blit base. The renderer runs from a
  // relocated transient copy that is only resident DURING a redraw, BUT the
  // COMPOSE-PAGE write-watch IS observable (unlike the span-list write-watch). The
  // OR plane-0 store cluster (base+0xb31/+0xb45/+0xb5c/+0xb75) recovers the base.
  // We arm the compose-page watch and do a REAL forward step. ---
  const out: any = {
    note: 'dectrace: REAL forward-move OR-blit ARG trace up the gx127 entry corridor. Per real step: every emitted placement INDEX (ebx=arg0c at OR-blit base+0xaad) + the settled build-loop DGROUP (depth/parity/slot-shape-codes [0x5220]). The gx126 special4==7 fountain is on the LEFT.',
    landed: { base: base.toString(16), gx: p.gx, gy: p.gy, facing: p.f },
    or_blit_base: '',
    steps: [] as any[],
  };
  let orBase = -1;
  for (let probe = 0; probe < 5 && orBase < 0; probe++) {
    const pp = await party();
    if (pp.gs !== 5) break;
    const writers = await watchComposePage(c, async () => { await c.key('enter', 'tap'); await c.step(70); });
    orBase = recoverOrBase(writers);
    base = await c.anchor();
    const np = await party();
    console.log(`  probe ${probe}: compose writers=${writers.size} orBase=${orBase < 0 ? 'none' : '0x' + orBase.toString(16)} -> gx${np.gx}gy${np.gy}f${np.f}`);
  }
  p = await party();
  if (orBase < 0) { console.log('FAILED: could not recover OR-blit base from compose-page write-watch on a real move'); return; }
  console.log(`LIVE OR-blit base=0x${orBase.toString(16)}`);
  out.or_blit_base = orBase.toString(16);
  const ORARG = orBase + 0xaad; // OR branch: ebx = arg0c (placement index)

  // Trap an emit fn over a REAL forward step, capturing per-hit the live DGROUP
  // window (depth/parity/slots) + the stack frame. We CANNOT serialize/restore on
  // this cold heap, so each capture-by-skip needs its own forward step. We instead
  // capture the WHOLE per-step emit sequence in ONE pass via traceDrain (regs +
  // stack are in each TraceRecord) and read the DGROUP slot array right AFTER the
  // step settles (the settled [0x5220] holds the LAST depth's slot codes; the
  // per-hit depth comes from [0x5040] sampled live — but a single drain can't
  // sample DGROUP per hit). So: do a per-fn trace pass per step for the stack
  // frames, plus a settled DGROUP read.
  // Trap a single OR-blit point over a REAL forward step and drain all hits. Each
  // TraceRecord carries the live regs (ebx=arg0c=placement index for the OR branch;
  // eax=arg10 at the cmp point), so a single drain captures the WHOLE per-step emit
  // sequence WITHOUT per-skip serialize/restore (a cold heap can't do that). We
  // read the settled build-loop DGROUP after the step (slot-shape-code array
  // [0x5220] — the decoration shape code 4..0xe lands in the per-slot walltype).
  const traceStep = async (pt: number, keyTap: () => Promise<void>): Promise<TraceRecord[]> => {
    await c.traceSet(pt); await c.traceDrain();
    await keyTap();
    const recs: TraceRecord[] = [];
    // drain incrementally so the 4096 ring never evicts the (sparse) blit hits.
    for (let k = 0; k < 10; k++) { await c.step(4); for (const r of await c.traceDrain()) recs.push(r); }
    await c.traceOff();
    return recs;
  };

  // Walk the corridor: on EACH real forward step trap the OR ARG point (the emitted
  // placement indices). The fountain column (gx126, LEFT, special4==7 -> shape code
  // 4) spans gy118..121 ALONGSIDE the gx127 corridor, so as the party steps north
  // the build loop classifies the gx126 cell on the LEFT slot and emits its
  // decoration placement — captured here as the step's OR-index set + the settled
  // left-side slot code [0x5226].
  let stall = 0;
  for (let i = 0; i < 18 && stall < 3; i++) {
    const before = await party();
    if (before.gs !== 5) { console.log(`  encounter gs=${before.gs} — stop`); break; }
    const orRecs = await traceStep(ORARG, async () => { await c.key('enter', 'tap'); await c.step(70); });
    const after = await party();
    const moved = after.gx !== before.gx || after.gy !== before.gy;
    // Settled DGROUP read (the LAST depth's slot/shape codes + depth bound + parity).
    const dgWin = await c.read(base + 0x5040, 0x1f0);
    const at = (o: number) => u16f(dgWin, o - 0x5040);
    const slots = [0, 1, 2, 3, 4].map((k) => at(SLOT + k * 2));
    const orIdx = orRecs.map((r) => r.ebx & 0xffff);
    const stepRec: any = {
      step: i, key: 'enter',
      before: { gx: before.gx, gy: before.gy, f: before.f, sp: before.sp },
      after: { gx: after.gx, gy: after.gy, f: after.f, sp: after.sp },
      moved,
      settled: {
        depth: at(DG_DEPTH), parity: at(DG_PARITY), spanpar: at(DG_SPANPAR),
        depthBound: at(DG_DEPTHBOUND),
        slots: { front: slots[0], cornerL: slots[1], cornerR: slots[2], leftSide: slots[3], rightSide: slots[4] },
      },
      orHits: orRecs.length,
      orPlacementIndices: orIdx,
    };
    if (moved) { stall = 0; console.log(`  MOVE gx${before.gx}gy${before.gy}->gx${after.gx}gy${after.gy} sp${before.sp}->${after.sp} ORhits=${orRecs.length} idx=[${orIdx.join(',')}] slots=[F${slots[0]},cL${slots[1]},cR${slots[2]},lS${slots[3]},rS${slots[4]}]`); }
    else { stall++; console.log(`  (no move) ORhits=${orRecs.length} idx=[${orIdx.join(',')}]`); }
    out.steps.push(stepRec);
  }

  // --- HEAD-ON FOUNTAIN ATTEMPT. The fountain (gx126 column, orient2==0) decorates
  // the NORTH face, so it renders as a FRONT wall only when the party stands IN the
  // gx126 column facing NORTH (the cell ahead is gx126 gy+1). The corridor walk is
  // gx127; to face the fountain head-on we must turn WEST, step to gx126, turn
  // NORTH. Turns DO work at gy121 on this core (LEFT f0->f3 confirmed by navreach).
  // We attempt the nav + trap the OR emit on the head-on view; if the nav fails
  // (wall/turn-lock) we record that honestly. ---
  const navLog: any[] = [];
  const tryKey = async (k: string) => {
    const b = await party();
    await c.key(k as any, 'tap'); await c.step(60);
    const a = await party();
    navLog.push({ key: k, from: { gx: b.gx, gy: b.gy, f: b.f }, to: { gx: a.gx, gy: a.gy, f: a.f } });
    return a;
  };
  console.log('head-on fountain nav attempt (turn west, step to gx126, face north)…');
  let pp = await party();
  if (pp.gs === 5) {
    // turn to face west (facing 3): from f0, LEFT once.
    let cur = await tryKey('left');
    // if facing west now, step forward to gx126.
    if (cur.f === 3) cur = await tryKey('up');
    // turn back to north (facing 0): from f3, RIGHT once.
    if (cur.gx === 126) cur = await tryKey('right');
    pp = await party();
  }
  console.log(`  nav result: gx${pp.gx} gy${pp.gy} f${pp.f} (target gx126 f0)`);
  const headOn: any = { reached: pp.gx === 126 && pp.f === 0 && pp.gs === 5, party: { gx: pp.gx, gy: pp.gy, f: pp.f, gs: pp.gs }, navLog };
  if (headOn.reached) {
    // Trap the OR emit on an in-place rebuild (turn left+right) at the head-on cell.
    await c.traceSet(ORARG); await c.traceDrain();
    await c.key('left', 'tap'); await c.step(40);
    const r1: TraceRecord[] = []; for (let k = 0; k < 8; k++) { await c.step(4); for (const r of await c.traceDrain()) r1.push(r); }
    await c.traceOff();
    // capture the head-on framebuffer (facing west view of the gx126-column wall).
    await c.fb(`${outFile}.headon-f3.rgba`);
    // turn back to north + capture
    await c.traceSet(ORARG); await c.traceDrain();
    await c.key('right', 'tap'); await c.step(40);
    const r2: TraceRecord[] = []; for (let k = 0; k < 8; k++) { await c.step(4); for (const r of await c.traceDrain()) r2.push(r); }
    await c.traceOff();
    const pp2 = await party();
    await c.fb(`${outFile}.headon-f${pp2.f}.rgba`);
    const dgWin = await c.read(base + 0x5040, 0x1f0);
    const at = (o: number) => u16f(dgWin, o - 0x5040);
    headOn.facing = pp2.f;
    headOn.orIndicesAfterTurnBack = [...new Set(r2.map((r) => r.ebx & 0xffff))].sort((a, b) => a - b);
    headOn.settledSlots = { front: at(SLOT), cornerL: at(SLOT + 2), cornerR: at(SLOT + 4), leftSide: at(SLOT + 6), rightSide: at(SLOT + 8) };
    console.log(`  head-on f${pp2.f} OR unique idx: [${headOn.orIndicesAfterTurnBack.join(',')}] slots F${headOn.settledSlots.front}`);
  } else {
    console.log('  head-on fountain view NOT reached (nav blocked) — documented in output.');
  }
  out.headOn = headOn;

  writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`\n-> ${outFile} (${out.steps.length} steps, head-on reached: ${headOn.reached})`);
}

/** `depthemit` — DEPTH-KEYED EMIT TRACE. For an arbitrary (gx,gy,facing) view,
 *  trap the ega.drv OR-blit ARG point (base+0xaad, ebx=arg0c=placement index) and,
 *  at EACH hit, read the LIVE wmaze DGROUP depth counter [0x5040] + frame parity
 *  [0x521a] + the per-depth gate bytes [0x508a..] (front) / [0x5072..] (left-side) /
 *  [0x5092..] (right-side). The OR-blits emit during the FLUSH walk, where [0x5040]
 *  counts DOWN from 4 to 0 — that flush depth IS the perspective depth the piece is
 *  drawn at. Output: per-OR-call (perspectiveDepth, parity, placementIndex) — the
 *  decisive evidence for which wall-family base fires at which perspective depth.
 *
 *  Usage: pnpm tsx tools/libretro/trace-maze.ts depthemit <gx> <gy> <facing> [out] [gxBase] [gyBase] */
async function phaseDepthEmit(c: HostClient): Promise<void> {
  const gx = Number(process.argv[3]);
  const gy = Number(process.argv[4]);
  const facing = Number(process.argv[5]);
  const outFile = process.argv[6] ?? `/tmp/wiz6-depthemit-${gx}-${gy}-f${facing}.json`;
  const gxBase = Number(process.argv[7] ?? 120);
  const gyBase = Number(process.argv[8] ?? 116);
  if (!Number.isFinite(gx) || !Number.isFinite(gy) || !Number.isFinite(facing)) {
    console.log('usage: depthemit <gx> <gy> <facing> [out] [gxBase] [gyBase]'); return;
  }
  const STATE = `/tmp/wiz6-depthemit-origin.state`;
  const w16 = async (b: number, o: number, v: number) => c.write(b + o, [v & 0xff, (v >> 8) & 0xff]);
  const rdU16 = async (b: number, o: number) => { const x = await c.read(b + o, 2); return x[0]! | (x[1]! << 8); };

  console.log(`depthemit target gx=${gx} gy=${gy} facing=${facing}`);
  await driveToMaze(c);
  let dg = await c.anchor();
  await w16(dg, PK_FACING, facing); await w16(dg, PK_Z, 0);
  await w16(dg, PK_CELLA, gy - gyBase); await w16(dg, PK_CELLB, gx - gxBase);
  await w16(dg, PK_GY, gy); await w16(dg, PK_GX, gx);
  await c.step(4);
  dg = await c.anchor();
  const rgx = await rdU16(dg, PK_GX), rgy = await rdU16(dg, PK_GY), rf = await rdU16(dg, PK_FACING);
  const stuck = rgx === gx && rgy === gy && rf === facing;
  console.log(`poked -> readback gx=${rgx} gy=${rgy} f=${rf} ${stuck ? 'STUCK✓' : 'SNAPPED✗'}`);
  await c.serialize(STATE);

  // The LIVE renderer runs from a RELOCATED transient copy of wmaze (the resident
  // image copy logs 0 hits). Scan ALL RAM copies of the renderer-entry signature
  // (RENDER_SIG @ file 0x4ad7); each copy's emit fn is at copyBase + 0x406c. Test
  // each candidate by tracing base+0x406c over an in-place recompose; the live copy
  // is the one that fires.
  await c.unserialize(STATE); await c.step(2);
  const sigBytes = RENDER_SIG.match(/../g)!.map((h) => parseInt(h, 16));
  const scanAll = async (): Promise<number[]> => {
    const hits: number[] = []; const CHUNK = 0x10000;
    for (let b = 0; b < 0xc0000; b += CHUNK - 32) {
      let buf: Uint8Array;
      try { buf = await c.read(b, CHUNK); } catch { continue; }
      for (let i = 0; i + sigBytes.length <= buf.length; i++) {
        let ok = true; for (let j = 0; j < sigBytes.length; j++) if (buf[i + j] !== sigBytes[j]) { ok = false; break; }
        if (ok) hits.push(b + i);
      }
    }
    return [...new Set(hits)];
  };
  const sigHits = await scanAll();
  const candBases = sigHits.map((h) => h - SIG_OFFSET);
  console.log(`render-sig copies: ${sigHits.map((h) => '0x' + h.toString(16)).join(' ')} -> bases ${candBases.map((b) => '0x' + b.toString(16)).join(' ')}`);
  let wbase = -1;
  for (const cand of candBases) {
    await c.unserialize(STATE); await c.step(2);
    await c.key('left', 'tap'); await c.step(40);
    await c.traceSet(cand + 0x406c); await c.traceDrain();
    await c.key('right', 'tap'); await c.step(40);
    const recs = await c.traceDrain(); await c.traceOff();
    console.log(`  cand 0x${cand.toString(16)}: base+0x406c hits=${recs.length}`);
    if (recs.length > 0) { wbase = cand; break; }
  }
  if (wbase < 0) { console.log('FAILED: no candidate emit fn fired'); return; }
  console.log(`LIVE wmaze base=0x${wbase.toString(16)}`);

  // Trap the BUILD-loop emit fns. At each hit the wmaze DGROUP depth counter
  // [0x5040] is the LIVE build depth. wall_emit_quad 0x406c front/side; the front
  // wall+corner emits run inside the depth loop. We trap:
  //   - 0x406c wall_emit_quad ENTRY  ([bp+0x6]=slot code, [bp+0x8]=side-array base)
  //   - 0x45b4 wall_emit_corner ENTRY ([bp+0x6]=corner-type)
  // and read [0x5040] + slot/parity per hit.
  const QUAD = wbase + 0x406c, CORNER = wbase + 0x45b4;
  const DG_DEPTH = 0x5040, DG_PARITY = 0x521a, DG_SPANPAR = 0x521c;
  // Slot codes the classifier produced (read settled in DGROUP after build):
  const SLOT = 0x5220; // 5 words: front, cornerL, cornerR, leftSide, rightSide

  // Drive an in-place recompose with a trace armed at `pt`; collect hits.
  const traceAt = async (pt: number): Promise<TraceRecord[]> => {
    await c.unserialize(STATE); await c.step(2);
    await c.key('left', 'tap'); await c.step(40);
    await c.traceSet(pt); await c.traceDrain();
    const out: TraceRecord[] = [];
    await c.key('right', 'tap');
    for (let i = 0; i < 20; i++) { await c.step(4); for (const r of await c.traceDrain()) out.push(r); }
    await c.traceOff();
    return out;
  };
  // Per-hit: capture [0x5040]/[0x521a]/[0x521c] + the stack frame at skip=k.
  const captureAt = async (pt: number, ss: number, off: number, len: number, k: number): Promise<Uint8Array | null> => {
    await c.unserialize(STATE); await c.step(2);
    await c.key('left', 'tap'); await c.step(40);
    await c.traceSet(pt); await c.captureSet(ss + off, len, k);
    await c.key('right', 'tap'); await c.step(40);
    const w = await c.captureGet(); await c.traceOff();
    return w ?? null;
  };

  const quadRecs = await traceAt(QUAD);
  const cornRecs = await traceAt(CORNER);
  console.log(`wall_emit_quad hits=${quadRecs.length} wall_emit_corner hits=${cornRecs.length}`);

  // First-pass length: the recompose runs N identical passes; split by the depth
  // counter resetting. We read depth per hit, then cut the pass at the first repeat
  // of the (fn, hit#0 depth) cycle. Simpler: capture depth for ALL hits, find when
  // the depth sequence repeats its prefix.
  const dgNow = await c.anchor();
  const sampleDepth = async (pt: number, recs: TraceRecord[], extraFrame: boolean) => {
    const out: Array<{ depth: number; parity: number; spanpar: number; slot: number[]; bpFrame: number[] }> = [];
    for (let k = 0; k < Math.min(recs.length, 48); k++) {
      // DGROUP window for depth/parity/slot.
      const wDG = await captureAt(pt, dgNow, 0x5040, 0x1e4, k); // 0x5040..0x5224
      if (!wDG) { out.push({ depth: -1, parity: -1, spanpar: -1, slot: [], bpFrame: [] }); continue; }
      const at = (o: number) => wDG[o - 0x5040]! | (wDG[o - 0x5040 + 1]! << 8);
      const depth = at(DG_DEPTH), parity = at(DG_PARITY), spanpar = at(DG_SPANPAR);
      const slot = [0, 1, 2, 3, 4].map((i) => at(SLOT + i * 2));
      let bpFrame: number[] = [];
      if (extraFrame) {
        const r = recs[k]!; const ss = r.ss << 4; const sp = r.esp & 0xffff;
        const wS = await captureAt(pt, ss, sp, 0x10, k);
        if (wS) bpFrame = [0, 2, 4, 6, 8].map((o) => wS[o]! | (wS[o + 1]! << 8));
      }
      out.push({ depth, parity, spanpar, slot, bpFrame });
    }
    return out;
  };
  const quadD = await sampleDepth(QUAD, quadRecs, true);
  const cornD = await sampleDepth(CORNER, cornRecs, true);
  console.log('wall_emit_quad per-hit (k: depth parity spanpar slot[F,cL,cR,lS,rS] | stack[ret,a0,a1,a2,a3]):');
  for (let k = 0; k < quadD.length; k++) { const t = quadD[k]!; console.log(`  q${k}: d=${t.depth} par=${t.parity} sp=${t.spanpar} slot=[${t.slot.join(',')}] stk=[${t.bpFrame.join(',')}]`); }
  console.log('wall_emit_corner per-hit (k: depth parity spanpar slot | stack[ret,a0(=[bp+4]),a1(type),a2,a3]):');
  for (let k = 0; k < cornD.length; k++) { const t = cornD[k]!; console.log(`  c${k}: d=${t.depth} par=${t.parity} sp=${t.spanpar} slot=[${t.slot.join(',')}] stk=[${t.bpFrame.join(',')}]`); }
  writeFileSync(outFile, JSON.stringify({
    note: 'depth-keyed emit trace: per emit-fn hit, live wmaze [0x5040]=build depth, [0x521a] parity, [0x521c] span-parity, slot codes [0x5220], stack frame.',
    target: { gx, gy, facing, gxBase, gyBase, cellA: gy - gyBase, cellB: gx - gxBase }, poke_stuck: stuck,
    reloc_wmaze: wbase.toString(16), wall_emit_quad: quadD, wall_emit_corner: cornD,
  }, null, 2));
  console.log(`-> ${outFile}`);
}

/** `placecheck` — reproducibility gate for `placements`: capture TWICE (two fresh
 *  boots) and confirm the placement-index lists are byte-identical. */
async function phasePlaceCheck(c: HostClient): Promise<void> {
  const a = '/tmp/wiz6-placements-a.json', b = '/tmp/wiz6-placements-b.json';
  process.argv[3] = a; await phasePlacements(c); c.close();
  const c2 = new HostClient();
  let listA: number[] = [], listB: number[] = [];
  try {
    process.argv[3] = b; await phasePlacements(c2);
    listA = JSON.parse(readFileSync(a, 'utf8')).placementIndices;
    listB = JSON.parse(readFileSync(b, 'utf8')).placementIndices;
  } finally { c2.close(); }
  const equal = JSON.stringify(listA) === JSON.stringify(listB);
  console.log(`\n=== PLACEMENT REPRODUCIBILITY ===`);
  console.log(`  A: ${listA.length} indices, B: ${listB.length} indices`);
  console.log(`  equal: ${equal ? '✓ reproducible' : 'DIFFER'}`);
  if (!equal) { console.log(`  A=[${listA.join(',')}]`); console.log(`  B=[${listB.join(',')}]`); }
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

/** `expander` — GAP A: trace ega.drv FUN_0x631 (dispatch entry 6), the routine
 *  that loads the per-view maze background graphics file into the cs:[0x149] data
 *  segment and builds the placement (cs:[0x190]) + image-descriptor (cs:[0x18e])
 *  tables. Captures, at the FIRST render: (a) which DOS file handle it reads + the
 *  raw input bytes (the on-disk record = expander INPUT), (b) the resulting
 *  dataSeg contents (the work buffer the OR-blit reads = expander OUTPUT). Writes
 *  /tmp/wiz6-expander/{meta.json,input.bin,output.bin}. */
async function phaseExpander(c: HostClient): Promise<void> {
  const { mkdirSync } = await import('node:fs');
  const outDir = process.argv[3] ?? '/tmp/wiz6-expander';
  mkdirSync(outDir, { recursive: true });
  if (!existsSync(CLEAN_STATE)) { console.log('run `reach` first'); return; }

  // Resolve base from the settled-replay recompose (reproducible).
  const base = await resolveOrBaseReplay(c);
  if (base < 0) { console.log('no OR cluster — abort'); return; }
  const entry = base + OR_ENTRY_FILE;
  console.log(`reloc base = 0x${base.toString(16)} entry=0x${entry.toString(16)}`);

  // Capture the table pointers AT the OR-blit entry fire (capture-on-breakpoint
  // — the cs:0x140 region is only valid mid-render).
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(entry); await c.traceDrain();
  await forceRedraw(c);
  const er = await c.traceDrain(); await c.traceOff();
  if (!er.length) { console.log('OR entry did not fire on replay'); return; }
  const cs = er[0]!.cs; const segBase = cs << 4;
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(entry); await c.captureSet(segBase + 0x140, 0x60, 0);
  await forceRedraw(c);
  const tbl = (await c.captureGet())!; await c.traceOff();
  const at = (o: number) => tbl[o - 0x140]! | (tbl[o - 0x140 + 1]! << 8);
  const dataSeg = at(0x149), pageSeg = at(0x14d), imgDescOff = at(0x18e), placeOff = at(0x190);
  console.log(`cs=0x${cs.toString(16)} dataSeg=0x${dataSeg.toString(16)} pageSeg=0x${pageSeg.toString(16)} imgDescOff=0x${imgDescOff.toString(16)} placeOff=0x${placeOff.toString(16)}`);

  // The OUTPUT buffer is the dataSeg region, captured AT the OR-blit entry (the
  // work buffer is only valid mid-render). Read a generous window.
  const OUT_LEN = 0xa000;
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(entry); await c.captureSet(dataSeg << 4, OUT_LEN, 0);
  await forceRedraw(c);
  const output = (await c.captureGet())!; await c.traceOff();
  writeFileSync(`${outDir}/output.bin`, Buffer.from(output));
  console.log(`output.bin = dataSeg 0x${dataSeg.toString(16)} +${OUT_LEN.toString(16)}; first16 ${Array.from(output.slice(0, 16)).map((b) => b.toString(16).padStart(2, '0')).join('')}`);
  // Placement + descriptor tables (captured at entry).
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(entry); await c.captureSet((dataSeg << 4) + placeOff, 0x800, 0);
  await forceRedraw(c); const placeRaw = (await c.captureGet())!; await c.traceOff();
  await c.unserialize(CLEAN_STATE); await c.step(2);
  await c.traceSet(entry); await c.captureSet((dataSeg << 4) + imgDescOff, 0x400, 0);
  await forceRedraw(c); const descRaw = (await c.captureGet())!; await c.traceOff();
  writeFileSync(`${outDir}/place.bin`, Buffer.from(placeRaw));
  writeFileSync(`${outDir}/desc.bin`, Buffer.from(descRaw));

  // --- TRACE FUN_0x631 (entry 6 = the loader/expander) during a FRESH first
  // render. base differs per heap layout; resolve in the fresh session, then
  // trace base+0x631. Capture its int21 read args (ds:dx buffer, cx len, bx handle)
  // and the ds:0 buffer before/after. ---
  {
    const cE = new HostClient();
    try {
      await driveToDungeonEntry(cE);
      const w2 = new Map<number, number>();
      await cE.wwatchSet(COMPOSE_PAGE, COMPOSE_PAGE + 0x8000);
      await cE.key('enter', 'tap');
      for (let i = 0; i < 60; i++) { await cE.step(6); for (const w of await cE.wwatchDrain()) w2.set(w.cseip, (w2.get(w.cseip) ?? 0) + 1); }
      await cE.wwatchSet(0, 0);
      const base2 = recoverOrBase(w2);
      console.log(`\nfresh-session base = 0x${base2.toString(16)} — but FUN_0x631 already ran (pre-OR). Re-driving to trace it.`);
    } finally { cE.close(); }
    // Second fresh session: arm the FUN_0x631 trace BEFORE firing the render. We
    // can't know base2 ahead of time, but the relocated copy has been stable at
    // 0x6ba10 across runs — trace base+0x631 on the assumption, and also the
    // in-image ega.drv copy 0x6a1b0+0x631 as a fallback. Capture int21 read sites.
    const cF = new HostClient();
    try {
      await driveToDungeonEntry(cF);
      const loaderEntry = 0x6ba10 + 0x631; // relocated FUN_0x631
      const int21Read = 0x6ba10 + 0x64d;   // the first int21 ah=3f in FUN_0x631
      await cF.traceSet(loaderEntry); await cF.traceDrain();
      await cF.key('enter', 'tap');
      const hits: TraceRecord[] = [];
      for (let i = 0; i < 40; i++) { await cF.step(6); for (const r of await cF.traceDrain()) hits.push(r); }
      await cF.traceOff();
      console.log(`FUN_0x631 (loaderEntry 0x${loaderEntry.toString(16)}) hits during first render: ${hits.length}`);
      for (const r of hits.slice(0, 6)) console.log(`  cs=${r.cs.toString(16)} ip=${r.eip.toString(16)} ds=${r.ds.toString(16)} ax=${r.eax.toString(16)} bx=${r.ebx.toString(16)} cx=${r.ecx.toString(16)} dx=${r.edx.toString(16)} si=${r.esi.toString(16)} di=${r.edi.toString(16)} bp=${r.ebp.toString(16)} stack=[${r.stack.map((w) => w.toString(16)).join(',')}]`);
      void int21Read;
    } finally { cF.close(); }
  }

  const meta = {
    note: 'Gap A expander OUTPUT: the cs:[0x149] dataSeg work buffer (resident in CLEAN_STATE) + table pointers',
    reloc_base: base.toString(16), cs: cs.toString(16), out_len: OUT_LEN,
    table_pointers: { dataSeg: dataSeg.toString(16), pageSeg: pageSeg.toString(16), imgDescOff: imgDescOff.toString(16), placeOff: placeOff.toString(16) },
  };
  writeFileSync(`${outDir}/meta.json`, JSON.stringify(meta, null, 2));
}

/**
 * navreach — NAVIGATION-REACH HARNESS (the build-loop-on-real-move unblock).
 *
 * Cold-boots a fresh party into dungeon level 0 and drives REAL forward moves
 * (arrow/ENTER taps, one at a time) up the entry corridor, reading the party
 * DGROUP after each key to confirm the move took. At each NEW grid cell it
 * captures the live framebuffer as a committed-format `.idx.gz` (320×200 EGA
 * palette index, gzipped — the SAME format as the maze-corridor fixtures) + a
 * PNG for eyeballing, and snapshots the span count [0x50ce] / spans pointer
 * before+after the move to demonstrate the BUILD LOOP re-runs on a genuine move
 * (the thing pokeview could NOT do — pokeview replays a cached span list).
 *
 * WHAT THIS HARNESS PROVES / its limits (honest):
 *   - Cold-boot driveToMaze lands the party at gx127 gy118 facing0, game_state 5
 *     (DGROUP base read confirms cellA=gy-116, cellB=gx-120 region-0 mapping).
 *   - Pressing ENTER/UP advances the party NORTH up the gx127 column
 *     (gy 118 -> 119 -> 120 -> 121); the span COUNT [0x50ce] changes value on
 *     each genuine cell change -> the build loop DID re-run (vs pokeview's 0).
 *   - BUT: the scripted gate-entry walk consumes ENTER/UP as forward steps and
 *     keeps the TURN keys (left/right) LOCKED for the whole entry corridor, so a
 *     free-roam `navigateTo(arbitrary gx,gy,facing)` is NOT achievable from a
 *     cold boot on the patched trace core: you can only walk the entry column
 *     forward, never turn. (Committed maze states that WOULD give a turnable
 *     free-roam frame do NOT unserialize on the patched core — `err unser`.)
 *   - The span-list region [0x50d0] write-watch logs ZERO writes even on a real
 *     move whose span COUNT changes, so the wwatch can't be used to trap the
 *     BUILD-loop emit stores in this configuration (a known tracer limitation).
 *
 * So this harness delivers the FALLBACK the task spec anticipated: a set of
 * FRESH real-move build-loop framebuffer captures along the entry corridor
 * (gx127 gy118..121 facing0) — each a genuine build-loop render — for eyeballing
 * the decorations, plus the build-loop-re-runs-on-real-move confirmation.
 *
 * Usage: pnpm tsx tools/libretro/trace-maze.ts navreach [outDir]
 */
async function phaseNavReach(c: HostClient): Promise<void> {
  const { COMPOSED_PALETTE, SCREEN_WIDTH, SCREEN_HEIGHT } = await import('../parity/decode-screen.js');
  const { encodePngRgba } = await import('../../packages/cli/src/lib/png.js');
  const outDir = process.argv[3] ?? '/tmp/wiz6-navreach';
  mkdirSync(outDir, { recursive: true });
  const rgbToIdx = new Map<number, number>();
  COMPOSED_PALETTE.forEach((rgb: readonly number[], i: number) => rgbToIdx.set(((rgb[0]! << 16) | (rgb[1]! << 8) | rgb[2]!) >>> 0, i));
  const rgbaToIdx = (rgba: Uint8Array): Uint8Array => {
    const idx = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);
    for (let p = 0; p < idx.length; p++) {
      const k = ((rgba[p * 4]! << 16) | (rgba[p * 4 + 1]! << 8) | rgba[p * 4 + 2]!) >>> 0;
      const i = rgbToIdx.get(k);
      if (i === undefined) return new Uint8Array(0); // non-palette colour -> signal
      idx[p] = i;
    }
    return idx;
  };
  const PF = { game_state: 0x363a, facing: 0x4f9a, z: 0x4f9c, cellA: 0x4f9e, cellB: 0x4fa0, gy: 0x4fa2, gx: 0x4fa4, spanCount: 0x50ce };
  let base = 0;
  const rd = async (o: number) => { const b = await c.read(base + o, 2); return b[0]! | (b[1]! << 8); };
  const party = async () => ({
    gs: await rd(PF.game_state), f: await rd(PF.facing), gx: await rd(PF.gx), gy: await rd(PF.gy),
    cellA: await rd(PF.cellA), cellB: await rd(PF.cellB), sp: await rd(PF.spanCount),
  });

  console.log('navreach: cold-boot drive into dungeon level 0…');
  await driveToMaze(c);
  base = await c.anchor();
  let p = await party();
  console.log(`landed: base=0x${base.toString(16)} gs=${p.gs} gx=${p.gx} gy=${p.gy} f=${p.f} cellA=${p.cellA} cellB=${p.cellB} sp=${p.sp}`);
  console.log(`region-0 mapping check: cellA(${p.cellA})==gy-116(${p.gy - 116})? ${p.cellA === p.gy - 116}; cellB(${p.cellB})==gx-120(${p.gx - 120})? ${p.cellB === p.gx - 120}`);

  const captures: Array<{ gx: number; gy: number; facing: number; fixture: string; distinctIdx: number }> = [];
  const moveLog: Array<{ key: string; before: { gx: number; gy: number; f: number; sp: number }; after: { gx: number; gy: number; f: number; sp: number }; moved: boolean; spanCountChanged: boolean }> = [];
  const captured = new Set<string>();

  const capture = async (pp: { gx: number; gy: number; f: number }) => {
    const key = `gx${pp.gx}-gy${pp.gy}-f${pp.f}`;
    if (captured.has(key)) return;
    const rgbaPath = `${outDir}/${key}.rgba`;
    await c.fb(rgbaPath);
    const rgba = new Uint8Array(readFileSync(rgbaPath));
    const idx = rgbaToIdx(rgba);
    writeFileSync(`${outDir}/${key}.png`, encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, rgba));
    if (idx.length) {
      writeFileSync(`${outDir}/${key}.idx.gz`, gzipSync(idx));
      const distinctIdx = new Set(idx).size;
      captures.push({ gx: pp.gx, gy: pp.gy, facing: pp.f, fixture: `${key}.idx.gz`, distinctIdx });
      console.log(`  captured ${key}: ${distinctIdx} distinct palette indices -> ${key}.idx.gz + .png`);
    } else {
      console.log(`  captured ${key}: PNG only (framebuffer has non-WIZ6_MAIN colours — narration/transition frame)`);
    }
    captured.add(key);
  };

  await capture({ gx: p.gx, gy: p.gy, f: p.f });

  // Drive forward up the entry corridor with ENTER taps (the scripted-walk
  // forward step). Read the party after EACH key; record whether the cell moved
  // and whether the span COUNT changed (= build loop re-ran). Stop on encounter
  // (game_state != 5) or when forward progress stalls.
  // narration dismissal can eat many ENTER taps between cell advances, so allow a
  // generous stall budget before giving up on forward progress.
  let stall = 0;
  for (let i = 0; i < 60 && stall < 18; i++) {
    const before = await party();
    if (before.gs !== 5) { console.log(`  encounter (game_state=${before.gs}) at gx${before.gx} gy${before.gy} — stopping walk`); break; }
    await c.key('enter', 'tap'); await c.step(70);
    const after = await party();
    const moved = after.gx !== before.gx || after.gy !== before.gy;
    const spanCountChanged = after.sp !== before.sp;
    moveLog.push({ key: 'enter', before: { gx: before.gx, gy: before.gy, f: before.f, sp: before.sp }, after: { gx: after.gx, gy: after.gy, f: after.f, sp: after.sp }, moved, spanCountChanged });
    if (moved) { stall = 0; console.log(`  MOVE gx${before.gx}gy${before.gy} -> gx${after.gx}gy${after.gy}  spanCount ${before.sp}->${after.sp} ${spanCountChanged ? '(BUILD LOOP RE-RAN)' : ''}`); await capture({ gx: after.gx, gy: after.gy, f: after.f }); }
    else stall++;
  }

  // Demonstrate the TURN-LOCK: try a turn from the final corridor frame.
  const fb = await party();
  await c.key('left', 'tap'); await c.step(60);
  const fa = await party();
  const turnWorks = fa.f !== fb.f;
  console.log(`turn-lock probe at gx${fb.gx}gy${fb.gy}: LEFT f${fb.f}->f${fa.f} ${turnWorks ? 'TURN WORKS' : 'TURN LOCKED (scripted entry walk holds the turn keys)'}`);

  const buildLoopReran = moveLog.some((m) => m.moved && m.spanCountChanged);
  const out = {
    note: 'navreach: cold-boot real-move walk up the dungeon entry corridor (gx127 facing0). Each NEW cell framebuffer is a FRESH build-loop render. spanCountChanged on a moved frame == the build loop re-ran (vs pokeview = 0).',
    landed: { base: base.toString(16), gx: p.gx, gy: p.gy, facing: p.f, game_state: p.gs },
    region0_mapping_ok: p.cellA === p.gy - 116 && p.cellB === p.gx - 120,
    build_loop_reran_on_real_move: buildLoopReran,
    turn_keys_locked_in_entry_walk: !turnWorks,
    move_log: moveLog,
    captures,
  };
  writeFileSync(`${outDir}/navreach.json`, JSON.stringify(out, null, 2));
  console.log(`\nbuild-loop-re-runs-on-real-move: ${buildLoopReran ? 'CONFIRMED' : 'NOT observed'}`);
  console.log(`turn keys locked in entry walk: ${!turnWorks}`);
  console.log(`-> ${outDir}/navreach.json (${captures.length} idx.gz fixtures)`);
}

async function main() {
  const phase = process.argv[2];
  const c = new HostClient();
  try {
    if (phase === 'navreach') await phaseNavReach(c);
    else if (phase === 'reach') await phaseReach(c);
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
    else if (phase === 'geomspan') await phaseGeomSpan(c);
    else if (phase === 'seamdump') await phaseSeamDump(c);
    else if (phase === 'emitargs') await phaseEmitArgs(c);
    else if (phase === 'buildwatch') await phaseBuildWatch(c);
    else if (phase === 'seamtables') await phaseSeamTables(c);
    else if (phase === 'geomgen') await phaseGeomGen(c);
    else if (phase === 'move') await phaseMove(c);
    else if (phase === 'resolve') await phaseResolve(c);
    else if (phase === 'firstrender') await phaseFirstRender(c);
    else if (phase === 'firstcheck') await phaseFirstCheck(c);
    else if (phase === 'fine') await phaseFine(c);
    else if (phase === 'maskedloop') await phaseMaskedLoop(c);
    else if (phase === 'placements') await phasePlacements(c);
    else if (phase === 'placements121') await phasePlacements121(c);
    else if (phase === 'pokeview') await phasePokeView(c);
    else if (phase === 'freeroam') await phaseFreeRoam(c);
    else if (phase === 'depthemit') await phaseDepthEmit(c);
    else if (phase === 'dectrace') await phaseDecTrace(c);
    else if (phase === 'decwatch') await phaseDecWatch(c);
    else if (phase === 'placecheck') await phasePlaceCheck(c);
    else if (phase === 'expander') await phaseExpander(c);
    else console.log('phases: navreach [outDir] | reach | calibrate | teste | funcs | ctargets | coarse | move [state] | resolve | firstrender [outDir] | firstcheck | fine <off...>');
  } finally {
    c.close();
  }
}
main();
