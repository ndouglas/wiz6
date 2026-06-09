/**
 * validate-freeroam-fixture.ts — capture-quality check for the off-axis freeroam
 * fixtures. For each view, compose the fixture's OWN captured engine call-list
 * (composeBackgroundFromAsset) into a background page, render it through the SAME
 * wired viewport path the parity test uses, and measure self-reproduction vs the
 * committed .idx.gz.
 *
 * A SETTLED capture reproduces its own call-list ~99% (the entrance does). A
 * mid-build capture (framebuffer grabbed before the OR/masked build loop finished)
 * reproduces low (<95%) — the fixture is not ground truth and should be re-captured.
 *
 * Usage: pnpm tsx tools/libretro/validate-freeroam-fixture.ts [view...]
 *   view = gx127-gy121-f1 (defaults to all 6)
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { renderMazeViewport } from '../../packages/parser/src/maze/render.js';
import { loadMazeAssets } from '../../packages/parser/src/maze/assets.js';
import { composeCallList, type CallList } from '../../packages/parser/src/maze/callist.js';
import { expandMazeData } from '../../packages/parser/src/maze/maze-data.js';
import { MazeBlockSchema, MAZE_VIEWPORT, type MazeBlock } from '../../packages/data/src/index.js';

const ROOT = resolve(import.meta.dirname, '../..');
// Default to the committed fixtures/findings; override via env to validate a fresh
// /tmp capture dir before committing (WIZ6_FREEROAM_DIR holds maze-freeroam-*.idx.gz
// as <view>.idx.gz and <view>-callist.json — i.e. the raw `freeroam` outDir).
const RAW_DIR = process.env.WIZ6_FREEROAM_DIR ?? null;
const COMMITTED_FIX = resolve(ROOT, 'tools/parity/fixtures/engine');
const FIX = RAW_DIR ?? COMMITTED_FIX;
const FINDINGS = RAW_DIR ?? resolve(ROOT, 'docs/re/findings/maze-views');

const FRAMES = JSON.parse(readFileSync(resolve(COMMITTED_FIX, 'maze-frames.json'), 'utf8'));
const BLOCK: MazeBlock = MazeBlockSchema.parse(FRAMES.mazeBlock);
const N = MAZE_VIEWPORT.w * MAZE_VIEWPORT.h;

const ALL = [
  'gx124-gy121-f0',
  'gx124-gy121-f3',
  'gx126-gy121-f3',
  'gx127-gy121-f1',
  'gx127-gy121-f2',
  'gx127-gy122-f0',
  'gx127-gy122-f2',
  'gx127-gy122-f3',
  'gx127-gy123-f0',
  'gx127-gy123-f1',
];

function partyFromView(view: string) {
  const m = view.match(/gx(\d+)-gy(\d+)-f(\d+)/)!;
  return { gx: +m[1]!, gy: +m[2]!, z: 0, facing: +m[3]! };
}

const IDX_NAME = (view: string) => (RAW_DIR ? `${view}.idx.gz` : `maze-freeroam-${view}.idx.gz`);
const CALLIST_NAME = (view: string) => (RAW_DIR ? `${view}-callist.json` : `freeroam-${view}-callist.json`);

function engineViewport(view: string): Uint8Array {
  const raw = gunzipSync(readFileSync(resolve(FIX, IDX_NAME(view))));
  const full = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const { x, y, w, h } = MAZE_VIEWPORT;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out[r * w + c] = full[(y + r) * 320 + x + c]!;
  return out;
}

/** The fixture's OWN captured engine call-list as a CallList. */
function engineCallList(view: string): CallList {
  const j = JSON.parse(readFileSync(resolve(FINDINGS, CALLIST_NAME(view)), 'utf8'));
  const out: CallList = [];
  for (const c of j.calls as Array<{ branch: string; arg0c: number; arg10: number }>) {
    // A well-formed placement index is < 366. arg0c == 0xffff (or any out-of-range
    // value) signals a malformed / mid-build capture — skip it so the validator
    // can still measure a (low) self-repro % instead of crashing.
    if (c.arg0c >= 366 || c.arg0c < 0) continue;
    if (c.branch === 'OR') out.push({ kind: 'OR', src: c.arg0c });
    else out.push({ kind: 'masked', src: c.arg0c, dst: c.arg10, mode: 'or' });
  }
  return out;
}

function main() {
  const views = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
  const assets = loadMazeAssets();
  const wb = expandMazeData(assets.mazedata);
  for (const view of views) {
    const party = partyFromView(view);
    const calls = engineCallList(view);
    const page = composeCallList(wb, calls);
    const ours = renderMazeViewport(BLOCK, party, assets, { page });
    const eng = engineViewport(view);
    let match = 0;
    for (let i = 0; i < N; i++) if (ours[i] === eng[i]) match++;
    const pct = ((100 * match) / N).toFixed(2);
    // Verdict bands (post frame-sync fix). A frame-MATCHED capture self-reproduces
    // ≥99% for OR/masked-reproducible views. 85–99% = frame-matched but capped by a
    // DECORATION (a draw path beyond the OR/masked background compose, e.g. the
    // colourful portcullis leaf) or by the not-yet-cracked masked-mirror generation
    // law. <70% = a TRANSIENT/MID-BUILD capture whose call-list and framebuffer are
    // out of sync (the bug this harness fixed) — re-capture.
    const r = match / N;
    const verdict = r >= 0.99 ? 'GROUND TRUTH (frame-matched ≥99%)'
      : r >= 0.85 ? 'FRAME-MATCHED (residue: decoration / masked-mirror generation)'
      : r >= 0.70 ? 'PARTIAL (masked-mirror-heavy; re-capture for a cleaner pass)'
      : 'LOW — TRANSIENT/MID-BUILD (re-capture)';
    console.log(`${view}: self-repro ${match}/${N} (${pct}%) — ${verdict}  [${calls.length} calls]`);
  }
}
main();
