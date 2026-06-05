/**
 * capture-maze-wall-spans.ts — Task C2 (capture fallback): read the engine's
 * SETTLED span list (DGROUP 0x50d0, count 0x50ce) for each distinct view-case the
 * reachable level-0 starting area exercises, keyed by view-config.
 *
 * WHY CAPTURE (not generate): the maze wall-emit PREDICATE (which depth/side emits,
 * what walltype/shape) is NOT derivable from offline geometry — proven by the f0/f2
 * mirror-symmetry counterexample (maze-classify-gating.json: Prong A disproven) —
 * and the live per-emit arg trace is BLOCKED by the relocated-renderer instrumentation
 * wall (Prong B). BUT the engine's OWN settled span list (the build-emitter output at
 * DGROUP 0x50d0) is readable on the nightly core (this is how the corridor was cracked,
 * maze-span-build.json). So C2 captures that span list per view-case and renders it
 * through the existing (byte-exact) flush→compositor→page pipeline. This is the
 * finite-capture sidestep the C2 plan authorizes for decompiler-blocked wall cases.
 *
 * The captured spans are committed to tools/parity/fixtures/engine/maze-wall-spans.json
 * keyed by case id + view-config key (from maze-view-cases.ts). The parity test renders
 * each via generateCallList→renderFrameFromGeometry and gates the WALL REGION byte-exact
 * against the committed C1 framebuffer fixture.
 *
 * Drive = identical to capture-maze-view-cases.ts (unserialize the committed base →
 * replay the case path → retry on encounters → verify rep). After settling, read the
 * span list. Walls don't animate (the flicker is torch/gate palette in the BACKGROUND),
 * so the span list is phase-stable.
 *
 * Usage: pnpm tsx tools/libretro/capture-maze-wall-spans.ts
 *        pnpm tsx tools/libretro/capture-maze-wall-spans.ts --check   (diff vs committed)
 */

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import {
  loadLevel0,
  enumerateViewCases,
  viewConfig,
  viewConfigKey,
  ENGINE_ENTRANCE,
  MVP_MAX_FORWARD_STEPS,
  type MoveKey,
} from '../parity/maze-view-cases.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const FIXTURES = resolve(REPO_ROOT, 'tools', 'parity', 'fixtures', 'engine');
const COMMITTED_STATES = resolve(REPO_ROOT, 'test-fixtures', 'states');
const TMP = '/tmp/wiz6-capture-maze-wall-spans';
const OUT = join(FIXTURES, 'maze-wall-spans.json');

const CHECK = process.argv.includes('--check');

mkdirSync(TMP, { recursive: true });

function u16(b: Uint8Array, o: number): number { return b[o]! | (b[o + 1]! << 8); }

// DGROUP party + span-list fields (maze-span-build.json / maze-harness-movement.json).
const O = {
  game_state: 0x363a,
  facing: 0x4f9a,
  z: 0x4f9c,
  gy: 0x4fa2,
  gx: 0x4fa4,
  span_count: 0x50ce,
  span_list: 0x50d0,
  depth_bound: 0x521e,
};

interface Span {
  x0: number;
  x1: number;
  clipLo: number;
  clipHi: number;
  walltype: number;
  seamIdx: number;
  depthField: number;
}

async function readParty(c: HostClient, base: number) {
  const [gs, f, z, gy, gx] = await Promise.all([
    c.read(base + O.game_state, 2),
    c.read(base + O.facing, 2),
    c.read(base + O.z, 2),
    c.read(base + O.gy, 2),
    c.read(base + O.gx, 2),
  ]);
  return { game_state: u16(gs, 0), facing: u16(f, 0), z: u16(z, 0), gy: u16(gy, 0), gx: u16(gx, 0) };
}

