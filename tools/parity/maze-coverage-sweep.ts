/**
 * maze-coverage-sweep.ts — the GENERATION-FIDELITY SWEEP (#086).
 *
 * The maze renderer is byte-exact for ~3% of level-0 (the 32 captured wall-cases +
 * the entrance cluster); the other 97% of (cell,facing) views fall through to the
 * UNVALIDATED generation path (generateFullCallList → composeCallList →
 * renderMazeViewport). This tool turns "97% unvalidated" into a measurable FIDELITY
 * MAP by, for a SAMPLE of uncovered configs:
 *   1. enumerate every reachable view-config of level-0 (reusing the C1 enumerator),
 *   2. rank the UNCOVERED configs by how many (cell,facing) views share them,
 *   3. (offline here) pick a representative-diverse capture sample,
 *   4. (after engine oracles are captured via `trace-maze.ts freeroam <gx> <gy> <f>`)
 *      render OUR generation path for each captured view and pixel-compare it to the
 *      engine framebuffer → a per-config fidelity %.
 *
 * "Covered" = a config whose configKey appears in the committed wall-spans cases OR
 * is keyed by an existing committed freeroam fixture. Both keys are computed by the
 * single-source-of-truth viewConfigKey (view-config.ts), so coverage can never drift.
 *
 * Two modes:
 *   enumerate [--json <out>]            — print/emit the coverage report + capture sample
 *   fidelity  <oracleDir> [--json <out>] — score every maze-freeroam-*.idx.gz oracle in
 *                                          <oracleDir> (default fixtures/engine) vs our render
 *
 * The render path here is BYTE-IDENTICAL to maze-freeroam-parity.test.ts (the gate):
 *   generateFullCallList(BLOCK, party) → composeCallList(wb, calls)
 *     → renderMazeViewport(BLOCK, party, assets, { page }) → crop MAZE_VIEWPORT → match.
 *
 * Run:
 *   pnpm tsx tools/parity/maze-coverage-sweep.ts enumerate
 *   pnpm tsx tools/parity/maze-coverage-sweep.ts enumerate --json /tmp/sweep.json
 *   pnpm tsx tools/parity/maze-coverage-sweep.ts fidelity /tmp/wiz6-sweep
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  enumerateViewCases,
  loadLevel0,
  ENGINE_ENTRANCE,
  type DistinctCase,
  type ReachableState,
} from './maze-view-cases.js';
import { viewConfigKeyFor } from '../../packages/parser/src/maze/view-config.js';
import {
  generateFullCallList,
  composeCallList,
} from '../../packages/parser/src/maze/callist.js';
import { renderMazeViewport } from '../../packages/parser/src/maze/render.js';
import { loadMazeAssets } from '../../packages/parser/src/maze/assets.js';
import { expandMazeData } from '../../packages/parser/src/maze/maze-data.js';
import { MazeBlockSchema, MAZE_VIEWPORT, type MazeBlock, type MazeParty } from '../../packages/data/src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const FIX = resolve(REPO_ROOT, 'tools', 'parity', 'fixtures', 'engine');

/** The render block + the keying block are the SAME level-0 data (maze-frames.json's
 *  mazeBlock differs from extracted/maze/level-0.json's only by an extra `note` field;
 *  regions/gxBase/gyBase are byte-identical). The parity gate parses maze-frames.json,
 *  so we render with that to stay byte-identical to the gate. */
function loadRenderBlock(): MazeBlock {
  const frames = JSON.parse(readFileSync(resolve(FIX, 'maze-frames.json'), 'utf8'));
  return MazeBlockSchema.parse(frames.mazeBlock);
}

/** The existing committed freeroam fixtures (used as coverage, and re-scored by fidelity). */
function freeroamFixtureViews(): ReachableState[] {
  return readdirSync(FIX)
    .map((f) => /^maze-freeroam-gx(\d+)-gy(\d+)-f(\d)\.idx\.gz$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ gx: Number(m[1]), gy: Number(m[2]), facing: Number(m[3]) }));
}

/** The set of configKeys we already validate byte-exact (wall-spans) or have an engine
 *  framebuffer oracle for (freeroam fixtures). */
