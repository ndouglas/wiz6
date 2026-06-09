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
const FIX = resolve(ROOT, 'tools/parity/fixtures/engine');
const FINDINGS = resolve(ROOT, 'docs/re/findings/maze-views');

const FRAMES = JSON.parse(readFileSync(resolve(FIX, 'maze-frames.json'), 'utf8'));
const BLOCK: MazeBlock = MazeBlockSchema.parse(FRAMES.mazeBlock);
const N = MAZE_VIEWPORT.w * MAZE_VIEWPORT.h;

const ALL = [
  'gx124-gy121-f0',
  'gx124-gy121-f3',
  'gx126-gy121-f3',
  'gx127-gy121-f1',
  'gx127-gy122-f3',
  'gx127-gy123-f1',
];

function partyFromView(view: string) {
  const m = view.match(/gx(\d+)-gy(\d+)-f(\d+)/)!;
  return { gx: +m[1]!, gy: +m[2]!, z: 0, facing: +m[3]! };
}

function engineViewport(view: string): Uint8Array {
  const raw = gunzipSync(readFileSync(resolve(FIX, `maze-freeroam-${view}.idx.gz`)));
  const full = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const { x, y, w, h } = MAZE_VIEWPORT;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out[r * w + c] = full[(y + r) * 320 + x + c]!;
  return out;
}

/** The fixture's OWN captured engine call-list as a CallList. */
function engineCallList(view: string): CallList {
  const j = JSON.parse(readFileSync(resolve(FINDINGS, `freeroam-${view}-callist.json`), 'utf8'));
  const out: CallList = [];
  for (const c of j.calls as Array<{ branch: string; arg0c: number; arg10: number }>) {
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
    const verdict = match / N >= 0.95 ? 'SETTLED (good ground truth)' : 'LOW — likely MID-BUILD';
    console.log(`${view}: self-repro ${match}/${N} (${pct}%) — ${verdict}  [${calls.length} calls]`);
  }
}
main();
