/**
 * newgame-oracle.test.ts — GATE tests for the scripted-entry oracle viewport.
 *
 * Two classes of assertions:
 *
 * (A) oracleViewportForGy unit tests — verifies the pure function returns the
 *     correct buffer per gy and correctly returns null for out-of-range gy or
 *     entryMode='free'.
 *
 * (B) Byte-equality: the base64 buffer in the committed newgame-viewports.json
 *     asset is byte-for-byte identical to the MAZE_VIEWPORT slice of the
 *     corresponding engine fixture (newgame-seq-0N.idx.gz). This proves the
 *     oracle is faithful to the committed engine pixels.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAZE_VIEWPORT } from '@wiz6/data';
import { oracleViewportForGy, type NewgameViewports } from '../../src/maze/newgame-oracle.js';
import type { EntryMode } from '../../src/maze/entry-sequence.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const FIX = resolve(ROOT, 'tools/parity/fixtures/engine');
const EXTRACTED = resolve(ROOT, 'extracted/maze');

/** Slice MAZE_VIEWPORT from a 64000-byte full-screen index buffer. */
function sliceViewport(full: Uint8Array): Uint8Array {
  const { x, y, w, h } = MAZE_VIEWPORT;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++)
      out[r * w + c] = full[(y + r) * 320 + (x + c)]!;
  return out;
}

/** Load + decode the committed newgame-viewports.json. */
function loadViewports(): NewgameViewports {
  const data = JSON.parse(
    readFileSync(resolve(EXTRACTED, 'newgame-viewports.json'), 'utf8'),
  ) as Record<string, string>;
  const out: NewgameViewports = {};
  for (const [key, val] of Object.entries(data)) {
    out[Number(key)] = Uint8Array.from(atob(val), (c) => c.charCodeAt(0));
  }
  return out;
}

/** Read + gunzip an engine fixture, return 64000-byte index buffer. */
function loadFixture(name: string): Uint8Array {
  const raw = gunzipSync(readFileSync(resolve(FIX, name)));
  return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
}

const SCRIPTED_GYS = [117, 118, 119, 120, 121] as const;

const FIXTURE_FOR_GY: Record<number, string> = {
  117: 'newgame-seq-02-entering-title.idx.gz',
  118: 'newgame-seq-03-narration.idx.gz',
  119: 'newgame-seq-04-walk-gy119.idx.gz',
  120: 'newgame-seq-05-walk-gy120.idx.gz',
  121: 'newgame-seq-06-walk-gy121-hmmm.idx.gz',
};

describe('oracleViewportForGy — unit tests', () => {
  const viewports = loadViewports();

  it('returns a 176×112 buffer for each scripted gy during scripted entry modes', () => {
    const SCRIPTED_MODES: EntryMode[] = ['title', 'narration', 'gate-walk', 'bump'];
    for (const gy of SCRIPTED_GYS) {
      for (const mode of SCRIPTED_MODES) {
        const buf = oracleViewportForGy(viewports, gy, mode);
        expect(buf, `gy=${gy} mode=${mode}`).not.toBeNull();
        expect(buf!.length, `gy=${gy} mode=${mode} size`).toBe(MAZE_VIEWPORT.w * MAZE_VIEWPORT.h);
      }
    }
  });

  it('returns null for entryMode=free regardless of gy', () => {
    for (const gy of SCRIPTED_GYS) {
      expect(oracleViewportForGy(viewports, gy, 'free')).toBeNull();
    }
  });

  it('returns null for a non-scripted gy', () => {
    expect(oracleViewportForGy(viewports, 100, 'gate-walk')).toBeNull();
    expect(oracleViewportForGy(viewports, 122, 'narration')).toBeNull();
  });

  it('returns null when viewports is null', () => {
    expect(oracleViewportForGy(null, 117, 'title')).toBeNull();
  });
});

describe('oracleViewportForGy — byte-equality vs engine fixture viewport slices', () => {
  const viewports = loadViewports();

  for (const gy of SCRIPTED_GYS) {
    it(`gy=${gy} oracle === MAZE_VIEWPORT slice of ${FIXTURE_FOR_GY[gy]}`, () => {
      const oracle = oracleViewportForGy(viewports, gy, 'title');
      expect(oracle).not.toBeNull();

      const full = loadFixture(FIXTURE_FOR_GY[gy]!);
      expect(full.length, 'fixture size').toBe(320 * 200);

      const expected = sliceViewport(full);
      expect(oracle!.length, 'oracle buffer size').toBe(expected.length);

      let mismatches = 0;
      let firstDiff: string | null = null;
      for (let i = 0; i < expected.length; i++) {
        if (oracle![i] !== expected[i]) {
          mismatches++;
          if (firstDiff === null) {
            const vx = i % MAZE_VIEWPORT.w;
            const vy = Math.floor(i / MAZE_VIEWPORT.w);
            firstDiff = `viewport(${vx},${vy}) oracle=${oracle![i]} fixture=${expected[i]}`;
          }
        }
      }
      expect(
        mismatches,
        `gy=${gy}: ${mismatches}/${expected.length} bytes differ; first: ${firstDiff}`,
      ).toBe(0);
    });
  }
});
