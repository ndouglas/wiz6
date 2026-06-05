/**
 * maze-corridor-fromasset-parity.diagnostic.test.ts — FROM-ASSET background of the
 * gy=121 ORACLE frame (INFORMATIONAL diagnostic, NOT a gate — excluded from default
 * CI; runnable via `pnpm test:diagnostics`).
 *
 * Composes the maze-corridor background ENTIRELY FROM DISK ASSETS:
 *   mazedata.ega -> expandMazeData (byte-exact static placement records + 4-plane
 *   sub-images) + the committed gy=121 BLIT CALL list (captured live at ega.drv
 *   FUN_0a93 via the patched trace core; reproducible byte-identical) -> the OR-blit
 *   walk (composeBackground) + the masked-MIRROR walk (applyMaskedMirror) -> decode
 *   -> crop to the viewport, compared to the SAME committed oracle the 100% gate
 *   uses (tools/parity/fixtures/engine/maze-corridor.idx.gz, gx=127 gy=121 facing0).
 *
 * ── RESULT: 99.909% (19694/19712), residual = 18px deep-door-center detail ──
 * The committed gy=121 call list (src/maze/__fixtures__/maze-corridor-callist-gy121.json)
 * composes to 99.909% of the oracle viewport. The 18px residual is the door-leaf
 * detail at the corridor vanishing point (viewport x86..90, y36..44 / page bx19..20,
 * y68..76). It is NOT representable by adding any static mazedata.ega placement
 * (exhaustively verified: no OR/masked/REPLACE addition of any of the 366 records
 * reduces the page diff below 26 bytes) — the deep-door detail comes from a draw
 * path beyond the OR/masked background blit, not yet reversed. Tracked in TODO.
 *
 * ── WHY DIAGNOSTIC (not the 100% gate) ──
 * The 100% byte-exact gate is maze-corridor-viewport-parity.test.ts, which uses the
 * ENGINE'S OWN composed background page. This diagnostic validates the FROM-ASSET
 * path (expandMazeData byte-exact -> composeBackground + applyMaskedMirror over the
 * captured per-view call list) against the SAME oracle, at the achieved 99.909% —
 * the closest from-disk-asset reproduction. The masked GEOMETRY itself is the
 * byte-exact gate (maze-masked-mirror-parity.test.ts). Full RE:
 * docs/re/findings/maze-callist-generation.json + maze-masked-mirror.json.
 *
 * ── REMAINING for a 100% FROM-ASSET gate ──
 *   (a) the deep-door detail draw path (the 18px), and
 *   (b) GENERATING the call list from (zone,facing,geometry) rather than capturing
 *       it per frame (the wmaze view-loop selection law — partially reversed).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { composeBackgroundFromAsset, type CallList } from '../../src/maze/callist.js';
import { expandMazeData } from '../../src/maze/maze-data.js';
import { PLANE_STRIDE, PAGE_ROW_BYTES, MAZE_VIEWPORT } from '@wiz6/data';
import GY121 from '../../src/maze/__fixtures__/maze-corridor-callist-gy121.json' with { type: 'json' };

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../..');

const CALLS: CallList = (GY121.calls as Array<Record<string, unknown>>).map((c) =>
  c.kind === 'OR'
    ? { kind: 'OR', src: c.src as number }
    : {
        kind: 'masked',
        src: c.src as number,
        dst: c.dst as number,
        mode: c.mode as 'or' | 'replace',
      },
);

function loadMazeData(): Uint8Array {
  return new Uint8Array(readFileSync(resolve(ROOT, 'test-fixtures/original/mazedata.ega')));
}

function engineViewport(): Uint8Array {
  const raw = gunzipSync(readFileSync(resolve(ROOT, 'tools/parity/fixtures/engine/maze-corridor.idx.gz')));
  const full = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const { x, y, w, h } = MAZE_VIEWPORT;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out[r * w + c] = full[(y + r) * 320 + x + c]!;
  return out;
}

function decodeViewport(page: Uint8Array): Uint8Array {
  const { x, y, w, h } = MAZE_VIEWPORT;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const px = x + c, py = y + r;
    const off = py * PAGE_ROW_BYTES + (px >> 3);
    const bit = 7 - (px & 7);
    let v = 0;
    for (let p = 0; p < 4; p++) v |= ((page[off + p * PLANE_STRIDE]! >> bit) & 1) << p;
    out[r * w + c] = v;
  }
  return out;
}

describe('maze-corridor from-asset background (DIAGNOSTIC — gy=121 oracle frame)', () => {
  const file = loadMazeData();
  const wb = expandMazeData(file);

  it('expander records are byte-exact for the captured selection', () => {
    expect(wb.placements[122]!).toEqual({ imgIdx: 44, destX: 11, destRow: 32, bias: 0, count: 18 });
    expect(wb.descs[wb.placements[122]!.imgIdx]!).toEqual({ segDelta: 0x822, srcOffLow: 0xb, w: 18, h: 7 });
    expect(wb.descs[wb.placements[15]!.imgIdx]!).toEqual({ segDelta: 0x253, srcOffLow: 0xf, w: 4, h: 112 });
  });

  it('the gy=121 call list composes a valid from-asset background (OR + masked)', () => {
    const page = composeBackgroundFromAsset(file, CALLS);
    // Sanity: the compose writes the ceiling row (page byte 12, y32, plane3).
    expect(page[3 * PLANE_STRIDE + 32 * PAGE_ROW_BYTES + 12]).toBeGreaterThan(0);
  });

  it('reports the from-asset reproduction vs the gy=121 oracle (99.909%, 18px door residual)', () => {
    const ours = decodeViewport(composeBackgroundFromAsset(file, CALLS));
    const eng = engineViewport();
    const N = MAZE_VIEWPORT.w * MAZE_VIEWPORT.h;
    let match = 0;
    for (let i = 0; i < N; i++) if (ours[i] === eng[i]) match++;
    const pct = (100 * match) / N;
    // The from-asset path reaches 99.909% of the gy=121 oracle. The residual is the
    // deep-door-center detail (a draw path beyond the OR/masked blit). This floor
    // locks the from-asset path against regressions; the 100% gate is the
    // engine-page maze-corridor-viewport-parity.test.ts. Do NOT relax this floor.
    expect(pct).toBeGreaterThanOrEqual(99.9);
    expect(match).toBe(19694);
  });
});
