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
 *
 * --merge: load the EXISTING committed extracted/maze/viewport-oracles.json into a
 *   posKey->case map, then ADD ONLY cases whose posKey is not already present (new
 *   interior posKeys past a forced door). Every committed entrance case stays
 *   byte-identical (taken verbatim from the JSON); re-captured entrance frames in
 *   the input dir are skipped. Without the flag, the original full-rebuild runs.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAZE_VIEWPORT } from '../../packages/data/src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const FIX = resolve(ROOT, 'tools', 'parity', 'fixtures', 'engine');

type OracleCase = { posKey: string; gx: number; gy: number; facing: number; viewportB64: string };

function main(): void {
  const args = process.argv.slice(2);
  const merge = args.includes('--merge');
  const oracleDir = resolve(args.find((a) => !a.startsWith('--')) ?? '/tmp/wiz6-sweep/oracles');
  const { x, y, w, h } = MAZE_VIEWPORT;
  const files = readdirSync(oracleDir)
    .map((f) => /^maze-freeroam-gx(\d+)-gy(\d+)-f(\d)\.idx\.gz$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null);

  const viewerOutPath = resolve(ROOT, 'extracted', 'maze', 'viewport-oracles.json');

  const byKey = new Map<string, OracleCase>();
  let existingCount = 0;
  if (merge) {
    // Seed from the committed asset so existing posKeys are taken VERBATIM (entrance
    // cases stay byte-identical) and new input posKeys are skipped if already present.
    const existing = JSON.parse(readFileSync(viewerOutPath, 'utf8')) as { cases: OracleCase[] };
    for (const c of existing.cases) byKey.set(c.posKey, c);
    existingCount = byKey.size;
  }

  let added = 0;
  for (const m of files) {
    const gx = +m[1]!, gy = +m[2]!, facing = +m[3]!;
    // POSITION-KEYED: each reachable (gx,gy,facing) is its own oracle. No wall-geometry
    // dedup (that aliased differing decorations onto one frame — the chest<->candlestick
    // bug). Captures come from engcap (engine-truth nav), the faithful per-position source.
    const posKey = `${gx},${gy},${facing}`;
    // In --merge mode, only ADD new (interior) posKeys; never overwrite a committed case.
    if (merge && byKey.has(posKey)) continue;
    const full = new Uint8Array(gunzipSync(readFileSync(resolve(oracleDir, m[0]))));
    const vp = new Uint8Array(w * h);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) vp[r * w + c] = full[(y + r) * 320 + x + c]!;
    byKey.set(posKey, { posKey, gx, gy, facing, viewportB64: Buffer.from(gzipSync(vp)).toString('base64') });
    added++;
  }
  const cases = [...byKey.values()].sort((a, b) => a.gx - b.gx || a.gy - b.gy || a.facing - b.facing);
  const payload = JSON.stringify({
    _comment: 'CAPTURE-REPLAY viewport oracles for faithful level-0 (one engine viewport per reachable (gx,gy,facing) position; keyed by posKey). viewportB64 = base64(gzip(176x112 EGA-index)). Built by tools/parity/build-viewport-oracles.ts from engcap engine-truth captures.',
    viewport: MAZE_VIEWPORT,
    cases,
  });
  // (1) parity-test fixture copy; (2) the viewer asset (extracted/ is the Vite publicDir).
  const fixOut = resolve(FIX, 'maze-viewport-oracles.json');
  const viewerOut = viewerOutPath;
  writeFileSync(fixOut, payload);
  writeFileSync(viewerOut, payload);
  if (merge) {
    console.log(
      `build-viewport-oracles --merge: existing ${existingCount} + ${added} new interior = ${cases.length} total -> ${fixOut} + ${viewerOut}`,
    );
  } else {
    console.log(`build-viewport-oracles: ${files.length} oracles -> ${cases.length} distinct-config viewports -> ${fixOut} + ${viewerOut}`);
  }
}

main();
