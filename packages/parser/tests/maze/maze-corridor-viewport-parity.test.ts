/**
 * maze-corridor-viewport-parity.test.ts — the FIRST 100% full-viewport byte-exact
 * maze gate (gate-tier: `.test.ts`, runs in default CI).
 *
 * Frame: maze-corridor (zone-0 first-person corridor, facing 0, gx=127 gy=121) —
 * the green-portcullis-down-the-corridor view. This frame is PURE OR-blit
 * BACKGROUND: it has ZERO wt=2 wall REPLACE spans (the parser classify emits 0
 * spans for facing 0, matching the engine — confirmed in maze-frames.json
 * wt2_depthFields=[]). So reproducing its background page IS its entire viewport.
 *
 * ── WHAT IS GATED (100%, tolerance 0) ──
 * The full parser render pipeline (renderMazeViewport: background page → wall
 * compositor → decodePageIndex → viewport crop) reproduces the committed engine
 * oracle (maze-corridor.idx.gz) over the WHOLE 176×112 viewport, byte-exact.
 *
 * ── THE BACKGROUND SOURCE (deterministic, engine-anchored, no live capture) ──
 * The background is the ENGINE'S OWN composed OR-blit page, read deterministically
 * from the committed serialize-state (tools/libretro/states/maze-corridor.state)
 * at the settled frame — the compose page lives at guest-phys 0x3ffc0 (page seg
 * 0x3ffc; located + verified by tools/libretro/maze-corridor-find-page.ts, base
 * stable across runs, viewport decode 100.000% vs the oracle). It is committed
 * gzipped as fixtures/engine/maze-corridor-background.bin.gz (4-plane EGA page,
 * plane stride 0x2000, 40 B/row). The page is the engine's actual OR-blit output
 * for this frame (the floor/ceiling/side-panels/portcullis-window composite).
 *
 * ── WHY NOT composeBackground(decoded-on-disk-assets, placement-records) ──
 * The from-on-disk-asset route (decode floor id 1346 / ceiling 1740 / window via
 * the .pic RLE decoder + read the cs:[0x190]/cs:[0x18e] placement tables) is NOT
 * yet attainable and was independently re-confirmed BLOCKED this pass:
 *   - The placement/descriptor tables are TRANSIENT — populated by the caller at
 *     OR-blit invocation and NOT persisted in the settled state. On the nightly
 *     core (the only core that loads the committed gy=121 state) the resident
 *     ega.drv OR-blit code copy holds its cs:[0x149]/[0x14d]/[0x18e]/[0x190] data
 *     words at the RAW (unrelocated) disk values → garbage placement records; NO
 *     resident copy carries the page-seg fingerprint cs:[0x14d]=0x3ffc. Verified
 *     by tools/libretro/maze-corridor-{scan,find-tables,dump-tables}.ts.
 *   - The patched trace core (which CAN trace the live OR-blit) cannot unserialize
 *     the committed state (DBPSerialize_CPU layout divergence → `err unser`).
 *   - The on-disk floor/ceiling/window assets are wroot asset-DB images loaded via
 *     the disk.hdr-keyed asset/decompress loader — that load+decompress + the
 *     asset-block→work-buffer mapping is NOT reversed (no by-id decoder exists).
 * See docs/re/findings/maze-background-fromasset.json for the full evidence.
 *
 * This gate therefore locks the END-TO-END render pipeline + the background→
 * viewport→palette mapping byte-exact, from a committed engine-sourced background
 * page. Promoting it to a FROM-ASSET composeBackground gate is tracked work (the
 * placement-list generator) — the algorithm (background.ts composeBackground) is
 * already gated byte-exact by background.test.ts + the engine 99.93% same-run pair.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { renderMazeViewport } from '../../src/maze/render.js';
import { loadMazeAssets } from '../../src/maze/assets.js';
import { loadMazeCorridorBackgroundPage } from '../../src/maze/assets-node.js';
import {
  MazeBlockSchema,
  type MazeBlock,
  type MazeParty,
  MAZE_VIEWPORT,
} from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../..');
const FIX = resolve(ROOT, 'tools/parity/fixtures/engine');

const FRAMES = JSON.parse(
  readFileSync(resolve(FIX, 'maze-frames.json'), 'utf8'),
);
const BLOCK: MazeBlock = MazeBlockSchema.parse(FRAMES.mazeBlock);
const CORRIDOR: MazeParty = FRAMES.classifyFrames.frames.find(
  (f: { name: string }) => f.name === 'maze-corridor',
).party;

/** The committed engine framebuffer oracle, cropped to the maze viewport rect. */
function engineViewport(): Uint8Array {
  const raw = gunzipSync(readFileSync(resolve(FIX, 'maze-corridor.idx.gz')));
  const full = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const { x, y, w, h } = MAZE_VIEWPORT;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) out[r * w + c] = full[(y + r) * 320 + x + c]!;
  return out;
}

describe('maze-corridor full-viewport parity (GATE — first 100% byte-exact)', () => {
  const assets = loadMazeAssets();
  const page = loadMazeCorridorBackgroundPage();
  const eng = engineViewport();
  const N = MAZE_VIEWPORT.w * MAZE_VIEWPORT.h;

  it('fixtures have the expected shapes', () => {
    expect(page.length).toBe(0x8000);
    expect(eng.length).toBe(N);
  });

  it('renders the full 176×112 viewport BYTE-EXACT vs the engine oracle (tolerance 0 = 100%)', () => {
    const ours = renderMazeViewport(BLOCK, CORRIDOR, assets, { page });
    expect(ours.length).toBe(N);

    let match = 0;
    const diffs: string[] = [];
    for (let i = 0; i < N; i++) {
      if (ours[i] === eng[i]) match++;
      else if (diffs.length < 20) {
        const x = MAZE_VIEWPORT.x + (i % MAZE_VIEWPORT.w);
        const y = MAZE_VIEWPORT.y + Math.floor(i / MAZE_VIEWPORT.w);
        diffs.push(`(${x},${y}) got=${ours[i]} want=${eng[i]}`);
      }
    }
    const pct = (100 * match) / N;
    if (pct < 100) console.error(`viewport ${match}/${N} = ${pct.toFixed(4)}%  diffs: ${diffs.join('  ')}`);
    // The first 100% full-viewport gate. tolerance 0.
    expect(match).toBe(N);
  });

  it('this frame is pure background — the wall compositor adds nothing on top', () => {
    // Sanity: rendering with the SAME page but no wall spans (facing-0 emits 0
    // spans) must equal decoding the page alone. Confirms the 100% is the
    // background, not coincidental wall overwrite.
    const withWalls = renderMazeViewport(BLOCK, CORRIDOR, assets, { page });
    // Independent decode of the page viewport.
    const PS = 0x2000, ROWB = 40;
    const { x, y, w, h } = MAZE_VIEWPORT;
    const decoded = new Uint8Array(w * h);
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) {
        const px = x + c, py = y + r;
        const off = py * ROWB + (px >> 3);
        const bit = 7 - (px & 7);
        let v = 0;
        for (let p = 0; p < 4; p++) v |= ((page[off + p * PS]! >> bit) & 1) << p;
        decoded[r * w + c] = v;
      }
    expect(withWalls).toEqual(decoded);
  });
});