/** Read the span list (count @0x50ce, 11-byte records @0x50d0) once at current state. */
async function readSpansOnce(c: HostClient, base: number): Promise<{ spans: Span[]; depthBound: number }> {
  const cnt = u16(await c.read(base + O.span_count, 2), 0);
  const depthBound = u16(await c.read(base + O.depth_bound, 2), 0);
  const spans: Span[] = [];
  if (cnt > 0 && cnt <= 0x1e) {
    const sb = await c.read(base + O.span_list, cnt * 0xb);
    for (let i = 0; i < cnt; i++) {
      const o = i * 0xb;
      spans.push({
        x0: u16(sb, o),
        x1: u16(sb, o + 2),
        clipLo: u16(sb, o + 4),
        clipHi: u16(sb, o + 6),
        walltype: sb[o + 8]!,
        seamIdx: sb[o + 9]!,
        depthField: sb[o + 10]!,
      });
    }
  }
  return { spans, depthBound };
}

/** Settle to the FULLY-built span list. The engine renders depth-by-depth across
 *  animation frames: a freshly-walked frame shows df0+df1 (count snapshot) and
 *  appends df2+df3 over the next ~60 frames; the count momentarily resets to 0 at
 *  each rebuild. So we step in chunks and take the LARGEST consistent span list
 *  seen across consecutive identical reads (the full df0..3 build). Walls don't
 *  animate, so once the full list is reached it is stable (probe-span-stability.ts). */
async function readSpansSettled(c: HostClient, base: number): Promise<{ spans: Span[]; depthBound: number }> {
  // The build renders df0..3 progressively across animation frames and the count
  // momentarily resets to 0 at each rebuild. The FULLY-built list (all df present,
  // depthBound nonzero) is the target. Read many times across a long window and
  // keep the entry with the MOST spans AND a nonzero depthBound; require it to
  // recur (seen >= 2 times) to reject a mid-build snapshot. Walls don't animate,
  // so the full list is byte-stable once reached (probe-span-stability.ts).
  const seen = new Map<string, { rec: { spans: Span[]; depthBound: number }; hits: number }>();
  for (let i = 0; i < 40; i++) {
    await c.step(12);
    const r = await readSpansOnce(c, base);
    if (r.depthBound === 0) continue; // mid-rebuild snapshot
    const key = JSON.stringify(r.spans);
    const e = seen.get(key);
    if (e) e.hits++;
    else seen.set(key, { rec: r, hits: 1 });
  }
  // Choose the recurring list with the most spans (full df0..3 build).
  let best: { spans: Span[]; depthBound: number } = { spans: [], depthBound: 0 };
  let bestScore = -1;
  for (const { rec, hits } of seen.values()) {
    if (hits < 2) continue;
    if (rec.spans.length > bestScore) {
      bestScore = rec.spans.length;
      best = rec;
    }
  }
  // Fallback: if nothing recurred (rare), take the single largest seen.
  if (bestScore < 0) {
    for (const { rec } of seen.values()) {
      if (rec.spans.length > best.spans.length) best = rec;
    }
  }
  return best;
}

const KEY_OF: Record<MoveKey, string> = { left: 'left', right: 'right', forward: 'up' };

function decompressBase(): string {
  const gz = join(COMMITTED_STATES, 'maze-corridor.state.gz');
  const raw = gunzipSync(readFileSync(gz));
  const out = join(TMP, 'engine-entrance.state');
  writeFileSync(out, raw);
  return out;
}

