import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { composeDoorProgress, composeDoorResult } from '../../src/pages/game/compose-door-progress.js';
import { DOOR_STRAIN } from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(here, '../../../../tools/parity/fixtures/engine');
const SCREEN_W = 320;

// Roster used to capture the engine fixtures (THESUS trying, in slot 0).
const SLOTS = ['THESUS', 'LYSANDR', null, 'TEMPEST', null, null] as const;
const TRYING = 0;

/** Crop the full-width door-strain band (DOOR_STRAIN.band) from a 320×200 fixture. */
function loadBand(name: string): Uint8Array {
  const full = new Uint8Array(gunzipSync(readFileSync(resolve(FIX, `${name}.idx.gz`))));
  const { x, y, w, h } = DOOR_STRAIN.band;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out[r * w + c] = full[(y + r) * SCREEN_W + (x + c)]!;
  return out;
}

function diff(a: Uint8Array, b: Uint8Array, w: number): { n: number; first: string } {
  let n = 0, first = 'none';
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      n++;
      if (first === 'none') first = `idx ${i} (x${i % w},y${Math.floor(i / w)}): ours=${a[i]} eng=${b[i]}`;
    }
  }
  return { n, first };
}

const W = DOOR_STRAIN.band.w;

describe('door FORCE strain band parity', () => {
  // Green progress = the roll so far; red threshold = required (=6 here). Measured
  // from the fixtures: success green=8, failure green=4, settled strain green=8,
  // mid-anim frame1 green=4 / frame2 green=5; threshold red=6 throughout.
  it.each([
    ['maze-door-strain', 8, 6],
    ['maze-door-strain-frame1', 4, 6],
    ['maze-door-strain-frame2', 5, 6],
  ] as const)('strain frame %s renders byte-exact', (name, green, red) => {
    const ours = composeDoorProgress('strain', green, red, SLOTS, TRYING);
    const eng = loadBand(name);
    expect(ours.length).toBe(eng.length);
    const d = diff(ours, eng, W);
    expect(d.n, `${name}: ${d.n}/${ours.length} px differ; first ${d.first}`).toBe(0);
  });
});

describe('door FORCE result band parity', () => {
  it.each([
    ['maze-door-result-success', 'success', 8, 6],
    ['maze-door-result-failure', 'failure', 4, 6],
  ] as const)('result %s renders byte-exact', (name, outcome, green, red) => {
    const ours = composeDoorResult(outcome as 'success' | 'failure', green, red, SLOTS, TRYING);
    const eng = loadBand(name);
    expect(ours.length).toBe(eng.length);
    const d = diff(ours, eng, W);
    expect(d.n, `${name}: ${d.n}/${ours.length} px differ; first ${d.first}`).toBe(0);
  });
});
