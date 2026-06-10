/**
 * build-viewport-oracles.ts — CAPTURE-REPLAY asset builder for faithful level-0.
 *
 * The generation path (generateFullCallList) renders the entrance cluster byte-exact
 * but degrades to 32-70% off-axis (docs/re/findings/maze-generation-fidelity-map.json).
 * Capture-replay sidesteps the un-cracked generation law: for every ENGINE-REACHABLE
 * level-0 config we commit the engine's actual viewport (the framebuffer-oracle
 * approach, #076, generalized to all 266 reachable configs) and the renderer returns
 * it verbatim when the view-config matches.
 *
 * Input:  a dir of engine framebuffer oracles (maze-freeroam-gxNN-gyNN-fF.idx.gz, full
 *         320×200 EGA-index), captured via `trace-maze.ts collmap`+`collcapture`.
 * Output: tools/parity/fixtures/engine/maze-viewport-oracles.json — { cases: [{ configKey,
 *         gx, gy, facing, viewportB64 }] } where viewportB64 = base64(gzip(176×112 idx)).
 *
 * Run: pnpm tsx tools/parity/build-viewport-oracles.ts [oracleDir]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAZE_VIEWPORT } from '../../packages/data/src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const FIX = resolve(ROOT, 'tools', 'parity', 'fixtures', 'engine');

function main(): void {
  const oracleDir = resolve(process.argv[2] ?? '/tmp/wiz6-sweep/oracles');
  const { x, y, w, h } = MAZE_VIEWPORT;
  const files = readdirSync(oracleDir)
    .map((f) => /^maze-freeroam-gx(\d+)-gy(\d+)-f(\d)\.idx\.gz$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null);

  const byKey = new Map<string, { posKey: string; gx: number; gy: number; facing: number; viewportB64: string }>();
  for (const m of files) {
    const gx = +m[1]!, gy = +m[2]!, facing = +m[3]!;
    const full = new Uint8Array(gunzipSync(readFileSync(resolve(oracleDir, m[0]))));
    const vp = new Uint8Array(w * h);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) vp[r * w + c] = full[(y + r) * 320 + x + c]!;
    // POSITION-KEYED: each reachable (gx,gy,facing) is its own oracle. No wall-geometry
    // dedup (that aliased differing decorations onto one frame — the chest<->candlestick
    // bug). Captures come from engcap (engine-truth nav), the faithful per-position source.
    const posKey = `${gx},${gy},${facing}`;
    byKey.set(posKey, { posKey, gx, gy, facing, viewportB64: Buffer.from(gzipSync(vp)).toString('base64') });
  }
  const cases = [...byKey.values()].sort((a, b) => a.gx - b.gx || a.gy - b.gy || a.facing - b.facing);
  const payload = JSON.stringify({
    _comment: 'CAPTURE-REPLAY viewport oracles for faithful level-0 (one engine viewport per reachable (gx,gy,facing) position; keyed by posKey). viewportB64 = base64(gzip(176x112 EGA-index)). Built by tools/parity/build-viewport-oracles.ts from engcap engine-truth captures.',
    viewport: MAZE_VIEWPORT,
    cases,
  });
  // (1) parity-test fixture copy; (2) the viewer asset (extracted/ is the Vite publicDir).
  const fixOut = resolve(FIX, 'maze-viewport-oracles.json');
  const viewerOut = resolve(ROOT, 'extracted', 'maze', 'viewport-oracles.json');
  writeFileSync(fixOut, payload);
  writeFileSync(viewerOut, payload);
  console.log(`build-viewport-oracles: ${files.length} oracles -> ${cases.length} distinct-config viewports -> ${fixOut} + ${viewerOut}`);
}

main();