function coveredConfigKeys(block: MazeBlock): Set<string> {
  const ws = JSON.parse(readFileSync(resolve(FIX, 'maze-wall-spans.json'), 'utf8'));
  const keys = new Set<string>(ws.cases.map((c: { configKey: string }) => c.configKey));
  for (const v of freeroamFixtureViews()) keys.add(viewConfigKeyFor(block, { ...v, z: 0 }));
  return keys;
}

interface UncoveredConfig {
  configKey: string;
  kind: string;
  members: number; // # of (cell,facing) views sharing this config
  representative: ReachableState;
  pathLen: number; // BFS move-count from the entrance (capture-cost proxy)
}

function rankUncovered(distinct: DistinctCase[], covered: Set<string>): UncoveredConfig[] {
  return distinct
    .filter((d) => !covered.has(d.configKey))
    .map((d) => ({
      configKey: d.configKey,
      kind: d.kind,
      members: d.members.length,
      representative: d.representative,
      pathLen: d.path.length,
    }))
    .sort((a, b) => b.members - a.members || a.pathLen - b.pathLen);
}

/** Pick a capture SAMPLE: the top-N by view-count, UNION at least one per structural
 *  `kind` (so every wall family gets a fidelity read, not just the populous ones).
 *  Prefer shorter nav paths within a kind (cheaper/more-reliable capture). */
function pickSample(uncovered: UncoveredConfig[], topN: number): UncoveredConfig[] {
  const chosen = new Map<string, UncoveredConfig>();
  for (const u of uncovered.slice(0, topN)) chosen.set(u.configKey, u);
  const byKind = new Map<string, UncoveredConfig>();
  for (const u of uncovered) {
    const cur = byKind.get(u.kind);
    if (!cur || u.pathLen < cur.pathLen) byKind.set(u.kind, u);
  }
  for (const u of byKind.values()) if (!chosen.has(u.configKey)) chosen.set(u.configKey, u);
  return [...chosen.values()].sort((a, b) => b.members - a.members || a.pathLen - b.pathLen);
}

function cmdEnumerate(jsonOut: string | null): void {
  const { block } = loadLevel0();
  const enr = enumerateViewCases(block, ENGINE_ENTRANCE, Infinity);
  const covered = coveredConfigKeys(block);
  const uncovered = rankUncovered(enr.distinct, covered);
  const totalViews = enr.reachable.length;
  const uncoveredViews = uncovered.reduce((a, u) => a + u.members, 0);
  const cells = new Set(enr.reachable.map((s) => `${s.gx},${s.gy}`)).size;
  const sample = pickSample(uncovered, 12);

  console.log('=== maze generation-fidelity coverage sweep (level 0) ===');
  console.log(`reachable views (cell,facing): ${totalViews}   distinct cells: ${cells}`);
  console.log(`distinct configs: ${enr.distinct.length}   covered: ${covered.size}   uncovered: ${uncovered.length}`);
  console.log(
    `coverage: ${(100 * (enr.distinct.length - uncovered.length) / enr.distinct.length).toFixed(1)}% of configs, ` +
      `${(100 * (totalViews - uncoveredViews) / totalViews).toFixed(1)}% of views\n`,
  );
  console.log(`TOP UNCOVERED configs by view-count (capture priority):`);
  for (const u of uncovered.slice(0, 25)) {
    const r = u.representative;
    console.log(
      `  views=${String(u.members).padStart(3)}  path=${String(u.pathLen).padStart(2)}  [${u.kind}]  rep=(gx${r.gx},gy${r.gy},f${r.facing})`,
    );
  }
  console.log(`\nSUGGESTED CAPTURE SAMPLE (${sample.length} configs — top-by-count ∪ one-per-kind):`);
  for (const u of sample) {
    const r = u.representative;
    console.log(`  freeroam ${r.gx} ${r.gy} ${r.facing}   # views=${u.members} [${u.kind}]`);
  }

  if (jsonOut) {
    writeFileSync(
      jsonOut,
      JSON.stringify(
        {
          entrance: ENGINE_ENTRANCE,
          totals: { views: totalViews, cells, configs: enr.distinct.length, covered: covered.size, uncovered: uncovered.length, uncoveredViews },
          uncovered,
          sample,
        },
        null,
        2,
      ),
    );
    console.log(`\n-> ${jsonOut}`);
  }
}

