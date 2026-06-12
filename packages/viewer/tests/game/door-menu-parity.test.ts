import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { composeDoorMenu } from '../../src/pages/game/compose-door-menu.js';
import { DOOR_MENU } from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(here, '../../../../tools/parity/fixtures/engine');
const SCREEN_W = 320;

function loadStrip(name: string): Uint8Array {
  const full = new Uint8Array(gunzipSync(readFileSync(resolve(FIX, `${name}.idx.gz`))));
  const { x, y, w, h } = DOOR_MENU.strip;
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

const CASES = [
  ['force', 0],
  ['pick', 1],
  ['exit', 2],
] as const;

describe('door menu parity', () => {
  it.each(CASES)('renders cursor-on-%s byte-exact', (name, cursorIdx) => {
    const ours = composeDoorMenu(cursorIdx);
    const eng = loadStrip(`maze-door-menu-${name}`);
    expect(ours.length).toBe(eng.length);
    const d = diff(ours, eng, DOOR_MENU.strip.w);
    expect(d.n, `${name}: ${d.n}/${ours.length} px differ; first ${d.first}`).toBe(0);
  });
});