async function main() {
  const { block } = loadLevel0();
  const entrance = { ...ENGINE_ENTRANCE };
  const en = enumerateViewCases(block, entrance, MVP_MAX_FORWARD_STEPS);
  console.log(`=== capture-maze-wall-spans ${CHECK ? '(--check)' : ''} ===`);
  console.log(`distinct view-cases: ${en.distinct.length}`);

  const c = new HostClient();
  const records: Array<{
    id: string;
    kind: string;
    configKey: string;
    representative: { gx: number; gy: number; facing: number };
    depthBound: number;
    spans: Span[];
  }> = [];

  try {
    await c.step(3000);
    const basePath = decompressBase();
    await c.unserialize(basePath); await c.step(2);
    const base0 = await c.anchor();
    const p0 = await readParty(c, base0);
    console.log(`base: gx=${p0.gx} gy=${p0.gy} f=${p0.facing} gs=${p0.game_state}`);
    if (p0.gx !== entrance.gx || p0.gy !== entrance.gy || p0.facing !== entrance.facing) {
      throw new Error(`base drift: (${p0.gx},${p0.gy},f${p0.facing}) != entrance`);
    }

    for (const cs of en.distinct) {
      const r = cs.representative;
      const MAX_TRIES = 40;
      let base = 0;
      let ok = false;
      let result: { spans: Span[]; depthBound: number } | null = null;
      for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
        await c.unserialize(basePath); await c.step(2);
        base = await c.anchor();
        for (const mv of cs.path) {
          await c.key(KEY_OF[mv], 'tap');
          await c.step(40);
        }
        await c.step(40);
        const e = await readParty(c, base);
        const posOk = e.gx === r.gx && e.gy === r.gy && e.facing === r.facing;
        const clean = e.game_state === 5;
        if (posOk && clean) {
          result = await readSpansSettled(c, base);
          // Re-verify still clean + on-rep after settling (an encounter could fire mid-settle).
          const e2 = await readParty(c, base);
          if (e2.game_state === 5 && e2.gx === r.gx && e2.gy === r.gy && e2.facing === r.facing) {
            ok = true;
            break;
          }
        }
      }
      if (!ok || !result) throw new Error(`${cs.id}: could not reach clean rep in ${MAX_TRIES} tries`);

      const cfg = viewConfig(block, { ...r, z: entrance.z });
      const configKey = viewConfigKey(cfg);
      const wt2 = result.spans.filter((s) => s.walltype !== 0xff);
      console.log(
        `${cs.id} [${cs.kind}] rep=(${r.gx},${r.gy},f${r.facing}) ` +
        `spans=${result.spans.length} (drawn=${wt2.length}) db=${result.depthBound}`,
      );
      for (const s of result.spans) {
        console.log(`    x0=${s.x0} x1=${s.x1} clip=${s.clipLo}/${s.clipHi} wt=${s.walltype} seam=${s.seamIdx} df=${s.depthField}`);
      }
      records.push({
        id: cs.id,
        kind: cs.kind,
        configKey,
        representative: r,
        depthBound: result.depthBound,
        spans: result.spans,
      });
    }

    const payload = {
      _comment:
        'Task C2: engine-captured SETTLED wall span lists per distinct view-case ' +
        '(DGROUP 0x50d0, count 0x50ce). Capture fallback — the wall-emit predicate is ' +
        'not derivable offline (maze-classify-gating.json Prong A) and live per-emit ' +
        'tracing is blocked (Prong B). Rendered via generateCallList→renderFrameFromGeometry. ' +
        'Keyed by case id + view-config key (maze-view-cases.ts). Drive: unserialize ' +
        'maze-corridor.state.gz base → replay path → settle → read 0x50d0.',
      captured: new Date().toISOString(),
      entrance,
      maxForwardSteps: MVP_MAX_FORWARD_STEPS,
      cases: records,
    };

    if (CHECK) {
      const committed = JSON.parse(readFileSync(OUT, 'utf8'));
      let bad = 0;
      for (const rec of records) {
        const com = committed.cases.find((x: { id: string }) => x.id === rec.id);
        const a = JSON.stringify(rec.spans);
        const b = JSON.stringify(com?.spans);
        if (a !== b) { bad++; console.log(`  ${rec.id}: SPAN DIFF`); }
      }
      console.log(`\n=== --check: ${records.length - bad}/${records.length} span-exact ===`);
      if (bad) process.exitCode = 1;
      return;
    }

    writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
    console.log(`\nwrote ${OUT} (${records.length} cases)`);
  } finally {
    c.close();
  }
}

main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