/** Read an engine framebuffer (.idx.gz, full 320×200 index) cropped to MAZE_VIEWPORT. */
function engineViewport(file: string): Uint8Array {
  const raw = gunzipSync(readFileSync(file));
  const full = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const { x, y, w, h } = MAZE_VIEWPORT;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out[r * w + c] = full[(y + r) * 320 + x + c]!;
  return out;
}

function cmdFidelity(oracleDir: string, jsonOut: string | null): void {
  const block = loadRenderBlock();
  const { block: keyBlock } = loadLevel0();
  const enr = enumerateViewCases(keyBlock, ENGINE_ENTRANCE, Infinity);
  const byKey = new Map(enr.distinct.map((d) => [d.configKey, d] as const));
  const assets = loadMazeAssets();
  const wb = expandMazeData(assets.mazedata);
  const N = MAZE_VIEWPORT.w * MAZE_VIEWPORT.h;

  const files = readdirSync(oracleDir)
    .map((f) => /^maze-freeroam-gx(\d+)-gy(\d+)-f(\d)\.idx\.gz$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null);

  const rows: Array<{ view: string; party: MazeParty; matchPct: number; members: number; kind: string; configKey: string }> = [];
  for (const m of files) {
    const party: MazeParty = { gx: Number(m[1]), gy: Number(m[2]), z: 0, facing: Number(m[3]) };
    const calls = generateFullCallList(block, party);
    const page = composeCallList(wb, calls);
    const ours = renderMazeViewport(block, party, assets, { page });
    const eng = engineViewport(resolve(oracleDir, m[0]));
    let match = 0;
    for (let i = 0; i < N; i++) if (ours[i] === eng[i]) match++;
    const key = viewConfigKeyFor(keyBlock, party);
    const dc = byKey.get(key);
    rows.push({
      view: `gx${party.gx}-gy${party.gy}-f${party.facing}`,
      party,
      matchPct: (100 * match) / N,
      members: dc?.members.length ?? 0,
      kind: dc?.kind ?? '(unreachable?)',
      configKey: key,
    });
  }

  rows.sort((a, b) => a.matchPct - b.matchPct);
  console.log(`=== generation fidelity vs ${rows.length} engine oracles (${oracleDir}) ===`);
  console.log(`${'view'.padEnd(20)} ${'fidelity'.padStart(8)}  ${'views'.padStart(5)}  kind`);
  for (const r of rows) {
    console.log(`${r.view.padEnd(20)} ${r.matchPct.toFixed(2).padStart(7)}%  ${String(r.members).padStart(5)}  ${r.kind}`);
  }
  if (rows.length) {
    const weightedNum = rows.reduce((a, r) => a + r.matchPct * Math.max(r.members, 1), 0);
    const weightedDen = rows.reduce((a, r) => a + Math.max(r.members, 1), 0);
    const mean = rows.reduce((a, r) => a + r.matchPct, 0) / rows.length;
    console.log(`\nunweighted mean fidelity: ${mean.toFixed(2)}%`);
    console.log(`view-count-weighted fidelity: ${(weightedNum / weightedDen).toFixed(2)}%`);
  }

  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify({ oracleDir, rows }, null, 2));
    console.log(`\n-> ${jsonOut}`);
  }
}

function main(): void {
  const mode = process.argv[2];
  const jsonIdx = process.argv.indexOf('--json');
  const jsonOut = jsonIdx >= 0 ? process.argv[jsonIdx + 1]! : null;
  if (mode === 'enumerate') {
    cmdEnumerate(jsonOut);
  } else if (mode === 'fidelity') {
    const dir = process.argv[3] && !process.argv[3].startsWith('--') ? resolve(process.argv[3]) : FIX;
    if (!existsSync(dir)) {
      console.log(`oracle dir not found: ${dir}`);
      return;
    }
    cmdFidelity(dir, jsonOut);
  } else {
    console.log('usage: maze-coverage-sweep.ts enumerate [--json <out>] | fidelity <oracleDir> [--json <out>]');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
