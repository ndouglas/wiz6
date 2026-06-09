/**
 * analyze-masked-gap.ts — per-view DIFF of the engine's PLACED placement set + the
 * masked src→dst pairs vs generateFullCallList's output, plus the wired-path pixel
 * parity (generated vs framebuffer) AND the captured-call-list self-repro CEILING.
 *
 * Usage: pnpm tsx tools/libretro/analyze-masked-gap.ts [view...]
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateFullCallList,
  composeCallList,
  type CallList,
} from '../../packages/parser/src/maze/callist.js';
import { renderMazeViewport } from '../../packages/parser/src/maze/render.js';
import { loadMazeAssets } from '../../packages/parser/src/maze/assets.js';
import { expandMazeData, maskedMirrorFor } from '../../packages/parser/src/maze/maze-data.js';
import { applyMaskedMirror, composeBackground } from '../../packages/parser/src/maze/background.js';
import { orPlacementFor } from '../../packages/parser/src/maze/maze-data.js';
import { loadLevel0 } from '../parity/maze-view-cases.js';

type MazeBlock = ReturnType<typeof loadLevel0>['block'];
type MazeParty = { gx: number; gy: number; z: number; facing: number };

const MAZE_VIEWPORT = { x: 72, y: 32, w: 176, h: 112 } as const;
const PLANE_STRIDE = 0x2000;

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../..');
const FIX = resolve(ROOT, 'tools/parity/fixtures/engine');
const FINDINGS = resolve(ROOT, 'docs/re/findings/maze-views');

const BLOCK: MazeBlock = loadLevel0().block;
const N = MAZE_VIEWPORT.w * MAZE_VIEWPORT.h;

interface EngineCall { branch: 'OR' | 'masked'; arg0c: number; arg10: number }

const ALL_VIEWS: Record<string, MazeParty> = {
  'gx124-gy121-f0': { gx: 124, gy: 121, z: 0, facing: 0 },
  'gx124-gy121-f3': { gx: 124, gy: 121, z: 0, facing: 3 },
  'gx126-gy121-f3': { gx: 126, gy: 121, z: 0, facing: 3 },
  'gx127-gy121-f1': { gx: 127, gy: 121, z: 0, facing: 1 },
  'gx127-gy121-f2': { gx: 127, gy: 121, z: 0, facing: 2 },
  'gx127-gy122-f0': { gx: 127, gy: 122, z: 0, facing: 0 },
  'gx127-gy122-f2': { gx: 127, gy: 122, z: 0, facing: 2 },
  'gx127-gy122-f3': { gx: 127, gy: 122, z: 0, facing: 3 },
  'gx127-gy123-f0': { gx: 127, gy: 123, z: 0, facing: 0 },
  'gx127-gy123-f1': { gx: 127, gy: 123, z: 0, facing: 1 },
};

function engineViewport(view: string): Uint8Array {
  const raw = gunzipSync(readFileSync(resolve(FIX, `maze-freeroam-${view}.idx.gz`)));
  const full = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const { x, y, w, h } = MAZE_VIEWPORT;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out[r * w + c] = full[(y + r) * 320 + x + c]!;
  return out;
}

function loadEngineCalls(view: string): EngineCall[] {
  const j = JSON.parse(readFileSync(resolve(FINDINGS, `freeroam-${view}-callist.json`), 'utf8'));
  // De-dup the repeated passes: take the first contiguous pass (calls[]).
  return (j.calls ?? []) as EngineCall[];
}

function placedSet(calls: { kind?: string; branch?: string; src?: number; arg0c?: number; dst?: number; arg10?: number }[]): Set<number> {
  const s = new Set<number>();
  for (const c of calls) {
    if ('branch' in c && c.branch !== undefined) {
      if (c.branch === 'OR') s.add(c.arg0c!);
      else s.add(c.arg10!);
    } else {
      if (c.kind === 'OR') s.add(c.src!);
      else s.add(c.dst!);
    }
  }
  return s;
}

function composeEngine(wb: ReturnType<typeof expandMazeData>, calls: EngineCall[]): Uint8Array {
  const page = new Uint8Array(4 * PLANE_STRIDE);
  for (const c of calls) {
    if (c.branch === 'OR') composeBackground(page, [orPlacementFor(wb, c.arg0c)]);
    else applyMaskedMirror(page, maskedMirrorFor(wb, c.arg0c, c.arg10, 'or'));
  }
  return page;
}

function pixelMatch(a: Uint8Array, b: Uint8Array): number {
  let m = 0;
  for (let i = 0; i < N; i++) if (a[i] === b[i]) m++;
  return m;
}

function main() {
  const assets = loadMazeAssets();
  const wb = expandMazeData(assets.mazedata);
  const views = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ALL_VIEWS);
  for (const view of views) {
    const party = ALL_VIEWS[view]!;
    const eng = engineViewport(view);
    const engCalls = loadEngineCalls(view);
    const engPlaced = placedSet(engCalls);
    const engMaskedPairs = engCalls.filter((c) => c.branch === 'masked').map((c) => `${c.arg0c}->${c.arg10}`);
    const engOR = engCalls.filter((c) => c.branch === 'OR').map((c) => c.arg0c).sort((a, b) => a - b);

    const gen: CallList = generateFullCallList(BLOCK, party);
    const genPlaced = placedSet(gen);
    const genMaskedPairs = gen.filter((c) => c.kind === 'masked').map((c) => `${(c as any).src}->${(c as any).dst}`);
    const genOR = gen.filter((c) => c.kind === 'OR').map((c) => (c as any).src).sort((a, b) => a - b);

    // parity
    const parity = (party.gx + party.gy + party.facing) % 2;

    // pixel parity (wired path) + ceiling
    const genPage = composeCallList(wb, gen);
    const genVp = renderMazeViewport(BLOCK, party, assets, { page: genPage });
    const genMatch = pixelMatch(genVp, eng);

    const engPage = composeEngine(wb, engCalls);
    const engVp = renderMazeViewport(BLOCK, party, assets, { page: engPage });
    const ceilMatch = pixelMatch(engVp, eng);

    const missing = [...engPlaced].filter((x) => !genPlaced.has(x)).sort((a, b) => a - b);
    const spurious = [...genPlaced].filter((x) => !engPlaced.has(x)).sort((a, b) => a - b);

    console.log(`\n========== ${view}  (parity ${parity === 0 ? 'EVEN' : 'ODD'}) ==========`);
    console.log(`GEN  pixel: ${genMatch}/${N} = ${(100 * genMatch / N).toFixed(2)}%`);
    console.log(`CEIL pixel: ${ceilMatch}/${N} = ${(100 * ceilMatch / N).toFixed(2)}% (engine call-list self-repro)`);
    console.log(`engine PLACED (${engPlaced.size}): [${[...engPlaced].sort((a, b) => a - b).join(',')}]`);
    console.log(`gen    PLACED (${genPlaced.size}): [${[...genPlaced].sort((a, b) => a - b).join(',')}]`);
    console.log(`MISSING (engine-placed, gen-absent): [${missing.join(',')}]`);
    console.log(`SPURIOUS (gen-placed, engine-absent): [${spurious.join(',')}]`);
    console.log(`engine OR: [${engOR.join(',')}]   gen OR: [${genOR.join(',')}]`);
    console.log(`engine masked pairs (${engMaskedPairs.length}): ${engMaskedPairs.join(' ')}`);
    console.log(`gen    masked pairs (${genMaskedPairs.length}): ${genMaskedPairs.join(' ')}`);
  }
}
main();
